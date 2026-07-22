import re
import sqlite3
from typing import Tuple, Optional
from src.rudataanalyst_sql.utils.sql_utils import is_safe_sql

def check_hallucination_and_safety(sql: str, db_path: str) -> Tuple[bool, bool, Optional[str]]:
    """
    Checks if the SQL is safe (SELECT only) and free of schema hallucinations.
    Returns: (is_safe, is_hallucinated, error_message)
    """
    if not sql.strip():
        return False, False, "Empty SQL"

    # 1. Structural safety
    if not is_safe_sql(sql):
        return False, False, "Unsafe or non-SELECT SQL detected."
        
    # Check for multiple statements (naively: more than one semicolon not at the end)
    statements = [s for s in sql.split(";") if s.strip()]
    if len(statements) > 1:
        return False, False, "Multiple SQL statements are not allowed."
        
    # 2. Schema Hallucination Check via EXPLAIN
    try:
        uri = f"file:{db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=2.0)
        conn.execute("PRAGMA query_only = ON;")
        
        # EXPLAIN QUERY PLAN catches missing tables/columns without executing the query
        conn.execute(f"EXPLAIN QUERY PLAN {sql}")
        conn.close()
    except sqlite3.OperationalError as e:
        err_str = str(e).lower()
        if "no such table" in err_str or "no such column" in err_str or "no such function" in err_str:
            return True, True, f"Schema hallucination: {str(e)}"
        return True, False, f"SQL error: {str(e)}"
    except Exception as e:
        return True, False, f"Unexpected error: {str(e)}"
        
    return True, False, None
