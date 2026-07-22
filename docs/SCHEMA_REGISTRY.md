# Schema Registry

RuDataAnalyst-SQL includes a managed schema registry to securely add your own SQLite databases for inference without modifying the project's source code or exposing arbitrary file paths to the HTTP API.

## How it works

1. You add a database via the local CLI `add-sqlite`.
2. The CLI performs atomicity, size, format, and structure checks (rejecting virtual/system tables and unsafe content).
3. The DB is copied securely to your user-specific runtime directory (`~/.local/share/rudataanalyst-sql/registry/` on Linux).
4. The API exposes registered databases by their `id`. The server never reads arbitrary paths from incoming HTTP requests.

## CLI Commands

List registered schemas:
```bash
uv run python -m src.rudataanalyst_sql.serve.cli schema list
```

Inspect a schema:
```bash
uv run python -m src.rudataanalyst_sql.serve.cli schema inspect <id>
```

Add a new SQLite database:
```bash
uv run python -m src.rudataanalyst_sql.serve.cli schema add-sqlite --id my_db --db /path/to/my_db.sqlite
```

Remove a schema:
```bash
uv run python -m src.rudataanalyst_sql.serve.cli schema remove my_db --yes
```

## UI Integration

Registered databases will automatically appear in the local Web UI under the "Local Managed" group after refreshing the page.
