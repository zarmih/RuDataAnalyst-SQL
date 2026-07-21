import pytest
import torch

def test_imports():
    import transformers
    import datasets
    import accelerate
    import peft
    import trl
    import bitsandbytes
    assert True

def test_cuda_available():
    assert torch.cuda.is_available()

def test_device_capability():
    capability = torch.cuda.get_device_capability(0)
    # Check it's >= (8, 0)
    assert capability[0] >= 8

def test_gemm():
    x = torch.randn(100, 100, device="cuda", dtype=torch.float16)
    y = torch.randn(100, 100, device="cuda", dtype=torch.float16)
    z = torch.matmul(x, y)
    assert z.shape == (100, 100)
