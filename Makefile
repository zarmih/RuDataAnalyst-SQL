.PHONY: setup check smoke test

setup:
	uv sync

check:
	uv run python src/finetune_portfolio/check_environment.py

smoke:
	uv run python src/finetune_portfolio/train_smoke.py

test:
	uv run pytest tests/
