"""
Smoke test: создаёт крошечную causal LM из конфигурации (без скачивания),
применяет PEFT LoRA и выполняет 5 шагов SFT на синтетических данных.
Доказывает работу GPU, backward pass, LoRA и сохранение адаптера.
"""

import gc
import os
import shutil
import torch
from transformers import (
    GPT2Config,
    GPT2LMHeadModel,
    PreTrainedTokenizerFast,
    TrainingArguments,
)
from tokenizers import Tokenizer, models, trainers, pre_tokenizers
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer
from datasets import Dataset


def build_tiny_tokenizer(vocab_size: int = 256) -> PreTrainedTokenizerFast:
    """Создаёт простой BPE-токенизатор локально, без загрузки из сети."""
    tok = Tokenizer(models.BPE())
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=["<pad>", "<eos>", "<bos>", "<unk>"],
        show_progress=False,
    )
    # Обучаем на синтетическом корпусе
    corpus = [
        "SELECT id, name FROM users WHERE age > 30;",
        "INSERT INTO orders (user_id, total) VALUES (1, 99.9);",
        "UPDATE products SET price = 10.5 WHERE category = 'books';",
        "DELETE FROM sessions WHERE expires_at < NOW();",
        "SELECT COUNT(*) FROM transactions GROUP BY status;",
    ] * 20
    tok.train_from_iterator(corpus, trainer)
    fast = PreTrainedTokenizerFast(tokenizer_object=tok)
    fast.pad_token = "<pad>"
    fast.eos_token = "<eos>"
    fast.bos_token = "<bos>"
    fast.unk_token = "<unk>"
    return fast


def build_tiny_model(vocab_size: int = 256) -> GPT2LMHeadModel:
    """Крошечная GPT2 — 2 слоя, hidden=64. Весит ~0.5 МБ."""
    config = GPT2Config(
        vocab_size=vocab_size,
        n_embd=64,
        n_layer=2,
        n_head=2,
        n_inner=128,
        max_position_embeddings=128,
    )
    return GPT2LMHeadModel(config)


def run_smoke_test():
    output_dir = "./outputs/smoke_test"
    adapter_dir = os.path.join(output_dir, "adapter")

    print("=" * 50)
    print("SFT/LoRA Smoke Test (fully local, no downloads)")
    print("=" * 50)

    # 1. Токенизатор
    print("[1/6] Building local tokenizer...")
    tokenizer = build_tiny_tokenizer(vocab_size=256)
    print(f"       Vocab size: {tokenizer.vocab_size}")

    # 2. Модель
    print("[2/6] Building tiny GPT2 model from config...")
    model = build_tiny_model(vocab_size=256).to("cuda", dtype=torch.bfloat16)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"       Total params: {total_params:,}")

    # 3. LoRA
    print("[3/6] Applying LoRA adapter...")
    lora_config = LoraConfig(
        r=4,
        lora_alpha=8,
        target_modules=["c_attn"],
        lora_dropout=0.0,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 4. Синтетический датасет
    print("[4/6] Preparing synthetic dataset...")
    texts = [
        "Given schema users(id,name,age), write SQL: SELECT name FROM users WHERE age > 25;",
        "Given schema orders(id,user_id,total), write SQL: SELECT SUM(total) FROM orders;",
        "Given schema products(id,name,price), write SQL: SELECT * FROM products WHERE price < 100;",
        "Given schema sessions(id,user_id,expires_at), write SQL: DELETE FROM sessions WHERE expires_at < NOW();",
        "Given schema transactions(id,amount,status), write SQL: SELECT COUNT(*) FROM transactions GROUP BY status;",
    ] * 4  # 20 samples
    dataset = Dataset.from_dict({"text": texts})

    # 5. Обучение
    print("[5/6] Starting SFT training (5 steps)...")
    training_args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=2,
        max_steps=5,
        logging_steps=1,
        save_strategy="no",
        bf16=True,
        report_to="none",
        optim="adamw_torch",
        learning_rate=1e-3,
        dataloader_pin_memory=False,
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        processing_class=tokenizer,
        args=training_args,
    )

    train_result = trainer.train()
    metrics = train_result.metrics
    print(f"       Training loss: {metrics.get('train_loss', 'N/A'):.4f}")
    print(f"       Runtime: {metrics.get('train_runtime', 'N/A'):.2f}s")

    # 6. Сохранение адаптера
    print("[6/6] Saving LoRA adapter...")
    model.save_pretrained(adapter_dir)
    saved_files = os.listdir(adapter_dir)
    print(f"       Saved to {adapter_dir}: {saved_files}")

    # Cleanup
    print("\nCleaning up GPU memory...")
    del trainer
    del model
    del tokenizer
    gc.collect()
    torch.cuda.empty_cache()

    mem_allocated = torch.cuda.memory_allocated(0) / 1024**2
    mem_reserved = torch.cuda.memory_reserved(0) / 1024**2
    print(f"GPU memory — allocated: {mem_allocated:.1f} MiB, reserved: {mem_reserved:.1f} MiB")

    # Удаляем артефакты smoke test
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
        print(f"Cleaned up {output_dir}")

    print("\n✅ Smoke test PASSED — GPU, backward, LoRA, save all working.")


if __name__ == "__main__":
    run_smoke_test()
