# RuDataAnalyst-SQL

RuDataAnalyst-SQL is a localized Text-to-SQL assistant tailored for Russian-language queries, running completely locally. It is designed to safely convert natural language questions into valid SQL `SELECT` queries based on a given database schema.

## Architecture

*   **Base Model**: `Qwen/Qwen3-4B`
*   **Adapter**: QLoRA SFT fine-tuned specifically for SQL instruction following in Russian.
*   **Server**: FastAPI backend with strict SQL guardrails (no destructive queries, single-statement limits, execution schema validation).
*   **UI**: Lightweight HTML/CSS/JS interface served via FastAPI.

## Verified Metrics (Phase 5)

Evaluated on a strictly blind hold-out benchmark across 3 unseen schemas:
*   **Execution Match**: 57.78% (Adapter) vs 42.22% (Base model)
*   **Safety**: 0 destructive queries generated
*   **Hallucinations**: Rare schema hallucinations (3 out of 45 cases)

## Local Demo

You can start the local demo server to try out the model yourself on built-in demo datasets.

### Installation

```bash
# Clone the repository and install dependencies
uv sync --extra serve
```

### Start the Server

```bash
# Start the FastAPI app
uv run uvicorn src.rudataanalyst_sql.serve.app:app --host 127.0.0.1 --port 8000
```

Once started, open `http://127.0.0.1:8000/` in your browser. The model weights are loaded lazily on the first request (~15s), utilizing approximately 2.7GB VRAM.

### API Example

```bash
curl -X POST http://127.0.0.1:8000/v1/sql/query \
  -H "Content-Type: application/json" \
  -d '{"domain": "shop", "question": "Покажи список самых дорогих товаров"}'
```

### Register Your Own Database

You can safely add your own SQLite databases to the local managed registry using the CLI:

```bash
uv run python -m src.rudataanalyst_sql.serve.cli schema add-sqlite --id mydb --db /path/to/my/data.sqlite
```

The database will be securely copied and validated. It will automatically appear in the Web UI under "Local Managed".
See [docs/SCHEMA_REGISTRY.md](docs/SCHEMA_REGISTRY.md) for more details.
