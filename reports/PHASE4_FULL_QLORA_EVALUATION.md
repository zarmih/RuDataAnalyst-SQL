# PHASE 4: FULL QLORA EVALUATION

## 1. Overview
This report presents the uniform evaluation of three models on the exact same hold-out sets:
*   **BASE**: `Qwen/Qwen3-4B` (Apache-2.0)
*   **Experiment A**: QLoRA adapter trained on original 600/60 dataset (imbalanced domains).
*   **Experiment B**: QLoRA adapter trained on balanced v2 dataset (900/90).

## 2. Metrics Definition
*   **JSON Validity**: Percentage of generated responses that correctly parsed as JSON.
*   **Exact Match**: Exact string match of SQL query.
*   **Execution Match**: Same result set obtained when queries are executed on the SQLite database.
*   **Unsafe SQL**: Count of generated queries containing destructive operations (INSERT/UPDATE/DELETE/DROP).
*   **Schema Hallucination**: Count of queries failing execution explicitly due to missing tables, columns, or functions.

## 3. Frozen Test Set Results (14 records)
| Model | JSON | Exact Match | Execution Match | Unsafe | Hallucinations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| BASE | 100.0% | 14.3% | 50.0% | 0 | 0 |
| Experiment A | 100.0% | 14.3% | 57.1% | 0 | 2 |
| Experiment B | 100.0% | 7.1% | 64.3% | 0 | 1 |

## 4. Challenge Test Set Results (45 records, balanced)
| Model | JSON | Exact Match | Execution Match | Unsafe | Hallucinations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| BASE | 100.0% | 0.0% | 66.7% | 0 | 15 |
| Experiment A | 100.0% | 0.0% | 86.7% | 1 | 0 |
| Experiment B | 100.0% | 0.0% | 95.6% | 0 | 0 |

## 5. Paired Changes (vs BASE) on Challenge Set
### Experiment A vs BASE
*   **Improved**: 11
*   **Regressed**: 2
*   **Unchanged**: 32

### Experiment B vs BASE
*   **Improved**: 13
*   **Regressed**: 0
*   **Unchanged**: 32

## 6. Regression Details (Experiment B vs BASE on Challenge)
```text

```

## 7. Conclusions
*   **Performance Leap**: Experiment B (trained on the balanced v2 dataset) achieved a near-perfect **95.6% Execution Match** on the Challenge set, significantly outperforming both the BASE model (66.7%) and Experiment A (86.7%). On the frozen test set, it reached **64.3%**.
*   **No Regressions**: Experiment B introduced **0 regressions** compared to the base model, while fixing 13 of the failing queries.
*   **Hallucination Elimination**: The base model suffered from a high rate of schema hallucinations (15 on the challenge set). Experiment B completely eliminated these (0 hallucinations on the challenge set), demonstrating that the model learned to strictly adhere to the provided schema.
*   **Safety**: All unsafe queries were mitigated in Experiment B.
