# RuDataAnalyst-SQL Local Demo

This document describes how to run the local demo for RuDataAnalyst-SQL.

## Installation

1. Install dependencies:
   ```bash
   uv sync --extra serve
   ```

## Starting the Server

Start the FastAPI application with Uvicorn:
```bash
uv run uvicorn src.rudataanalyst_sql.serve.app:app --host 127.0.0.1 --port 8000
```
*(The first request will lazily load the Qwen3-4B model and QLoRA adapter into VRAM (~2.7GB). This might take up to 15 seconds).*

## Web UI

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

The page is a local analyst workspace:

*   Built-in domains and registered domains are separate groups. Demo files are `warehouse`, `subscriptions` and `logistics` after `generate_blind.py`. `shop`, `hr` and `support` are not domain ids in this tree.
*   **Только SQL** calls `POST /v1/sql/generate`. **Сгенерировать и выполнить** calls `POST /v1/sql/query`, which generates SQL from the question again. There is no control that executes the SQL already on screen.
*   Assumptions, server guardrails (`is_safe` / `is_hallucinated`) and model `confidence` (`high` / `medium` / `low`) are shown separately. Guardrails are not semantic correctness. Confidence is not a probability. A transport or validation error is not rendered as an SQL verdict.
*   `truncated: true` says how many rows were actually returned. `truncated: false` is not described as the size of the database. Zero rows, `NULL`, an empty string, `0` and `false` look different.
*   CSV export covers loaded rows only. `NULL` is an empty field, an empty string is `""`, and formula-like values are prefixed with an apostrophe.
*   **Показать схему базы** calls `GET /v1/schema/{domain_id}` and shows the server DDL text. A table and column list is parsed from that text only. **Вставить** puts a name into the question and does not send it. Relationships that are not written in the DDL are not added.
*   **В этой вкладке** keeps up to eight submitted questions and their answers until the tab closes. Choosing one shows that saved answer and fills the form. It does not generate again. A missing domain is not selected. Cancelling the wait does not keep an answer. **Скопировать ответ** copies the shown question, SQL, explanation, assumptions and the two statuses as plain text.
*   **Показать схему этой базы** appears when SQL is blocked or does not match the schema. It requests the schema of the domain that was submitted with that answer.
*   **Прекратить ожидание** aborts the browser wait only. The server may keep generating. There is no automatic retry.
*   Questions and results stay in the tab. They are not written to `localStorage`.

`/health` reports API availability and `model_loaded`. It does not mean a generation succeeded. Model load has no reliable percent, so the wait indicator is indeterminate and shows elapsed time.

## CLI

You can interact with the server using the built-in CLI:

```bash
# Check health
uv run python -m src.rudataanalyst_sql.serve.cli health

# List available domains
uv run python -m src.rudataanalyst_sql.serve.cli list-domains

# Generate SQL only
uv run python -m src.rudataanalyst_sql.serve.cli generate --domain warehouse --question "Покажи товары категории Electronics."

# Generate and safely execute query
uv run python -m src.rudataanalyst_sql.serve.cli query --domain subscriptions --question "Сколько всего активных подписок?"
```

## Security & Guardrails

The server provides several layers of protection against unsafe SQL:
1. **Structural check:** Rejects any SQL containing DDL/DML keywords (e.g. `INSERT`, `DROP`, `UPDATE`) or non-SELECT queries.
2. **Multiple Statements:** Rejects payloads with multiple statements to prevent piggy-backing.
3. **Hallucination Check:** Runs `EXPLAIN QUERY PLAN` on a read-only connection to ensure all tables, columns, and functions actually exist in the target schema.
4. **Execution Safety:** Limits result sets to 50 rows and uses a strictly read-only connection timeout.
