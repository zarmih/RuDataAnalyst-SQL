# DATASET CARD: RuDataAnalyst-SQL Balanced v2

## 1. Description
A balanced dataset containing Text-to-SQL pairs for Russian business analytics, distributed across three schema domains: `shop`, `hr`, `support`.

## 2. Splits and Distributions
*   **Total Generated Records**: 1035
*   **Train**: 900
*   **Validation**: 90
*   **Challenge**: 45
*   **Frozen Test**: 14 (not included in generation step)

### Domain Distribution
*   Shop: 345
*   HR: 345
*   Support: 345

### Difficulty Distribution
*   Easy: 431
*   Medium: 479
*   Hard: 125

## 3. Seed and Generation Parameters
*   Seed: 42
*   Methodology: Template-based mutation with safe-SQL verification and SQLite execution check.

## 4. Rejected Counters
During generation, some templates and mutations were rejected based on strict quality controls:
*   Duplicate NL: 23
*   Duplicate SQL: 225
*   Execution Error: 30
*   Unsafe SQL: 3
*   Empty/Invalid Semantic: 93
*   Leakage/Template Collision: 22

## 5. Limitations
The mutations are primarily variations in phrasing and polite requests. Syntactic diversity relies on the base seed examples.
