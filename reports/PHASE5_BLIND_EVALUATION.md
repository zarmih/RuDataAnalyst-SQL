# PHASE 5: BLIND BENCHMARK EVALUATION (CROSS-SCHEMA GENERALIZATION)

## 1. Overview
This report presents the honest, single-run evaluation of the baseline model vs. the final fine-tuned model (`Experiment B` adapter) on a strictly blind dataset. 
The blind benchmark contains 45 manual queries spread across 3 entirely new schemas (`warehouse`, `subscriptions`, `logistics`) that the model has never encountered.

## 2. Tested Models
*   **BASE**: `Qwen/Qwen3-4B` (Apache-2.0, pinned revision)
*   **Adapter (Exp B)**: `qwen3-4b-qlora-balanced-v2`
*   **Decoding**: Deterministic (do_sample=False, temperature ignored), `enable_thinking=False`.

## 3. Metrics Summary (45 records)
| Model | Exact Match | Execution Match | Unsafe | Schema Hallucinations | Mean Latency | Peak VRAM |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BASE** | 6.67% (3/45) | **42.22%** (19/45) | 0 | 1 | ~10.2s | 2.61 GB |
| **Exp B** | 13.33% (6/45) | **57.78%** (26/45) | 0 | 3 | ~9.2s | 2.74 GB |

## 4. Paired Analysis (Exp B vs BASE)
*   **Improved**: 10
*   **Regressed**: 3
*   **Unchanged**: 32

### Error Categories & Limitations
While the fine-tuned model (Exp B) outperforms the BASE model in execution accuracy (57.78% vs 42.22%), the absolute performance dropped significantly compared to the 95.6% achieved on the in-domain Challenge set.

**Key Learnings and Failures:**
1. **Schema Overfitting / Cross-Domain Hallucinations**:
   The adapter regressed on 3 queries. In two cases (`blind_warehouse_009`, `blind_warehouse_011`), the adapter hallucinates a `categories` table, failing with `no such table: categories`. It failed to generalize that `category` was a simple text column within the `products` table, likely because it overfitted to the `shop` schema in the training set where categories might have been a separate table.
2. **Generalization Gap**: The massive drop from 95.6% (in-domain) to 57.78% (out-of-domain) demonstrates that a 900-sample dataset across 3 schemas is insufficient to teach a 4B model universal SQL reasoning. It instead learned domain-specific schema mappings.
3. **Safety Maintained**: Despite the performance drop, the model generated 0 unsafe/destructive operations.

## 5. Conclusion
Phase 5 successfully proves the necessity of blind hold-out benchmarks. The adapter improved general SQL structure generation but suffered from schema-assumption overfitting. Future phases require a massive expansion of the training dataset's schema diversity (e.g., using Spider or BIRD datasets) to achieve true Text-to-SQL generalization.
