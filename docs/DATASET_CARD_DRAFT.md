# Dataset Card: Russian Text-to-SQL MVP

## Description
A synthetic seed dataset for fine-tuning a small LLM (~3-4B) to generate SQLite SELECT queries from Russian natural language questions.

## Motivation
To serve as a reproducible baseline for a data analytics project, evaluating the transfer capabilities of base models on the Russian Text-to-SQL task.

## Data Structure
- `id`: Unique identifier
- `database_id`: DB schema context (shop, hr, support)
- `schema_sql`: DDL of the database
- `question_ru`: Russian question
- `sql`: Gold SQL (SELECT-only)
- `explanation_ru`: Chain-of-thought explanation
- `difficulty`: easy/medium/hard
- `concepts`: SQL concepts used (e.g., join, group_by)

## Splits
- **Train**: ~40 examples (shop, hr)
- **Validation**: ~8 examples (shop, hr) - held-out questions
- **Test**: ~14 examples (support) - held-out schema family

## Leakage Prevention
Strict separation between `train`/`validation` (shop, hr databases) and `test` (support database). Automated tests ensure no cross-contamination of SQL or exact questions.
