import os
import json
import shutil
import sqlite3
import hashlib
import time
import re
from pathlib import Path
from platformdirs import user_data_dir

def get_runtime_dir() -> Path:
    env_dir = os.environ.get("RUDATA_RUNTIME_DIR")
    if env_dir:
        return Path(env_dir)
    return Path(user_data_dir("rudataanalyst-sql"))

def get_registry_dir() -> Path:
    d = get_runtime_dir() / "registry"
    d.mkdir(parents=True, exist_ok=True)
    return d

def _hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def list_registered_schemas():
    reg_dir = get_registry_dir()
    schemas = []
    for d in reg_dir.iterdir():
        if d.is_dir() and (d / "manifest.json").exists():
            try:
                manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
                schemas.append({"id": d.name, **manifest})
            except Exception:
                pass
    return schemas

def inspect_schema(schema_id: str):
    reg_dir = get_registry_dir() / schema_id
    manifest_path = reg_dir / "manifest.json"
    try:
        if not manifest_path.exists():
            raise ValueError("domain_not_found")
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ValueError("domain_not_found")

def remove_schema(schema_id: str):
    reg_dir = get_registry_dir() / schema_id
    if not reg_dir.exists():
        raise ValueError("domain_not_found")
    shutil.rmtree(reg_dir)

def add_sqlite_schema(schema_id: str, db_path: str, max_size_mb: int = 100):
    if not schema_id or not re.match(r"^[a-zA-Z0-9_-]+$", schema_id):
        raise ValueError("registry_error: invalid schema id")

    src = Path(db_path)
    if not src.exists() or not src.is_file():
        raise ValueError("invalid_database")
        
    if src.is_symlink():
        raise ValueError("invalid_database: symlinks not allowed")
        
    if src.stat().st_size > max_size_mb * 1024 * 1024:
        raise ValueError("invalid_database: size exceeds limit")
        
    with open(src, "rb") as f:
        header = f.read(16)
        if header != b"SQLite format 3\000":
            raise ValueError("invalid_database: wrong SQLite header")

    reg_dir = get_registry_dir() / schema_id
    if reg_dir.exists():
        raise ValueError("registry_error: schema already exists")
        
    # Copy atomically to a temp location first
    tmp_dir = get_registry_dir() / f".tmp_{schema_id}_{int(time.time()*1000)}"
    tmp_dir.mkdir(parents=True)
    dst_db = tmp_dir / "database.sqlite"
    
    try:
        shutil.copy2(src, dst_db)
        db_hash = _hash_file(dst_db)
        
        # Introspect
        uri = f"file:{dst_db}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        cursor = conn.cursor()
        
        cursor.execute("PRAGMA quick_check;")
        check_result = cursor.fetchone()
        if not check_result or check_result[0] != "ok":
            conn.close()
            raise ValueError("invalid_database: corrupt sqlite")

        # skip virtual tables and sqlite internal tables
        cursor.execute("SELECT sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL;")
        tables = cursor.fetchall()
        
        schema_sql = []
        for t in tables:
            sql = t[0]
            if "CREATE VIRTUAL TABLE" in sql.upper():
                conn.close()
                raise ValueError("invalid_database: virtual tables not allowed")
            schema_sql.append(sql)
            
        conn.close()
        
        if not schema_sql:
            raise ValueError("invalid_database: no valid tables found")
            
        schema_text = "\n".join(schema_sql)
        schema_hash = hashlib.sha256(schema_text.encode("utf-8")).hexdigest()
        
        manifest = {
            "schema_hash": schema_hash,
            "db_hash": db_hash,
            "timestamp": int(time.time()),
            "version": "0.1.0",
            "schema_sql": schema_text
        }
        
        with open(tmp_dir / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            
        tmp_dir.rename(reg_dir)
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if isinstance(e, ValueError):
            raise e
        raise ValueError(f"registry_error: {str(e)}")
