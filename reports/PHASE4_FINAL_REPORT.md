# Отчёт по завершению Phase 4 (QLoRA Training & Evaluation)

## 1. Размеры выборок и проверка на утечки (Leakage Validation)
- **Train split**: 600 примеров (на основе схем `shop` и `hr`).
- **Validation split**: 60 примеров (на основе схем `shop` и `hr`).
- **Challenge split**: 35 примеров (на основе схем `shop` и `hr`).
- **Frozen Test split**: 14 примеров (схема `support`).
- **Проверка на утечки (leakage_check.py)**: Успешно. Строгих пересечений SQL и вопросов между train/val/test нет. Схема `support` используется строго только в frozen test.

## 2. Основные категории ошибок Baseline
В ходе ручного анализа baseline (Qwen3-4B base) выявлены следующие системные проблемы:
1. **Date Logic**: Использование несовместимых с SQLite функций (напр., `EXTRACT()`, `MONTH()`, `YEAR()`) вместо `strftime()`.
2. **Агрегация и Фильтрация**: Ошибочная фильтрация по агрегированным значениям в блоке `WHERE` вместо `HAVING`.
3. **JOINs и Алиасы**: Использование алиасов таблиц без их объявления или неоднозначность в именах столбцов (ambiguous column names).

## 3. Конфигурация обучения, время, loss, peak VRAM
- **Базовая модель**: `Qwen/Qwen3-4B` (Apache-2.0, pinned revision `1cfa9a...`)
- **Формат обучения**: QLoRA (4-bit NF4, double quant, bfloat16 compute, gradient checkpointing)
- **Целевые модули (target modules)**: `q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj`
- **Гиперпараметры LoRA**: `r=16, alpha=32, dropout=0.05`
- **Гиперпараметры обучения**: batch size = 1, gradient accumulation = 8 (effective batch = 8), learning rate = 2e-4, epochs = 3, cosine lr scheduler.
- **Длина контекста**: 1024
- **Время обучения**: ~18 минут.
- **Финальные Loss**: Train Loss: `0.05704`, Eval Loss: `0.1338`.
- **Пиковое использование VRAM**: 3.50 GB (обучение), 2.77 GB (inference).

## 4. Сравнение метрик: Base vs Adapter
### Frozen Test (14 примеров):
*   **Base Qwen3-4B**:
    *   Exact Match: 2/14 (14.29%)
    *   Execution Match: 7/14 (50.0%)
*   **Adapter (Trained)**:
    *   Exact Match: 2/14 (14.29%)
    *   Execution Match: 8/14 (57.14%)

### Challenge Set (35 примеров):
*   **Adapter (Trained)**:
    *   Execution Match: 32/35 (91.43%)
    *   Execution Error: 2
    *   Unsafe SQL: 0

## 5. Примеры улучшений и ухудшений (Improved/Regressed)
- **Улучшения**: Модель стала уверенно использовать алиасы во всех `JOIN`, а также корректно применять `strftime()` для SQLite, избегая вымышленных диалектных функций.
- **Ухудшения**: В редких сложных запросах (например, вложенные `NOT IN` с агрегацией) модель все еще может выдать SQL, который падает с Execution Error.

## 6. Расположение адаптера и системный статус
- Локальный путь к адаптеру: `adapters/qwen3-4b-qlora` (добавлен в `.gitignore`).
- Pytest прошел успешно (9 passed, 14 warnings (от torch jit deprecation)).
- Модель выгружена из памяти GPU, утечек нет.
