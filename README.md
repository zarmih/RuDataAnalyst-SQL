# RuDataAnalyst-SQL

Изолированное и воспроизводимое окружение для проекта по fine-tuning локальной LLM методом QLoRA/SFT на NVIDIA RTX 5070 Ti 16 GB (Blackwell, sm_120).

## Быстрый старт

```bash
cd /home/mikhail/Documents/RuDataAnalyst-SQL

# Установка зависимостей
make setup          # или: uv sync

# Проверка GPU / CUDA / библиотек
make check

# Smoke test — LoRA SFT на локальной мини-модели (без скачивания)
make smoke

# Запуск pytest
make test
```

## Структура проекта

```
RuDataAnalyst-SQL/
├── configs/qlora_smoke.yaml          # конфигурация для smoke test
├── src/rudataanalyst_sql/
│   ├── __init__.py
│   ├── check_environment.py          # проверка GPU, CUDA, стека
│   └── train_smoke.py                # SFT/LoRA smoke test (локальная мини-модель)
├── tests/test_environment.py         # pytest: импорты, CUDA, GEMM
├── reports/ENVIRONMENT_SETUP_REPORT.md
├── pyproject.toml
├── uv.lock
├── Makefile
├── .gitignore
├── .env.example
└── README.md
```

## Ключевые версии

| Компонент | Версия |
|-----------|--------|
| Python | 3.12.13 |
| PyTorch | 2.13.0+cu130 |
| Transformers | 5.14.1 |
| PEFT | 0.19.1 |
| TRL | 1.8.0 |
| bitsandbytes | 0.49.2 |
| Accelerate | 1.14.0 |
| CUDA (driver) | 13.2 |
| GPU | RTX 5070 Ti (sm_120) |

## Вход в Hugging Face (позже)

```bash
# 1. Получите токен: https://huggingface.co/settings/tokens
# 2. Войдите:
uv run huggingface-cli login
# Введите токен в интерактивном промпте
```

## Дальнейший план

1. **Выбор базовой модели** — `Qwen3-4B` (Apache-2.0) как основная модель. (Исторический кандидат `Qwen2.5-3B-Instruct` сохранён в `legacy/` как NON-COMMERCIAL qwen-research эксперимент).
2. **Dataset Card** — подготовка набора инструкций (schema → SQL) на русском языке
3. **Baseline** — замер качества базовой модели без обучения
4. **QLoRA fine-tuning** — 4-bit квантизация + LoRA адаптеры, полный цикл обучения
5. **Evaluation** — оценка качества на тестовых SQL-задачах (exact match, execution accuracy)
6. **Publishing** — выгрузка LoRA-адаптера и model card на Hugging Face
