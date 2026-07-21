#!/usr/bin/env python3
import json
from pathlib import Path
from src.rudataanalyst_sql.modeling.model_utils import load_config, get_model_and_tokenizer
from transformers import TrainingArguments
from trl import SFTTrainer, SFTConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import load_from_disk
import torch

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"

def main():
    base_cfg = load_config(PROJECT_ROOT / "configs" / "base_model.yaml")

    smoke_cfg = load_config(PROJECT_ROOT / "configs" / "qlora_real_smoke.yaml")
    
    print("Loading model for QLoRA smoke test...")
    # Use nf4 explicitly for QLoRA
    model, tokenizer = get_model_and_tokenizer(base_cfg, quant_config="nf4")
    
    model = prepare_model_for_kbit_training(model)
    peft_config = LoraConfig(
        r=smoke_cfg["lora_r"],
        lora_alpha=smoke_cfg["lora_alpha"],
        lora_dropout=smoke_cfg["lora_dropout"],
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none",
        task_type="CAUSAL_LM"
    )
    
    # Load dataset
    ds = load_from_disk(DATA_DIR / "hf_dataset")
    train_ds = ds["train"].select(range(min(10, len(ds["train"])))) # Small subset for smoke test
    
    def format_prompts(example):
        msgs = [
            {"role": "system", "content": "Ты SQL-ассистент."},
            {"role": "user", "content": example["instruction"] + "\n\n" + example["input"]},
            {"role": "assistant", "content": example["output"]}
        ]
        text = tokenizer.apply_chat_template(msgs, tokenize=False, enable_thinking=False)
        return {"text": text}
        
    train_ds = train_ds.map(format_prompts)
    
    training_args = SFTConfig(
        output_dir=PROJECT_ROOT / smoke_cfg["output_dir"],
        per_device_train_batch_size=smoke_cfg["per_device_train_batch_size"],
        gradient_accumulation_steps=smoke_cfg["gradient_accumulation_steps"],
        learning_rate=float(smoke_cfg["learning_rate"]),
        max_steps=smoke_cfg["max_steps"],
        logging_steps=1,
        save_strategy="no",
        fp16=False,
        bf16=True, # RTX 5070 Ti supports bf16
        report_to="none",
        dataset_text_field="text",
        max_length=512,
    )
    
    trainer = SFTTrainer(
        model=model,
        train_dataset=train_ds,
        args=training_args,
        peft_config=peft_config,
    )
    
    print("Starting smoke test training...")
    trainer.train()
    
    # Save adapter
    adapter_path = PROJECT_ROOT / smoke_cfg["output_dir"] / "final"
    trainer.model.save_pretrained(adapter_path)
    print(f"Saved adapter to {adapter_path}")
    
    print("Clearing GPU memory...")
    del model
    del trainer
    torch.cuda.empty_cache()
    print("Smoke test completed successfully!")

if __name__ == "__main__":
    main()
