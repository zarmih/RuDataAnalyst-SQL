#!/usr/bin/env python3
"""
Validates the seed dataset against schema and ensures SQL correctness.
"""

import json
from pathlib import Path
import sqlite3
import re
import jsonschema

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
DB_DIR = DATA_DIR / "databases"
SCHEMA_PATH = PROJECT_ROOT / "schemas" / "example_record.schema.json"

from src.rudataanalyst_sql.utils.sql_utils import is_safe_sql

def load_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def validate_all() -> tuple[bool, list[str], dict]:
    schema = load_schema()
    jsonl_files = list(DATA_DIR.glob("*.jsonl"))
    
    is_valid = True
    errors = []
    stats = {"total": 0, "valid": 0, "invalid": 0, "errors": {}}
    
    seen_ids = set()

    for file_path in jsonl_files:
        if file_path.name == "all.jsonl":
            continue
        
        with open(file_path, "r", encoding="utf-8") as f:
            for line_idx, line in enumerate(f):
                stats["total"] += 1
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    err = f"{file_path.name}:{line_idx+1}: Invalid JSON"
                    errors.append(err)
                    is_valid = False
                    stats["invalid"] += 1
                    continue
                
                # JSON Schema validate
                try:
                    jsonschema.validate(instance=record, schema=schema)
                except jsonschema.exceptions.ValidationError as e:
                    err = f"{file_path.name}:{line_idx+1}: Schema error: {e.message}"
                    errors.append(err)
                    is_valid = False
                    stats["invalid"] += 1
                    continue

                # Dupe ID check
                record_id = record.get("id")
                if record_id in seen_ids:
                    err = f"{file_path.name}:{line_idx+1}: Duplicate ID {record_id}"
                    errors.append(err)
                    is_valid = False
                    stats["invalid"] += 1
                    continue
                seen_ids.add(record_id)
                
                # Check safe SQL
                sql = record.get("sql", "")
                if not is_safe_sql(sql):
                    err = f"{file_path.name}:{line_idx+1}: Unsafe or non-SELECT SQL: {sql}"
                    errors.append(err)
                    is_valid = False
                    stats["invalid"] += 1
                    continue
                
                # Execute SQL
                db_id = record.get("database_id")
                db_path = DB_DIR / f"{db_id}.sqlite"
                if not db_path.exists():
                    err = f"{file_path.name}:{line_idx+1}: Database missing {db_path}"
                    errors.append(err)
                    is_valid = False
                    stats["invalid"] += 1
                    continue
                
                try:
                    uri = f"file:{db_path}?mode=ro"
                    conn = sqlite3.connect(uri, uri=True, timeout=2.0)
                    conn.execute("PRAGMA query_only = ON;")
                    cursor = conn.execute(sql)
                    cursor.fetchmany(1)
                    conn.close()
                except sqlite3.Error as e:
                    err = f"{file_path.name}:{line_idx+1}: Execution error on {db_id}: {e}"
                    errors.append(err)
                    is_valid = False
                    stats["invalid"] += 1
                    continue
                
                stats["valid"] += 1

    return is_valid, errors, stats

if __name__ == "__main__":
    is_valid, errors, stats = validate_all()
    print("Validation Stats:", stats)
    if not is_valid:
        print("\nErrors:")
        for e in errors[:20]:
            print(f"  - {e}")
        if len(errors) > 20:
            print(f"  ... and {len(errors)-20} more.")
        exit(1)
    else:
        print("Dataset is valid!")
        exit(0)
