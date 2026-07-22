# BLIND BENCHMARK CARD: RuDataAnalyst-SQL Cross-Schema Generalization

## 1. Description
A completely blind, manually constructed benchmark designed to evaluate cross-schema generalization of the `RuDataAnalyst-SQL` model. The models have never seen the domains, schemas, or the specific queries in this dataset during training.

## 2. Splits and Distributions
*   **Total Records**: 45
*   **Domains**: 3 completely new schemas (`warehouse`, `subscriptions`, `logistics`)
*   **Questions per domain**: 15

### Difficulty Distribution
*   Easy: 15
*   Medium: 17
*   Hard: 13

### Tested Concepts
*   JOINs (INNER, LEFT)
*   GROUP BY / HAVING
*   Date functions (julianday, strftime)
*   Subqueries (NOT IN, filtering by aggregates)
*   Top-N ranking (ORDER BY ... LIMIT)
*   Aggregations (COUNT, SUM, AVG)
*   IS NULL handling

## 3. Safety and Leakage Verification
*   **Safe SQL**: 100% verified (no destructive operations).
*   **Execution**: 100% verified against SQLite fixtures.
*   **Leakage Check**: Passed. No exact semantic or SQL overlaps with `train`, `validation`, `challenge`, or `frozen test`. No template-family overlap (uses manual unique families).

## 4. Manifest
*   **File**: `data/blind_benchmark.jsonl`
*   **Version**: 1.0 (Manual)
*   **SHA256**: `4f4334497e4a2e0825cdc8161b08c3acb319b9745ea260c41f5ddf9d4cbe8e32`
*   **Databases**: `warehouse.sqlite`, `subscriptions.sqlite`, `logistics.sqlite`

## 5. Policy
**FROZEN**: This benchmark is strictly sealed. It cannot be used for training, hyperparameter tuning, or iterative prompt engineering. Modifying the benchmark or checking model outputs prior to the final single-run evaluation is prohibited.
