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

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser. You can select a demo database (like `shop`, `hr`, or `support`), enter a Russian question, and execute a query securely. The UI provides badges for SQL safety and confidence.

## CLI

You can interact with the server using the built-in CLI:

```bash
# Check health
uv run python -m src.rudataanalyst_sql.serve.cli health

# List available domains
uv run python -m src.rudataanalyst_sql.serve.cli list-domains

# Generate SQL only
uv run python -m src.rudataanalyst_sql.serve.cli generate --domain shop --question "Покажи топ-3 активных пользователей"

# Generate and safely execute query
uv run python -m src.rudataanalyst_sql.serve.cli query --domain shop --question "Покажи топ-3 активных пользователей"
```

## Security & Guardrails

The server provides several layers of protection against unsafe SQL:
1. **Structural check:** Rejects any SQL containing DDL/DML keywords (e.g. `INSERT`, `DROP`, `UPDATE`) or non-SELECT queries.
2. **Multiple Statements:** Rejects payloads with multiple statements to prevent piggy-backing.
3. **Hallucination Check:** Runs `EXPLAIN QUERY PLAN` on a read-only connection to ensure all tables, columns, and functions actually exist in the target schema.
4. **Execution Safety:** Limits result sets to 50 rows and uses a strictly read-only connection timeout.
