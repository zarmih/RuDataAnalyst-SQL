import pytest
from src.rudataanalyst_sql.inference.run_baseline import extract_json

def test_extract_json():
    text = "```json\n{\"sql\": \"SELECT * FROM users\"}\n```"
    res = extract_json(text)
    assert res is not None
    assert res["sql"] == "SELECT * FROM users"
    
    text2 = "Here is the result: {\"sql\": \"SELECT 1\"} and that is all."
    res2 = extract_json(text2)
    assert res2 is not None
    assert res2["sql"] == "SELECT 1"

    text3 = "No json here."
    res3 = extract_json(text3)
    assert res3 is None
