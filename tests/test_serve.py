import pytest
from fastapi.testclient import TestClient
import os
import json
import sqlite3
import tempfile
import shutil
from pathlib import Path

# Setup temp dir for registry
temp_dir = tempfile.mkdtemp()
os.environ["RUDATA_RUNTIME_DIR"] = temp_dir
os.environ["MOCK_MODEL"] = "true"

from src.rudataanalyst_sql.serve.app import app
from src.rudataanalyst_sql.serve.model_worker import ModelWorker
from src.rudataanalyst_sql.serve.sql_guardrails import check_hallucination_and_safety
from src.rudataanalyst_sql.serve.registry import add_sqlite_schema, remove_schema, inspect_schema, list_registered_schemas

client = TestClient(app)

@pytest.fixture(autouse=True)
def cleanup_registry():
    yield
    # No teardown needed between tests, they share temp_dir
    pass

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    
def test_static_ui():
    response = client.get("/")
    assert response.status_code == 200
    assert "RuDataAnalyst-SQL Demo" in response.text
    
def test_list_domains():
    response = client.get("/v1/domains")
    assert response.status_code == 200
    data = response.json()
    assert "domains" in data
    assert "built_in" in data
    assert "managed" in data
    
def test_registry_add_remove():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        f.write(b"SQLite format 3\000" + b"\x00" * 100)
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE users(id INT);")
        conn.close()
        
        # Test add
        add_sqlite_schema("testreg", f.name)
        assert "testreg" in [s["id"] for s in list_registered_schemas()]
        
        # Test inspect
        manifest = inspect_schema("testreg")
        assert "users" in manifest["schema_sql"]
        
        # Test list in API
        response = client.get("/v1/domains")
        assert "testreg" in response.json()["managed"]
        
        # Test query execution against registered
        # Mock model returns SELECT * FROM demo_table LIMIT 10, which will hallucinate
        # since only users table exists
        resp = client.post("/v1/sql/query", json={"domain": "testreg", "question": "test"})
        assert resp.status_code == 200
        assert resp.json()["generate_result"]["is_hallucinated"] is True
        
        # Test remove
        remove_schema("testreg")
        assert "testreg" not in [s["id"] for s in list_registered_schemas()]
        
        # Test invalid paths
        with pytest.raises(ValueError, match="invalid_database"):
            add_sqlite_schema("bad", "not_a_file.sqlite")
            
        os.unlink(f.name)

def test_generate_mocked():
    # To test generation success, we need a domain that has demo_table
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        f.write(b"SQLite format 3\000" + b"\x00" * 100)
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE demo_table(id INT);")
        conn.close()
        add_sqlite_schema("mockdomain", f.name)
        
        response = client.post("/v1/sql/generate", json={
            "domain": "mockdomain",
            "question": "test"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["sql"] == "SELECT * FROM demo_table LIMIT 10" # Mocked sql
        assert data["is_hallucinated"] is False
        
        # Test query
        resp = client.post("/v1/sql/query", json={
            "domain": "mockdomain",
            "question": "test"
        })
        assert resp.status_code == 200
        assert resp.json()["query_result"] is not None
        
        remove_schema("mockdomain")
        os.unlink(f.name)
    
def test_sql_guardrails_safe():
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE users(id INT);")
        conn.close()
        
        safe, hall, err = check_hallucination_and_safety("SELECT * FROM users", f.name)
        assert safe is True and hall is False
        
        safe, hall, err = check_hallucination_and_safety("SELECT * FROM missing", f.name)
        assert safe is True and hall is True
        
        safe, hall, err = check_hallucination_and_safety("DROP TABLE users", f.name)
        assert safe is False
        
        safe, hall, err = check_hallucination_and_safety("SELECT * FROM users; SELECT * FROM users", f.name)
        assert safe is False

def test_cli(monkeypatch, capsys):
    from src.rudataanalyst_sql.serve.cli import main
    monkeypatch.setattr("sys.argv", ["cli", "--url", "http://127.0.0.1:8000", "health"])
    
    class MockResponse:
        def json(self): return {"status": "ok"}
    class MockClient:
        def __init__(self, **kwargs): pass
        def get(self, url): return MockResponse()
        
    monkeypatch.setattr("httpx.Client", MockClient)
    
    try:
        main()
    except SystemExit:
        pass
        
    captured = capsys.readouterr()
    assert "ok" in captured.out
