import pytest
from fastapi.testclient import TestClient
import os
import json
import sqlite3

# Enable mock model before importing app
os.environ["MOCK_MODEL"] = "true"

from src.rudataanalyst_sql.serve.app import app
from src.rudataanalyst_sql.serve.model_worker import ModelWorker
from src.rudataanalyst_sql.serve.sql_guardrails import check_hallucination_and_safety

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    # model_loaded should be false or true depending on mock initialization
    
def test_static_ui():
    response = client.get("/")
    assert response.status_code == 200
    assert "RuDataAnalyst-SQL Demo" in response.text
    
def test_list_domains():
    response = client.get("/v1/domains")
    assert response.status_code == 200
    data = response.json()
    assert "domains" in data
    assert "shop" in data["domains"]
    
def test_generate_mocked():
    response = client.post("/v1/sql/generate", json={
        "domain": "shop",
        "question": "test"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["sql"] == "SELECT * FROM demo_table LIMIT 10" # Mocked sql
    
def test_query_mocked_hallucination():
    # Since mocked SQL uses "demo_table" which doesn't exist in "shop.sqlite", it should hit hallucination block
    response = client.post("/v1/sql/query", json={
        "domain": "shop",
        "question": "test"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["query_result"] is None
    assert "Refused to execute unsafe or hallucinated SQL" in data["query_error"]
    assert data["generate_result"]["is_hallucinated"] is True

def test_sql_guardrails_safe():
    # Create a real in-memory db for testing guardrails
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE users(id INT);")
        conn.close()
        
        # 1. Valid
        safe, hall, err = check_hallucination_and_safety("SELECT * FROM users", f.name)
        assert safe is True
        assert hall is False
        
        # 2. Hallucination
        safe, hall, err = check_hallucination_and_safety("SELECT * FROM missing", f.name)
        assert safe is True
        assert hall is True
        
        # 3. Unsafe
        safe, hall, err = check_hallucination_and_safety("DROP TABLE users", f.name)
        assert safe is False
        assert "Unsafe or non-SELECT SQL detected" in err
        
        # 4. Multiple statements
        safe, hall, err = check_hallucination_and_safety("SELECT * FROM users; SELECT * FROM users", f.name)
        assert safe is False
        assert "Multiple SQL statements" in err

def test_cli(monkeypatch, capsys):
    from src.rudataanalyst_sql.serve.cli import main
    monkeypatch.setattr("sys.argv", ["cli", "--url", "http://127.0.0.1:8000", "health"])
    
    # We mock httpx.Client to return mocked response
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
