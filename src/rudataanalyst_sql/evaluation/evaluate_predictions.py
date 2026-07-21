#!/usr/bin/env python3
"""
Evaluate model predictions against gold SQL.
Executes both queries on the corresponding SQLite database and compares results.
"""

import json
import argparse
from pathlib import Path
from src.rudataanalyst_sql.evaluation.sql_executor import execute_and_compare

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_DIR = PROJECT_ROOT / "data" / "databases"

def evaluate_file(predictions_jsonl: Path) -> dict:
    """
    Evaluates a file of predictions.
    Expected JSONL format:
    { "id": "...", "database_id": "...", "gold_sql": "...", "pred_sql": "..." }
    """
    stats = {
        "total": 0,
        "exact_match": 0,
        "execution_match": 0,
        "execution_error": 0,
        "unsafe_sql": 0,
    }
    
    with open(predictions_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            record = json.loads(line)
            stats["total"] += 1
            
            gold_sql = record["gold_sql"]
            pred_sql = record["pred_sql"]
            db_id = record["database_id"]
            db_path = DB_DIR / f"{db_id}.sqlite"
            
            # 1. Exact match (naive)
            if gold_sql.strip().lower() == pred_sql.strip().lower():
                stats["exact_match"] += 1
            
            # 2. Execution match
            res = execute_and_compare(db_path, gold_sql, pred_sql)
            if res["execution_match"]:
                stats["execution_match"] += 1
            elif res["pred_error"]:
                if "Unsafe" in res["pred_error"]:
                    stats["unsafe_sql"] += 1
                else:
                    stats["execution_error"] += 1

    if stats["total"] > 0:
        stats["exact_match_acc"] = stats["exact_match"] / stats["total"]
        stats["execution_match_acc"] = stats["execution_match"] / stats["total"]
    
    return stats

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("predictions_file", type=Path)
    args = parser.parse_args()
    
    if not args.predictions_file.exists():
        print(f"File not found: {args.predictions_file}")
        exit(1)
        
    stats = evaluate_file(args.predictions_file)
    print("Evaluation Results:")
    for k, v in stats.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.2%}")
        else:
            print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
