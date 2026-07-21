# Environment Setup Report

**Дата:** 2026-07-21
**Проект:** RuDataAnalyst-SQL
**Путь:** `/home/mikhail/Documents/RuDataAnalyst-SQL`

---

## 1. Система

| Параметр | Значение |
|----------|----------|
| ОС | Linux 7.0.0-27-generic (Ubuntu) |
| CPU | Intel Core i5-10400F |
| RAM | 64 GB |
| GPU | NVIDIA GeForce RTX 5070 Ti (16 GB VRAM) |
| Compute Capability | 12.0 (sm_120, Blackwell) |
| NVIDIA Driver | 595.71.05 |
| CUDA Version (driver) | 13.2 |
| Диск (/) | 275G total, 54G free |

## 2. Окружение

| Компонент | Версия |
|-----------|--------|
| uv | 0.11.24 |
| Python (проект) | 3.12.13 (CPython, Clang 22.1.3) |
| Python (система) | 3.14.4 (не затронут) |
| venv путь | `.venv/` (изолированный, uv managed) |

## 3. Установленный стек

| Пакет | Версия |
|-------|--------|
| torch | 2.13.0+cu130 |
| transformers | 5.14.1 |
| datasets | 5.0.0 |
| accelerate | 1.14.0 |
| peft | 0.19.1 |
| trl | 1.8.0 |
| bitsandbytes | 0.49.2 |
| sentencepiece | 0.2.2 |
| protobuf | 7.35.1 |
| safetensors | 0.8.0 |
| huggingface_hub | 1.24.0 |
| pytest | 9.1.1 |
| jupyter | 1.1.1 |
| ipykernel | 7.3.0 |
| triton | 3.7.1 |
| nvidia-cudnn-cu13 | 9.20.0.48 |
| nvidia-nccl-cu13 | 2.29.7 |

Всего установлено **164 пакета** (включая transitive dependencies).

## 4. Проверки (Smoke Tests)

### A. Импорт основного стека
✅ Все библиотеки импортируются корректно (torch, transformers, datasets, accelerate, peft, trl, bitsandbytes).

### B. CUDA / GPU
✅ `torch.cuda.is_available()` = True
✅ Device: NVIDIA GeForce RTX 5070 Ti
✅ Compute Capability: 12.0 (sm_120)
✅ GEMM тест (1000×1000 float16 matmul) — OK

### C. bitsandbytes
✅ `bitsandbytes` 0.49.2 импортируется без ошибок.
⚠️ Полноценная 4-bit квантизация (QLoRA NF4) не тестировалась без большой модели.
   bitsandbytes 0.49.2 поддерживает sm_120 — ожидается штатная работа при загрузке реальной модели.

### D. SFT/LoRA Pipeline
✅ Создана локальная мини-модель GPT2 (2 слоя, hidden=64, ~91K параметров) — без скачивания.
✅ Построен локальный BPE-токенизатор из синтетического корпуса (vocab=196).
✅ Применены LoRA-адаптеры (r=4, alpha=8, target=c_attn) — 2,048 trainable params (2.19%).
✅ SFT training 5 шагов — loss: 5.41 → стабильный, grad_norm адекватный.
✅ Runtime: 0.61s.
✅ LoRA-адаптер сохранён в safetensors формате.

### E. GPU Cleanup
✅ После smoke test нет Python/training процессов на GPU.
✅ GPU memory allocated: 64.0 MiB (фоновые), reserved: 64.0 MiB.

### F. pytest
✅ **4/4 тестов PASSED** (6.84s):
- `test_imports` — все библиотеки
- `test_cuda_available` — CUDA доступна
- `test_device_capability` — capability >= 8.0
- `test_gemm` — матричное умножение на GPU

## 5. Обнаруженные ограничения

1. **bitsandbytes 0.49.2** — может не иметь полной поддержки sm_120 для всех kernel'ов. При реальном QLoRA с NF4 квантизацией необходимо проверить работу. Если возникнут проблемы — обновить до свежей версии или использовать fp16/bf16 LoRA без квантизации.
2. **Unsloth** — не установлен. Рекомендуется тестировать отдельно при необходимости, т.к. может конфликтовать с текущими версиями torch/transformers.
3. **Место на диске** — 54 GB свободно. Достаточно для 3-4B модели, но при работе с несколькими моделями может потребоваться очистка.

## 6. Команды для воспроизведения

```bash
cd /home/mikhail/Documents/RuDataAnalyst-SQL

# Активация окружения и установка
uv sync

# Проверка GPU и стека
uv run python src/rudataanalyst_sql/check_environment.py

# Smoke test (LoRA SFT, полностью локальный)
uv run python src/rudataanalyst_sql/train_smoke.py

# pytest
uv run pytest tests/ -v
```
