import sys
import platform

def check_env():
    print("="*40)
    print("Environment Check")
    print("="*40)
    print(f"OS: {platform.system()} {platform.release()}")
    print(f"Python: {sys.version}")

    try:
        import torch
        print(f"PyTorch Version: {torch.__version__}")
        print(f"CUDA Available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"Device Count: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                print(f"Device {i}: {torch.cuda.get_device_name(i)}")
                capability = torch.cuda.get_device_capability(i)
                print(f"Capability: {capability[0]}.{capability[1]}")
                
            # Smoke test tensor
            x = torch.randn(1000, 1000, device="cuda", dtype=torch.float16)
            y = torch.randn(1000, 1000, device="cuda", dtype=torch.float16)
            z = torch.matmul(x, y)
            print(f"GEMM Test OK, resulting shape: {z.shape}")
    except ImportError:
        print("PyTorch not installed.")
    
    try:
        import bitsandbytes as bnb
        print(f"bitsandbytes Version: {bnb.__version__}")
    except ImportError as e:
        print(f"bitsandbytes error: {e}")
        
    try:
        import peft
        import trl
        import accelerate
        import transformers
        print(f"PEFT: {peft.__version__}, TRL: {trl.__version__}, Accelerate: {accelerate.__version__}, Transformers: {transformers.__version__}")
    except ImportError as e:
        print(f"Missing libraries: {e}")

if __name__ == "__main__":
    check_env()
