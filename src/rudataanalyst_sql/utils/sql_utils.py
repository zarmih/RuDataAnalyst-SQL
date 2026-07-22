import re

DESTRUCTIVE_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA\s+(?!table_info|database_list))\b",
    re.IGNORECASE,
)

def is_safe_sql(sql: str) -> bool:
    """Checks if SQL is structurally safe (only SELECT/WITH and no destructive keywords)."""
    stripped = sql.strip().rstrip(";").strip()
    if not stripped:
        return False
    # Must start with SELECT or WITH
    if not re.match(r"^\s*(SELECT|WITH)\b", stripped, re.IGNORECASE):
        return False
    # Must not contain destructive keywords
    if DESTRUCTIVE_PATTERN.search(stripped):
        return False
    return True
