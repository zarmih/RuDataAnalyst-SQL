.PHONY: setup check smoke test

setup:
	uv sync

check:
	uv run python src/finetune_portfolio/check_environment.py

smoke:
	uv run python src/finetune_portfolio/train_smoke.py

test:
	uv run pytest tests/

model-check:
	hf download Qwen/Qwen3-4B --exclude "*.gguf"

baseline:
	uv run python -m src.finetune_portfolio.inference.run_baseline

qlora-smoke:
	uv run python -m src.finetune_portfolio.training.run_qlora_smoke

phase2:
	uv run python src/finetune_portfolio/data/build_seed_dataset.py
	uv run python src/finetune_portfolio/data/validate_dataset.py
	uv run python src/finetune_portfolio/data/leakage_check.py
	uv run python src/finetune_portfolio/data/export_hf_dataset.py
	uv run pytest tests/test_data.py tests/test_evaluation.py

phase3: model-check baseline qlora-smoke test

