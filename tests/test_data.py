import pytest
from src.finetune_portfolio.data.validate_dataset import validate_all
from src.finetune_portfolio.data.leakage_check import check_leakage

def test_dataset_validity():
    is_valid, errors, stats = validate_all()
    assert is_valid, f"Dataset validation failed: {errors[:5]}"
    assert stats["valid"] > 60, f"Expected >60 valid examples, got {stats['valid']}"

def test_data_leakage():
    has_leakage, findings, stats = check_leakage()
    assert not has_leakage, f"Data leakage detected: {findings[:5]}"
