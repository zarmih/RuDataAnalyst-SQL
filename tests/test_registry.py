import pytest
import sqlite3
import tempfile
import os
import time
import shutil
import concurrent.futures
from pathlib import Path
from fastapi.testclient import TestClient

from src.rudataanalyst_sql.serve.app import app
from src.rudataanalyst_sql.serve.registry import (
    add_sqlite_schema, remove_schema, inspect_schema, list_registered_schemas, get_registry_dir
)

@pytest.fixture(autouse=True)
def setup_registry_temp():
    tmp = tempfile.mkdtemp()
    os.environ["RUDATA_RUNTIME_DIR"] = tmp
    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)

def create_valid_db(path):
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE users(id INT);")
    conn.close()

def create_corrupt_db(path):
    # write valid header, then garbage
    with open(path, "wb") as f:
        f.write(b"SQLite format 3\000")
        f.write(os.urandom(1024))

def test_registry_lifecycle():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        create_valid_db(f.name)
        
        # Valid add
        add_sqlite_schema("test1", f.name)
        
        # Duplicate id reject
        with pytest.raises(ValueError, match="already exists"):
            add_sqlite_schema("test1", f.name)
            
        # Inspect
        man = inspect_schema("test1")
        assert "schema_sql" in man
        assert "source_path" not in man # no source path in manifest
        assert "/home/" not in str(man) # ensure no home path leaked
        
        # Deterministic hashing
        add_sqlite_schema("test2", f.name)
        man2 = inspect_schema("test2")
        assert man["db_hash"] == man2["db_hash"]
        assert man["schema_hash"] == man2["schema_hash"]
        
        # List
        schemas = list_registered_schemas()
        assert len(schemas) == 2
        
        # Remove
        remove_schema("test1")
        assert len(list_registered_schemas()) == 1
        
        os.unlink(f.name)

def test_invalid_ids():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        create_valid_db(f.name)
        
        for bad_id in ["", "id/traversal", "id\\traversal", "../id", "id space", "id!"]:
            with pytest.raises(ValueError, match="invalid schema id"):
                add_sqlite_schema(bad_id, f.name)
                
        os.unlink(f.name)

def test_invalid_sources():
    # Header invalid
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"NOT A SQLITE DB")
        with pytest.raises(ValueError, match="wrong SQLite header"):
            add_sqlite_schema("bad1", f.name)
        os.unlink(f.name)
        
    # Corrupt sqlite but good header
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_corrupt_db(f.name)
        with pytest.raises(ValueError, match="file is not a database"):
            add_sqlite_schema("bad2", f.name)
        os.unlink(f.name)
        
    # Oversize
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        # Create a tiny limit (0 MB means any size > 0 will fail)
        with pytest.raises(ValueError, match="size exceeds limit"):
            add_sqlite_schema("bad3", f.name, max_size_mb=0)
        os.unlink(f.name)

    # Symlink reject
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        sym = f.name + "_sym"
        try:
            os.symlink(f.name, sym)
            with pytest.raises(ValueError, match="symlinks not allowed"):
                add_sqlite_schema("bad4", sym)
        except OSError:
            pass # skip on windows without privs
        finally:
            if os.path.exists(sym): os.unlink(sym)
            os.unlink(f.name)

def test_atomicity(monkeypatch):
    # If error happens during processing, no debris is left
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        
        # mock sqlite3.connect to fail
        def mock_connect(*args, **kwargs):
            raise Exception("simulated failure")
        
        monkeypatch.setattr(sqlite3, "connect", mock_connect)
        
        with pytest.raises(ValueError, match="simulated failure"):
            add_sqlite_schema("atomic", f.name)
            
        reg_dir = get_registry_dir()
        # Ensure .tmp_ dirs are gone
        for d in reg_dir.iterdir():
            assert not d.name.startswith(".tmp_")
        assert not (reg_dir / "atomic").exists()
            
        os.unlink(f.name)

def test_concurrency():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        add_sqlite_schema("conc1", f.name)
        os.unlink(f.name)
        
    def read_op():
        inspect_schema("conc1")
        list_registered_schemas()
        
    # Execute reads concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(read_op) for _ in range(50)]
        for fut in futs:
            fut.result() # should not raise

def test_http_integration():
    client = TestClient(app)
    
    # extra fields rejected
    resp = client.post("/v1/sql/generate", json={
        "domain": "test",
        "question": "test",
        "db": "/etc/passwd"
    })
    assert resp.status_code == 422 # Pydantic validation error for extra forbid
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE products(id INT, name TEXT);")
        conn.execute("INSERT INTO products VALUES (1, 'Apple');")
        conn.close()
        
        add_sqlite_schema("myprod", f.name)
        
        # Check domain list
        resp = client.get("/v1/domains")
        assert "myprod" in resp.json()["managed"]
        
        # Mock model worker context injection
        os.environ["MOCK_MODEL"] = "true"
        # The prompt grounding should use actual schema.
        # Since MOCK_MODEL is true, the ModelWorker returns a hardcoded sql
        # We can test query
        resp = client.post("/v1/sql/query", json={"domain": "myprod", "question": "test"})
        # Hardcoded mock sql is SELECT * FROM demo_table LIMIT 10
        # Since 'products' table exists, it will hallucinate!
        assert resp.status_code == 200
        assert resp.json()["generate_result"]["is_hallucinated"] is True
        
        remove_schema("myprod")
        os.unlink(f.name)
