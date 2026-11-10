"""Create the throwaway SQLite database used by the mock-worker e2e server.

The file is copied into RUDATA_RUNTIME_DIR. It is not a user database.
"""
import os
import sqlite3
from pathlib import Path

from src.rudataanalyst_sql.serve.registry import add_sqlite_schema


def main():
    runtime = os.environ.get("RUDATA_RUNTIME_DIR")
    if not runtime:
        raise SystemExit("RUDATA_RUNTIME_DIR is required")
    root = Path(runtime)
    root.mkdir(parents=True, exist_ok=True)
    db_path = root / "seed.sqlite"
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE demo_items (
            sku TEXT,
            note TEXT,
            qty INTEGER,
            active INTEGER
        )
        """
    )
    long_note = "я" * 140
    conn.executemany(
        "INSERT INTO demo_items (sku, note, qty, active) VALUES (?, ?, ?, ?)",
        [
            ("Альфа", None, 0, 0),
            ("", "", 2, 1),
            ("<img src=x onerror=alert(1)>", "<script>alert(1)</script>", 5, 1),
            ("=2+2", long_note, 7, 0),
        ],
    )
    conn.commit()
    conn.close()
    add_sqlite_schema("e2e_demo", str(db_path))


if __name__ == "__main__":
    main()
