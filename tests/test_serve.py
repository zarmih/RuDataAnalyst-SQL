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
    assert "RuDataAnalyst-SQL" in response.text
    assert 'id="question"' in response.text
    assert "Сгенерировать и выполнить" in response.text
    assert "Только SQL" in response.text
    assert "/static/js/main.js" in response.text
    assert "https://" not in response.text
    assert "http://" not in response.text
    
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

def test_static_modules_escape_text():
    root = Path(__file__).resolve().parents[1] / "src" / "rudataanalyst_sql" / "serve" / "static"
    for path in root.rglob("*"):
        if path.suffix not in {".js", ".html", ".css"}:
            continue
        text = path.read_text(encoding="utf-8")
        assert "innerHTML" not in text
        assert "insertAdjacentHTML" not in text
        assert "document.write" not in text
        assert "localStorage" not in text
        assert "первые 50" not in text
        assert "первых 50" not in text
        response = client.get("/static/" + str(path.relative_to(root)))
        assert response.status_code == 200

def test_schema_by_id_rejects_paths():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE orders(id INT, note TEXT);")
        conn.commit()
        conn.close()
        add_sqlite_schema("schemademo", f.name)

        response = client.get("/v1/schema/schemademo")
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"domain", "source", "dialect", "schema_sql"}
        assert body["domain"] == "schemademo"
        assert body["source"] == "managed"
        assert body["dialect"] == "sqlite"
        assert "CREATE TABLE orders" in body["schema_sql"]
        raw = response.text
        assert "database.sqlite" not in raw
        assert temp_dir not in raw
        assert f.name not in raw

        missing = client.get("/v1/schema/no-such-domain")
        assert missing.status_code == 400
        assert missing.json()["detail"] == "domain_not_found"

        dotted = client.get("/v1/schema/schemademo.sqlite")
        assert dotted.status_code == 400

        queried = client.get("/v1/schema/schemademo", params={"path": "/etc/passwd", "sql": "SELECT 1"})
        assert queried.status_code == 200
        assert "/etc/passwd" not in queried.text

        posted = client.post("/v1/schema/schemademo", json={"path": "/etc/passwd"})
        assert posted.status_code == 405

        traversed = client.get("/v1/schema/..%2F..%2Fetc%2Fpasswd")
        assert traversed.status_code in (400, 404)
        assert "root:" not in traversed.text
        assert "CREATE TABLE" not in traversed.text

        remove_schema("schemademo")
        os.unlink(f.name)

def test_mock_generate_does_not_load_model(monkeypatch):
    monkeypatch.setenv("MOCK_MODEL", "true")
    monkeypatch.setenv("MOCK_SQL", "SELECT id FROM orders")
    worker = ModelWorker()
    parsed = worker.generate("вопрос", "CREATE TABLE orders(id INT);")
    assert parsed["sql"] == "SELECT id FROM orders"
    assert worker.model is None

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
