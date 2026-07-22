import os
import re
import json
import time
from pathlib import Path
import torch

from src.rudataanalyst_sql.modeling.model_utils import load_config, get_model_and_tokenizer

try:
    from peft import PeftModel
except ImportError:
    PeftModel = None

PROJECT_ROOT = Path(__file__).resolve().parents[3]

class ModelWorker:
    _instance = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
        
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.config = None
        self.baseline_cfg = None
        self.is_mocked = os.environ.get("MOCK_MODEL", "false").lower() == "true"
        
    def load(self):
        if self.model is not None or self.is_mocked:
            return
            
        print("Loading base model and tokenizer...")
        self.config = load_config(PROJECT_ROOT / "configs" / "base_model.yaml")
        self.baseline_cfg = load_config(PROJECT_ROOT / "configs" / "baseline.yaml")
        
        self.model, self.tokenizer = get_model_and_tokenizer(
            self.config, 
            quant_config=self.baseline_cfg.get("quantization", {})
        )
        
        adapter_path = os.environ.get("ADAPTER_PATH", str(PROJECT_ROOT / "adapters" / "qwen3-4b-qlora-balanced-v2"))
        if adapter_path and Path(adapter_path).exists() and PeftModel is not None:
            print(f"Loading adapter from {adapter_path}...")
            self.model = PeftModel.from_pretrained(self.model, adapter_path)
            
        self.model.eval()
        print("Model loaded successfully.")
        
    def extract_json(self, text):
        match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
        if match:
            raw = match.group(1)
        else:
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

    def generate(self, question: str, schema_sql: str):
        if self.is_mocked:
            mock_sql = os.environ.get("MOCK_SQL", "SELECT * FROM demo_table LIMIT 10")
            return {
                "sql": mock_sql,
                "explanation_ru": "Мок ответ",
                "assumptions": [],
                "confidence": "high",
                "latency": 0.1,
                "raw_response": "{...}"
            }
            
        self.load()
        
        system_prompt = "Ты SQL-ассистент. Отвечай только в формате JSON: {\"sql\": \"...\", \"explanation_ru\": \"...\", \"assumptions\": [], \"confidence\": \"high|medium|low\"}."
        prompt = f"Схема БД:\n{schema_sql}\n\nВопрос: {question}"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        text = self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        inputs = self.tokenizer(text, return_tensors="pt").to(self.model.device)
        
        start_time = time.time()
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                temperature=0.0,
                do_sample=False,
                pad_token_id=self.tokenizer.eos_token_id
            )
        latency = time.time() - start_time
        
        gen_tokens = outputs[0][inputs.input_ids.shape[1]:]
        raw_response = self.tokenizer.decode(gen_tokens, skip_special_tokens=True)
        
        parsed = self.extract_json(raw_response)
        if parsed is None:
            parsed = {"sql": "", "explanation_ru": "", "assumptions": [], "confidence": "low"}
            
        parsed["latency"] = latency
        parsed["raw_response"] = raw_response
        return parsed
