#!/usr/bin/env python3
"""
Safe SQLite executor for evaluation.
Executes SELECT-only queries in read-only mode with timeout and row limits.
"""

import re
import sqlite3
from pathlib import Path

DESTRUCTIVE_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA\s+(?!table_info|database_list))\b",
    re.IGNORECASE,
)

MAX_ROWS = 1000
TIMEOUT_SECONDS = 5


class UnsafeSQLError(Exception):
    """Raised when SQL contains non-SELECT statements."""
    pass


class ExecutionError(Exception):
    """Raised when SQL execution fails."""
    pass


def is_safe_sql(sql: str) -> bool:
    """Check that SQL is SELECT-only and doesn't contain destructive operations."""
    stripped = sql.strip().rstrip(";").strip()
    if not stripped:
        return False
    # Must start with SELECT or WITH (for CTEs)
    if not re.match(r"^\s*(SELECT|WITH)\b", stripped, re.IGNORECASE):
        return False
    # Must not contain destructive keywords
    if DESTRUCTIVE_PATTERN.search(stripped):
        return False
    return True


def execute_sql(
    db_path: str | Path,
    sql: str,
    max_rows: int = MAX_ROWS,
    timeout: float = TIMEOUT_SECONDS,
) -> list[tuple]:
    """
    Execute a SELECT query safely.

    Returns list of result tuples.
    Raises UnsafeSQLError if SQL is not safe.
    Raises ExecutionError if execution fails.
    """
    if not is_safe_sql(sql):
        raise UnsafeSQLError(f"Unsafe or non-SELECT SQL: {sql[:100]}...")

    db_path = Path(db_path)
    if not db_path.exists():
        raise ExecutionError(f"Database not found: {db_path}")

    try:
        # Open in read-only mode via URI
        uri = f"file:{db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=timeout)
        conn.execute("PRAGMA query_only = ON;")
        cursor = conn.execute(sql)
        rows = cursor.fetchmany(max_rows + 1)
        if len(rows) > max_rows:
            rows = rows[:max_rows]
        conn.close()
        return rows
    except sqlite3.Error as e:
        raise ExecutionError(f"SQL execution error: {e}") from e


def execute_and_compare(
    db_path: str | Path,
    gold_sql: str,
    pred_sql: str,
    order_matters: bool = False,
) -> dict:
    """
    Execute gold and predicted SQL, compare results.

    Returns dict with:
      - gold_results: list of tuples
      - pred_results: list of tuples
      - execution_match: bool (result sets are equal)
      - gold_error: str or None
      - pred_error: str or None
    """
    result = {
        "gold_results": None,
        "pred_results": None,
        "execution_match": False,
        "gold_error": None,
        "pred_error": None,
    }

    # Execute gold
    try:
        result["gold_results"] = execute_sql(db_path, gold_sql)
    except (UnsafeSQLError, ExecutionError) as e:
        result["gold_error"] = str(e)
        return result

    # Execute predicted
    try:
        result["pred_results"] = execute_sql(db_path, pred_sql)
    except (UnsafeSQLError, ExecutionError) as e:
        result["pred_error"] = str(e)
        return result

    # Compare
    gold = result["gold_results"]
    pred = result["pred_results"]

    if order_matters:
        result["execution_match"] = _normalize_rows(gold) == _normalize_rows(pred)
    else:
        result["execution_match"] = (
            set(_hashable_rows(gold)) == set(_hashable_rows(pred))
        )

    return result


def _normalize_value(v):
    """Normalize a single value for comparison: handle floats, None."""
    if v is None:
        return None
    if isinstance(v, float):
        return round(v, 6)
    return v


def _normalize_rows(rows: list[tuple]) -> list[tuple]:
    return [tuple(_normalize_value(v) for v in row) for row in rows]


def _hashable_rows(rows: list[tuple]) -> list[tuple]:
    return [tuple(_normalize_value(v) for v in row) for row in rows]
