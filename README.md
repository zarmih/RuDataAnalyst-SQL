# RuDataAnalyst-SQL

RuDataAnalyst-SQL is a localized Text-to-SQL assistant tailored for Russian-language queries, running completely locally. It is designed to safely convert natural language questions into valid SQL `SELECT` queries based on a given database schema.

## Architecture

*   **Base Model**: `Qwen/Qwen3-4B`
*   **Adapter**: QLoRA SFT fine-tuned specifically for SQL instruction following in Russian.
*   **Server**: FastAPI backend with strict SQL guardrails (no destructive queries, single-statement limits, execution schema validation).
*   **UI**: Local Russian analyst workspace (ES modules under `src/rudataanalyst_sql/serve/static/`). It keeps generation and execution apart, shows assumptions, server guardrails and model self-confidence separately, and exports only the rows the browser received.

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
  -d '{"domain": "warehouse", "question": "Покажи товары категории Electronics"}'
```

`/v1/sql/query` generates SQL from the question again. It does not execute SQL already shown in the UI. The workspace therefore has no "run this SQL" action.

### Schema by id

```bash
curl http://127.0.0.1:8000/v1/schema/warehouse
```

```json
{"domain": "warehouse", "source": "built_in", "dialect": "sqlite", "schema_sql": "CREATE TABLE ..."}
```

The id must match `^[A-Za-z0-9_-]{1,200}$` and an allowlisted built-in or registered domain. Unknown ids, dotted names and path-like ids return `400 {"detail":"domain_not_found"}`. The response does not include a filesystem path. Query parameters and a request body cannot point the server at a file. The page lists tables and columns parsed from `schema_sql` and still shows that text. Inserting a name only edits the question.

### CSV export

The UI exports only loaded rows, in server order, as UTF-8 with a BOM. `NULL` is an empty unquoted field. An empty string is `""`. `0` stays `0` and `false` stays `false`. Values that a spreadsheet could treat as a formula (`=`, `+`, `-`, `@`, tab or carriage return at the start, including negative numbers) get a leading apostrophe. When `truncated` is true, the UI says the file is only the shown part. `truncated: false` is the size of that response, not the size of the database.

Built-in demo files `warehouse.sqlite`, `subscriptions.sqlite` and `logistics.sqlite` are created by `src/rudataanalyst_sql/data/generate_blind.py` and are gitignored. Example buttons select a domain only when it is in the loaded list.

### Register Your Own Database

You can safely add your own SQLite databases to the local managed registry using the CLI:

```bash
uv run python -m src.rudataanalyst_sql.serve.cli schema add-sqlite --id mydb --db /path/to/my/data.sqlite
```

The database will be securely copied and validated. It will automatically appear in the Web UI under "Зарегистрированные".
See [docs/SCHEMA_REGISTRY.md](docs/SCHEMA_REGISTRY.md) for more details.

## Tests without a GPU

Frontend and API checks use `MOCK_MODEL=true`. They do not download Qwen weights and do not import torch. A passing mock run shows that the UI and the FastAPI contract work together. It does not show that real inference is correct or that the adapter is loaded.

```bash
uv venv --python 3.12 .venv-serve
uv pip install --python .venv-serve 'fastapi>=0.110' 'uvicorn>=0.29' 'pydantic>=2.7' 'httpx>=0.27' 'pytest>=9.1.1' 'platformdirs>=4.11'
MOCK_MODEL=true .venv-serve/bin/pytest tests/test_serve.py tests/test_registry.py -q

npm install
npm run test:csv
npm run test:e2e
```

`npm run test:e2e` starts `scripts/e2e_server.sh` on `127.0.0.1:8765` with `MOCK_MODEL=true`, `MOCK_SQL` pointed at a temporary `demo_items` table, and a private `RUDATA_RUNTIME_DIR`. Real model startup remains:

```bash
uv sync --extra serve
uv run uvicorn src.rudataanalyst_sql.serve.app:app --host 127.0.0.1 --port 8000
```

That path installs torch and loads weights on the first question. This workspace was not smoke-tested with the real model: the machine is an Apple M4 without the project's NVIDIA GPU, the adapter directory is absent, and torch was not installed for these checks.
