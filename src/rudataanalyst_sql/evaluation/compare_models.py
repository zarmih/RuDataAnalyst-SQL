#!/usr/bin/env python3
import json
import argparse
from pathlib import Path
from src.rudataanalyst_sql.evaluation.sql_executor import execute_and_compare

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_DIR = PROJECT_ROOT / "data" / "databases"

def load_predictions(predictions_jsonl: Path) -> dict:
    results = {}
    with open(predictions_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            record = json.loads(line)
            q_id = record["id"]
            db_id = record["database_id"]
            gold_sql = record["gold_sql"]
            pred_sql = record.get("pred_sql", "")
            
            db_path = DB_DIR / f"{db_id}.sqlite"
            
            res = execute_and_compare(db_path, gold_sql, pred_sql)
            results[q_id] = {
                "gold_sql": gold_sql,
                "pred_sql": pred_sql,
                "execution_match": res["execution_match"],
                "pred_error": res["pred_error"]
            }
    return results

def main():
    parser = argparse.ArgumentParser(description="Compare execution results of two models.")
    parser.add_argument("base_predictions", type=Path)
    parser.add_argument("new_predictions", type=Path)
    args = parser.parse_args()
    
    base_res = load_predictions(args.base_predictions)
    new_res = load_predictions(args.new_predictions)
    
    improved = []
    regressed = []
    unchanged = []
    
    for q_id in new_res:
        if q_id not in base_res:
            continue
            
        b_match = base_res[q_id]["execution_match"]
        n_match = new_res[q_id]["execution_match"]
        
        if not b_match and n_match:
            improved.append(q_id)
        elif b_match and not n_match:
            regressed.append(q_id)
        else:
            unchanged.append(q_id)
            
    print(f"Comparison: {args.new_predictions.stem} vs {args.base_predictions.stem}")
    print(f"Improved: {len(improved)}")
    print(f"Regressed: {len(regressed)}")
    print(f"Unchanged: {len(unchanged)}")
    
    if regressed:
        print("\nRegressions (q_id | base_match -> new_error):")
        for q_id in regressed:
            err = new_res[q_id]['pred_error']
            print(f"  {q_id}: Base OK -> New Error: {err}")

if __name__ == "__main__":
    main()
