#!/usr/bin/env python3
"""
Exports local JSONL datasets to Hugging Face dataset format.
"""

import os
from pathlib import Path
from datasets import Dataset, DatasetDict
import json

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
HF_DATA_DIR = DATA_DIR / "hf_dataset"

def export_to_hf():
    """Reads JSONL splits and saves as HuggingFace DatasetDict."""
    splits = {}
    for split in ["train", "validation", "test"]:
        path = DATA_DIR / f"{split}.jsonl"
        if path.exists():
            records = []
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    records.append(json.loads(line))
            
            # Format suitable for LLM SFT
            # Provide conversation or instruction/input/output format
            formatted_records = []
            for r in records:
                instruction = f"Напиши SQL-запрос для SQLite, который отвечает на вопрос.\nВопрос: {r['question_ru']}"
                if r.get('context'):
                    instruction += f"\nКонтекст: {r['context']}"
                
                input_text = r['schema_sql']
                output_text = f"```sql\n{r['sql']}\n```\n\nОбъяснение:\n{r['explanation_ru']}"
                
                formatted_records.append({
                    "id": r["id"],
                    "database_id": r["database_id"],
                    "instruction": instruction,
                    "input": input_text,
                    "output": output_text,
                    "difficulty": r["difficulty"]
                })
            
            splits[split] = Dataset.from_list(formatted_records)
    
    if splits:
        ds = DatasetDict(splits)
        print(f"Exporting HuggingFace dataset to {HF_DATA_DIR} ...")
        ds.save_to_disk(str(HF_DATA_DIR))
        print(f"Exported splits: {list(ds.keys())}")
        for s in ds:
            print(f" - {s}: {len(ds[s])} examples")
    else:
        print("No JSONL splits found to export.")

if __name__ == "__main__":
    export_to_hf()
