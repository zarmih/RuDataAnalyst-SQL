#!/usr/bin/env python3
import json
import time
import re
from pathlib import Path
from src.finetune_portfolio.modeling.model_utils import load_config, get_model_and_tokenizer
import torch

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

def extract_json(text):
    # Try to find JSON block
    match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if match:
        raw = match.group(1)
    else:
        # Fallback to finding curly braces
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            raw = text[start:end+1]
        else:
            return None
    try:
        return json.loads(raw)
    except:
        return None

def main():
    OUTPUTS_DIR.mkdir(exist_ok=True)
    
    base_cfg = load_config(PROJECT_ROOT / "configs" / "base_model.yaml")

    baseline_cfg = load_config(PROJECT_ROOT / "configs" / "baseline.yaml")
    
    print("Loading model and tokenizer...")
    model, tokenizer = get_model_and_tokenizer(base_cfg, quant_config=baseline_cfg["quantization"])
    model.eval()
    
    system_prompt = "Ты SQL-ассистент. Отвечай только в формате JSON: {\"sql\": \"...\", \"explanation_ru\": \"...\", \"assumptions\": [], \"confidence\": \"high|medium|low\"}."
    
    test_file = DATA_DIR / "test.jsonl"
    out_file = OUTPUTS_DIR / "baseline_predictions.jsonl"
    
    records = []
    with open(test_file, "r") as f:
        for line in f:
            records.append(json.loads(line))
            
    results = []
    
    print(f"Running inference on {len(records)} examples...")
    for i, r in enumerate(records):
        prompt = f"Схема БД:\n{r['schema_sql']}\n\nВопрос: {r['question_ru']}"
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        inputs = tokenizer(text, return_tensors="pt").to(model.device)
        
        start_time = time.time()
        with torch.no_grad():
            outputs = model.generate(
                **inputs, 
                max_new_tokens=baseline_cfg["max_new_tokens"],
                temperature=baseline_cfg["temperature"],
                do_sample=baseline_cfg["do_sample"],
                pad_token_id=tokenizer.eos_token_id
            )
        latency = time.time() - start_time
        
        # Parse output
        gen_tokens = outputs[0][inputs.input_ids.shape[1]:]
        raw_response = tokenizer.decode(gen_tokens, skip_special_tokens=True)
        
        parsed = extract_json(raw_response)
        pred_sql = parsed["sql"] if parsed and "sql" in parsed else ""
        
        results.append({
            "id": r["id"],
            "database_id": r["database_id"],
            "gold_sql": r["sql"],
            "pred_sql": pred_sql,
            "raw_response": raw_response,
            "latency": latency,
            "parsed_success": parsed is not None
        })
        print(f"[{i+1}/{len(records)}] Latency: {latency:.2f}s | Parsed: {parsed is not None}")
        
    with open(out_file, "w", encoding="utf-8") as f:
        for res in results:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
            
    print(f"Saved predictions to {out_file}")
    
    # Evaluate
    print("\nEvaluating predictions...")
    from src.finetune_portfolio.evaluation.evaluate_predictions import evaluate_file
    stats = evaluate_file(out_file)
    print("Baseline Evaluation Results:")
    for k, v in stats.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.2%}")
        else:
            print(f"  {k}: {v}")
            
    print(f"Peak VRAM: {torch.cuda.max_memory_allocated() / 1024**3:.2f} GB")

if __name__ == "__main__":
    main()
