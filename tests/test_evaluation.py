import pytest
from src.rudataanalyst_sql.evaluation.sql_executor import is_safe_sql, execute_and_compare, UnsafeSQLError

def test_is_safe_sql():
    assert is_safe_sql("SELECT * FROM users;")
    assert is_safe_sql("WITH cte AS (SELECT 1) SELECT * FROM cte;")
    assert not is_safe_sql("DROP TABLE users;")
    assert not is_safe_sql("SELECT * FROM users; DROP TABLE users;")
    assert not is_safe_sql("UPDATE users SET name='A';")
    assert not is_safe_sql("INSERT INTO users VALUES (1);")

def test_execute_and_compare(tmp_path):
    db_path = tmp_path / "test.sqlite"
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE test (id INTEGER, val TEXT);")
    conn.execute("INSERT INTO test VALUES (1, 'a'), (2, 'b');")
    conn.commit()
    conn.close()

    res = execute_and_compare(db_path, "SELECT * FROM test;", "SELECT * FROM test;")
    assert res["execution_match"] is True

    res2 = execute_and_compare(db_path, "SELECT * FROM test;", "SELECT * FROM test WHERE id=1;")
    assert res2["execution_match"] is False

    res3 = execute_and_compare(db_path, "SELECT * FROM test;", "UPDATE test SET val='c';")
    assert res3["pred_error"] is not None
    assert "Unsafe" in res3["pred_error"]
