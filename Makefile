.PHONY: setup check smoke test

setup:
	uv sync

check:
	uv run python src/rudataanalyst_sql/check_environment.py

smoke:
	uv run python src/rudataanalyst_sql/train_smoke.py

test:
	uv run pytest tests/

model-check:
	hf download Qwen/Qwen3-4B --exclude "*.gguf"

baseline:
	uv run python -m src.rudataanalyst_sql.inference.run_baseline

qlora-smoke:
	uv run python -m src.rudataanalyst_sql.training.run_qlora_smoke

phase2:
	uv run python src/rudataanalyst_sql/data/build_seed_dataset.py
	uv run python src/rudataanalyst_sql/data/validate_dataset.py
	uv run python src/rudataanalyst_sql/data/leakage_check.py
	uv run python src/rudataanalyst_sql/data/export_hf_dataset.py
	uv run pytest tests/test_data.py tests/test_evaluation.py

phase3: model-check baseline qlora-smoke test

