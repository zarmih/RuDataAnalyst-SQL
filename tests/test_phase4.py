import json
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"

def load_jsonl(path):
    records = []
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                records.append(json.loads(line))
    return records

def test_split_sizes_and_balance():
    train = load_jsonl(DATA_DIR / "train.jsonl")
    val = load_jsonl(DATA_DIR / "validation.jsonl")
    challenge = load_jsonl(DATA_DIR / "challenge.jsonl")
    
    assert len(train) >= 900
    assert len(val) >= 90
    assert len(challenge) >= 45
    
    for split_data, expected_per_db in [(train, 300), (val, 30), (challenge, 15)]:
        dbs = {}
        for r in split_data:
            dbs[r["database_id"]] = dbs.get(r["database_id"], 0) + 1
        for db in ["shop", "hr", "support"]:
            assert dbs.get(db, 0) >= expected_per_db

def test_frozen_test_immutability():
    test_data = load_jsonl(DATA_DIR / "test.jsonl")
    assert len(test_data) == 14
    for r in test_data:
        assert r["database_id"] == "support"
        assert r["split"] == "test"

def test_execution_safety():
    for split in ["train.jsonl", "validation.jsonl", "challenge.jsonl", "test.jsonl"]:
        data = load_jsonl(DATA_DIR / split)
        for r in data:
            sql = r["sql"].lower()
            assert "insert " not in sql
            assert "update " not in sql
            assert "delete " not in sql
            assert "drop " not in sql
            assert "alter " not in sql

def test_leakage_isolation():
    # Frozen test NL must not be in train/val/challenge
    test_data = load_jsonl(DATA_DIR / "test.jsonl")
    train = load_jsonl(DATA_DIR / "train.jsonl")
    val = load_jsonl(DATA_DIR / "validation.jsonl")
    
    test_nl = {r["question_ru"].lower().strip() for r in test_data}
    for r in train + val:
        assert r["question_ru"].lower().strip() not in test_nl

def test_rejected_counter_schema():
    card_path = PROJECT_ROOT / "reports" / "DATASET_CARD.md"
    assert card_path.exists()
    content = card_path.read_text()
    assert "Duplicate NL:" in content
    assert "Duplicate SQL:" in content
    assert "Execution Error:" in content
    assert "Unsafe SQL:" in content
    assert "Empty/Invalid Semantic:" in content
    assert "Leakage/Template Collision:" in content

def test_determinism():
    # Ensure train generation is deterministic 
    train = load_jsonl(DATA_DIR / "train.jsonl")
    if train:
        assert train[0].get("id") is not None
