import yaml
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

def load_config(path: str):
    with open(path, "r") as f:
        return yaml.safe_load(f)

def get_model_and_tokenizer(base_config, quant_config=None, device_map="auto"):
    model_id = base_config["model_id"]
    revision = base_config.get("revision", "main")
    
    bnb_config = None
    if quant_config == "nf4":
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16
        )
    
    tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        revision=revision,
        quantization_config=bnb_config,
        torch_dtype=torch.bfloat16 if not bnb_config else None,
        device_map=device_map
    )
    
    return model, tokenizer
