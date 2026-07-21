#!/usr/bin/env python3
import json
import torch
import gc
from pathlib import Path
from datasets import load_dataset, Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
ADAPTER_DIR = PROJECT_ROOT / "adapters" / "qwen3-4b-qlora"

MODEL_ID = "Qwen/Qwen3-4B"
REVISION = "1cfa9a7208912126459214e8b04321603b3df60c"

def format_prompt(example, tokenizer):
    messages = [
        {"role": "system", "content": "Ты полезный AI-ассистент для бизнес-аналитики. Напиши SQL-запрос для решения задачи, используя диалект sqlite. Также объясни запрос на русском языке. Верни только валидный JSON."},
        {"role": "user", "content": f"Database Schema:\n{example['schema_sql']}\n\nQuestion: {example['question_ru']}"},
        {"role": "assistant", "content": json.dumps({"sql": example["sql"], "explanation_ru": example["explanation_ru"], "assumptions": example["assumptions"], "confidence": "high"}, ensure_ascii=False)}
    ]
    return tokenizer.apply_chat_template(messages, tokenize=False, enable_thinking=False)

def main():
    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        
    print("Loading data...")
    def process_data(file_name):
        with open(DATA_DIR / file_name, "r", encoding="utf-8") as f:
            data = [json.loads(line) for line in f]
        texts = [format_prompt(ex, tokenizer) for ex in data]
        return Dataset.from_dict({"text": texts})

    train_dataset = process_data("train.jsonl")
    val_dataset = process_data("validation.jsonl")
    
    print(f"Train size: {len(train_dataset)}, Val size: {len(val_dataset)}")
    
    # Analyze max length
    lengths = [len(tokenizer.encode(t)) for t in train_dataset['text']]
    max_len = max(lengths)
    print(f"Max sequence length in train: {max_len}")
    seq_length = 1024 if max_len < 1024 else 1536
    
    # BitsAndBytes
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16
    )
    
    print("Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        revision=REVISION,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False # Required for gradient checkpointing
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    
    # Preflight Check
    print("Running Preflight Check...")
    test_inputs = tokenizer([train_dataset['text'][0], train_dataset['text'][1]], return_tensors="pt", padding=True, truncation=True, max_length=seq_length).to(model.device)
    with torch.cuda.amp.autocast(dtype=torch.bfloat16):
        out = model(**test_inputs)
        loss = out.loss if out.loss is not None else out.logits.sum()
        loss.backward()
    print(f"Preflight loss: {loss.item()}")
    if torch.isnan(loss):
        raise ValueError("NaN loss in preflight check!")
    print(f"VRAM allocated: {torch.cuda.memory_allocated() / 1024**3:.2f} GB")
    model.zero_grad()
    
    # LoRA
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none",
        task_type="CAUSAL_LM"
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()
    
    training_args = TrainingArguments(
        output_dir=str(ADAPTER_DIR),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        num_train_epochs=3,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        bf16=True,
        seed=42,
        optim="paged_adamw_32bit",
        report_to="none",
        max_grad_norm=1.0,
        remove_unused_columns=False,
    )
    
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        processing_class=tokenizer,
    )
    
    print("Starting training...")
    trainer.train()
    
    print(f"Saving final model to {ADAPTER_DIR}...")
    trainer.save_model(str(ADAPTER_DIR))
    
    print("Cleaning up...")
    del model
    del trainer
    gc.collect()
    torch.cuda.empty_cache()

if __name__ == "__main__":
    main()
