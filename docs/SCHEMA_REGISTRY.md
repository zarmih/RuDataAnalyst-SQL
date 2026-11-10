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

Registered databases appear in the local Web UI in the "Зарегистрированные" group. Built-in demo databases stay in "Встроенные". The browser reloads the list from `GET /v1/domains`; it never sends a filesystem path.

## Read a schema by id

```bash
curl http://127.0.0.1:8000/v1/schema/my_db
```

The handler accepts only an allowlisted id (`^[A-Za-z0-9_-]{1,200}$`). The JSON body is `domain`, `source` (`built_in` or `managed`), `dialect` and `schema_sql`. It does not return the runtime directory or `database.sqlite` path. A missing id, a dotted name, or a path-like id returns `400` with `detail` `domain_not_found`. `POST` is not accepted. Extra query parameters are ignored and are not used as a path. The page lists tables and columns by reading that `schema_sql`. It does not invent tables or relationships, and the original DDL stays on screen.
