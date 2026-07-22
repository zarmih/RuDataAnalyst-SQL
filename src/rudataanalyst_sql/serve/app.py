from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3
import os
import time
from pathlib import Path
from fastapi.responses import HTMLResponse

from src.rudataanalyst_sql.serve.model_worker import ModelWorker
from src.rudataanalyst_sql.serve.sql_guardrails import check_hallucination_and_safety
from src.rudataanalyst_sql.serve.registry import list_registered_schemas, inspect_schema, get_registry_dir

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_DIR = PROJECT_ROOT / "data" / "databases"
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="RuDataAnalyst-SQL Local Demo")

# Serve static files for UI
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

def get_built_in_domains():
    if not DB_DIR.exists():
        return []
    return [p.stem for p in DB_DIR.glob("*.sqlite")]

def get_allowed_domains():
    built_in = get_built_in_domains()
    registered = [s["id"] for s in list_registered_schemas()]
    return built_in + registered

class GenerateRequest(BaseModel):
    domain: str
    question: str
    
    model_config = {
        "extra": "forbid"
    }

@app.get("/")
def read_root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return {"message": "UI not found, see /docs for API."}

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": ModelWorker._instance is not None and ModelWorker._instance.model is not None}

@app.get("/v1/domains")
def list_domains():
    built_in = get_built_in_domains()
    registered = [s["id"] for s in list_registered_schemas()]
    return {
        "domains": built_in + registered,
        "built_in": built_in,
        "managed": registered
    }

def get_schema_for_domain(domain: str) -> str:
    if domain in get_built_in_domains():
        db_path = DB_DIR / f"{domain}.sqlite"
        if not db_path.exists():
            raise HTTPException(status_code=400, detail="domain_not_found")
        uri = f"file:{db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=2.0)
        cursor = conn.cursor()
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = cursor.fetchall()
        conn.close()
        return "\n".join(t[0] for t in tables if t[0])
    
    try:
        manifest = inspect_schema(domain)
        return manifest["schema_sql"]
    except Exception:
        raise HTTPException(status_code=400, detail="domain_not_found")

def get_db_path_for_domain(domain: str) -> str:
    if domain in get_built_in_domains():
        return str(DB_DIR / f"{domain}.sqlite")
    return str(get_registry_dir() / domain / "database.sqlite")

@app.post("/v1/sql/generate")
def generate_sql(req: GenerateRequest):
    if req.domain not in get_allowed_domains():
        raise HTTPException(status_code=400, detail="domain_not_found")
        
    schema_sql = get_schema_for_domain(req.domain)
    worker = ModelWorker.get_instance()
    
    parsed = worker.generate(req.question, schema_sql)
    sql = parsed.get("sql", "")
    
    db_path = get_db_path_for_domain(req.domain)
    is_safe, is_hallucinated, error_msg = check_hallucination_and_safety(sql, db_path)
    
    return {
        "sql": sql,
        "explanation": parsed.get("explanation_ru", ""),
        "assumptions": parsed.get("assumptions", []),
        "confidence": parsed.get("confidence", "low"),
        "is_safe": is_safe,
        "is_hallucinated": is_hallucinated,
        "error": error_msg,
        "latency": parsed.get("latency", 0)
    }

@app.post("/v1/sql/query")
def execute_query(req: GenerateRequest):
    gen_result = generate_sql(req)
    sql = gen_result["sql"]
    
    if not gen_result["is_safe"] or gen_result["is_hallucinated"]:
        return {
            "generate_result": gen_result,
            "query_result": None,
            "query_error": "unsafe_sql" if not gen_result["is_safe"] else "schema_hallucination"
        }
        
    db_path = get_db_path_for_domain(req.domain)
    uri = f"file:{db_path}?mode=ro"
    
    try:
        conn = sqlite3.connect(uri, uri=True, timeout=2.0)
        conn.execute("PRAGMA query_only = ON;")
        cursor = conn.execute(sql)
        
        # Limit rows to 50 for preview
        rows = cursor.fetchmany(50)
        columns = [description[0] for description in cursor.description] if cursor.description else []
        conn.close()
        
        return {
            "generate_result": gen_result,
            "query_result": {"columns": columns, "rows": rows},
            "query_error": None
        }
    except sqlite3.OperationalError as e:
        if "interrupted" in str(e).lower() or "timeout" in str(e).lower():
            err_code = "query_timeout"
        else:
            err_code = str(e)
        return {
            "generate_result": gen_result,
            "query_result": None,
            "query_error": err_code
        }
    except Exception as e:
        return {
            "generate_result": gen_result,
            "query_result": None,
            "query_error": str(e)
        }
