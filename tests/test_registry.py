import pytest
import sqlite3
import tempfile
import os
import time
import shutil
import concurrent.futures
from pathlib import Path
from fastapi.testclient import TestClient
import hashlib

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
    with open(path, "wb") as f:
        f.write(b"SQLite format 3\000")
        f.write(os.urandom(1024))

def test_registry_lifecycle():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        create_valid_db(f.name)
        add_sqlite_schema("test1", f.name)
        assert len(list_registered_schemas()) == 1
        remove_schema("test1")
        assert len(list_registered_schemas()) == 0
        os.unlink(f.name)

def test_invalid_ids():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        create_valid_db(f.name)
        for bad_id in ["", "id/traversal", "id\\traversal", "../id", "id space", "id!"]:
            with pytest.raises(ValueError, match="invalid schema id"):
                add_sqlite_schema(bad_id, f.name)
        os.unlink(f.name)

def test_invalid_header_rejected():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"NOT A SQLITE DB")
        with pytest.raises(ValueError, match="wrong SQLite header"):
            add_sqlite_schema("badhead", f.name)
        os.unlink(f.name)

def test_corrupt_sqlite_with_header_rejected():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_corrupt_db(f.name)
        with pytest.raises(ValueError, match="file is not a database"):
            add_sqlite_schema("corrupt", f.name)
        os.unlink(f.name)

def test_oversize_rejected():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        with pytest.raises(ValueError, match="size exceeds limit"):
            add_sqlite_schema("oversize", f.name, max_size_mb=0)
        os.unlink(f.name)

def test_symlink_source_rejected():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        sym = f.name + "_sym"
        try:
            os.symlink(f.name, sym)
            with pytest.raises(ValueError, match="symlinks not allowed"):
                add_sqlite_schema("sym", sym)
        except OSError:
            pass
        finally:
            if os.path.exists(sym): os.unlink(sym)
            os.unlink(f.name)

def test_non_regular_source_rejected():
    tmp_dir = tempfile.mkdtemp()
    try:
        with pytest.raises(ValueError, match="invalid_database"):
            add_sqlite_schema("nonreg", tmp_dir)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

def test_duplicate_registry_id_rejected():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        add_sqlite_schema("dup", f.name)
        with pytest.raises(ValueError, match="already exists"):
            add_sqlite_schema("dup", f.name)
        os.unlink(f.name)

def test_manifest_has_no_source_identity():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        create_valid_db(f.name)
        add_sqlite_schema("ident", f.name)
        man = inspect_schema("ident")
        assert "schema_sql" in man
        assert "source_path" not in man
        assert "/home/" not in str(man)
        os.unlink(f.name)

def test_registry_hashes_are_deterministic():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        create_valid_db(f.name)
        add_sqlite_schema("h1", f.name)
        add_sqlite_schema("h2", f.name)
        man1 = inspect_schema("h1")
        man2 = inspect_schema("h2")
        assert man1["db_hash"] == man2["db_hash"]
        assert man1["schema_hash"] == man2["schema_hash"]
        os.unlink(f.name)

def test_atomicity(monkeypatch):
    with tempfile.NamedTemporaryFile(delete=False) as f:
        create_valid_db(f.name)
        def mock_connect(*args, **kwargs):
            raise Exception("simulated failure")
        monkeypatch.setattr(sqlite3, "connect", mock_connect)
        with pytest.raises(ValueError, match="simulated failure"):
            add_sqlite_schema("atomic", f.name)
            
        reg_dir = get_registry_dir()
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
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(read_op) for _ in range(50)]
        for fut in futs:
            fut.result()

def test_http_rejects_filesystem_fields():
    client = TestClient(app)
    resp = client.post("/v1/sql/generate", json={
        "domain": "test",
        "question": "test",
        "db": "/etc/passwd",
        "source_path": "/var/log"
    })
    assert resp.status_code == 422
    assert "Extra inputs are not permitted" in resp.text

def test_managed_database_is_read_only():
    os.environ["MOCK_MODEL"] = "true"
    client = TestClient(app)
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE products(id INT, name TEXT);")
        conn.execute("INSERT INTO products VALUES (1, 'Apple');")
        conn.commit()
        conn.close()
        
        # Capture hash before
        h_before = hashlib.sha256(open(f.name, "rb").read()).hexdigest()
        
        add_sqlite_schema("myprod", f.name)
        
        # Mocking the model response to attempt a DML inside the execute_query
        # The execute_query connects as ro. Even if we pass a DML that passes safety,
        # the connection should reject it.
        # However, the safety check (check_hallucination_and_safety) blocks DML earlier.
        # We can bypass check_hallucination_and_safety by monkeypatching it for this test,
        # just to prove the DB connection is read-only.
        import src.rudataanalyst_sql.serve.app as app_mod
        original_check = app_mod.check_hallucination_and_safety
        app_mod.check_hallucination_and_safety = lambda *args, **kwargs: (True, False, None)
        
        # Test INSERT
        os.environ["MOCK_SQL"] = "INSERT INTO products VALUES (2, 'Banana');"
        resp = client.post("/v1/sql/query", json={"domain": "myprod", "question": "test"})
        assert resp.status_code == 200
        # Should fail with readonly database
        assert resp.json()["query_error"] == "attempt to write a readonly database"
        
        app_mod.check_hallucination_and_safety = original_check
        remove_schema("myprod")
        os.unlink(f.name)

def test_managed_query_row_limit():
    os.environ["MOCK_MODEL"] = "true"
    os.environ["RUDATA_ROW_LIMIT"] = "2"
    client = TestClient(app)
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE nums(id INT);")
        for i in range(5): conn.execute(f"INSERT INTO nums VALUES ({i});")
        conn.commit()
        conn.close()
        add_sqlite_schema("rowlim", f.name)
        
        os.environ["MOCK_SQL"] = "SELECT * FROM nums;"
        resp = client.post("/v1/sql/query", json={"domain": "rowlim", "question": "test"})
        data = resp.json()
        assert data["query_error"] is None
        res = data["query_result"]
        assert len(res["rows"]) == 2
        assert res["truncated"] is True
        
        os.environ.pop("RUDATA_ROW_LIMIT")
        os.environ.pop("MOCK_SQL")
        os.unlink(f.name)

def test_managed_query_timeout_error_code():
    os.environ["MOCK_MODEL"] = "true"
    os.environ["RUDATA_QUERY_TIMEOUT"] = "0.01" # 10ms
    client = TestClient(app)
    
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE huge(id INT);")
        for i in range(100): conn.execute(f"INSERT INTO huge VALUES ({i});")
        conn.commit()
        conn.close()
        add_sqlite_schema("timeout_test", f.name)
        
        # Cartesian product to trigger timeout
        os.environ["MOCK_SQL"] = "SELECT COUNT(*) FROM huge a, huge b, huge c, huge d, huge e;"
        
        # Patch safety check as it might timeout itself if it runs explain
        import src.rudataanalyst_sql.serve.app as app_mod
        original_check = app_mod.check_hallucination_and_safety
        app_mod.check_hallucination_and_safety = lambda *args, **kwargs: (True, False, None)

        resp = client.post("/v1/sql/query", json={"domain": "timeout_test", "question": "test"})
        data = resp.json()
        assert data["query_error"] == "query_timeout"
        
        app_mod.check_hallucination_and_safety = original_check
        os.environ.pop("RUDATA_QUERY_TIMEOUT")
        os.environ.pop("MOCK_SQL")
        os.unlink(f.name)
