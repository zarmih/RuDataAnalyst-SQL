#!/usr/bin/env bash
# Local-only mock server for browser tests. Does not use the user registry.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${RUDATA_PYTHON:-$ROOT/.venv-serve/bin/python}"
if [[ ! -x "$PY" ]]; then
  echo "Missing $PY. See README, section Tests without GPU." >&2
  exit 1
fi
PORT="${RUDATA_E2E_PORT:-8765}"
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
export RUDATA_RUNTIME_DIR="$ROOT/.e2e-runtime"
export MOCK_MODEL=true
export MOCK_SQL="SELECT sku, note, qty, active FROM demo_items"
rm -rf "$RUDATA_RUNTIME_DIR"
mkdir -p "$RUDATA_RUNTIME_DIR"
"$PY" "$ROOT/scripts/prepare_e2e_db.py"
exec "$PY" -m uvicorn src.rudataanalyst_sql.serve.app:app --host 127.0.0.1 --port "$PORT"
