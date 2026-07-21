#!/usr/bin/env python3
"""
Checks for data leakage across splits.
"""

import json
from pathlib import Path
import re

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"

def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def normalize_sql(sql: str) -> str:
    sql = sql.lower()
    sql = sql.rstrip(";")
    sql = re.sub(r'\s+', ' ', sql)
    # very naive normalization
    return sql.strip()

def jaccard_similarity(s1: str, s2: str) -> float:
    set1 = set(s1.split())
    set2 = set(s2.split())
    if not set1 or not set2:
        return 0.0
    intersection = set1.intersection(set2)
    union = set1.union(set2)
    return len(intersection) / len(union)

def check_leakage() -> tuple[bool, list[str], dict]:
    splits = ["train", "validation", "test"]
    data = {s: [] for s in splits}
    
    for s in splits:
        path = DATA_DIR / f"{s}.jsonl"
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                data[s].append(json.loads(line))
    
    has_leakage = False
    findings = []
    stats = {}

    # 1. Database isolation check
    for item in data["test"]:
        if item["database_id"] != "support":
            findings.append(f"Test split uses non-support DB: {item['database_id']} in ID {item['id']}")
            has_leakage = True
    
    for s in ["train", "validation"]:
        for item in data[s]:
            if item["database_id"] == "support":
                findings.append(f"{s} split uses support DB in ID {item['id']}")
                has_leakage = True

    # 2. Exact match checking between splits
    for s1_idx, s1 in enumerate(splits):
        for s2 in splits[s1_idx+1:]:
            for item1 in data[s1]:
                norm_q1 = normalize_text(item1["question_ru"])
                norm_sql1 = normalize_sql(item1["sql"])
                for item2 in data[s2]:
                    norm_q2 = normalize_text(item2["question_ru"])
                    norm_sql2 = normalize_sql(item2["sql"])
                    
                    if norm_q1 == norm_q2:
                        findings.append(f"Exact question match: {item1['id']} ({s1}) vs {item2['id']} ({s2})")
                        has_leakage = True
                    
                    if norm_sql1 == norm_sql2:
                        findings.append(f"Exact SQL match: {item1['id']} ({s1}) vs {item2['id']} ({s2})")
                        has_leakage = True
                        
                    if jaccard_similarity(norm_q1, norm_q2) > 0.8:
                        findings.append(f"Near question match: {item1['id']} ({s1}) vs {item2['id']} ({s2})")
                        # Info only, might not be strict leakage if different questions

    stats["findings_count"] = len(findings)
    return has_leakage, findings, stats

if __name__ == "__main__":
    has_leakage, findings, stats = check_leakage()
    if findings:
        print("Leakage findings:")
        for f in findings:
            print(" -", f)
    if has_leakage:
        print("ERROR: Strict data leakage detected!")
        exit(1)
    else:
        print("No strict leakage detected.")
        exit(0)
