from pathlib import Path
from typing import Optional, Literal, Dict, Any

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM


_MODEL_ALIASES = {
    "gemma": "gemma-3-1b-it-sft-dpo",
    "qwen":  "Qwen3-0.6B-sft-dpo",
}

class LocalLLM:
    """
    Simple local runner for chat/instruction models.
    - Loads tokenizer + model from a local folder (no internet)
    - Generates text with reasonable defaults (CPU/GPU autodetect)
    """

    def __init__(
        self,
        model: Literal["gemma", "qwen"] = "gemma",
        base_dir: Optional[Path] = None,
        max_new_tokens: int = 256,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ):
        self.base_dir = base_dir or Path(__file__).parent
        self.model_key = model
        self.max_new_tokens = max_new_tokens
        self.temperature = temperature
        self.top_p = top_p

        self._device, self._dtype, self._device_map = self._pick_device()
        self._tokenizer = None
        self._model = None

        self._load_model()

    # ------------------------------ public API
    def set_model(self, model: Literal["gemma","qwen"]) -> None:
        if model == self.model_key:
            return
        self.model_key = model
        self._load_model()

    def generate(self, question: str, system_prompt: Optional[str] = None) -> str:
        prompt = self._build_prompt(question, system_prompt)
        tk = self._tokenizer(
            prompt,
            return_tensors="pt",
            add_special_tokens=True,
            padding=False  # single prompt → no pad tokens
        )

        input_ids = tk["input_ids"].to(self._model.device)
        attention_mask = tk["attention_mask"].to(self._model.device)

        with torch.no_grad():
            output_ids = self._model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_new_tokens=self.max_new_tokens,
                do_sample=True,
                temperature=self.temperature,
                top_p=self.top_p,
                pad_token_id=self._tokenizer.eos_token_id,
                eos_token_id=self._tokenizer.eos_token_id,
            )

        # Return only the newly generated text (skip the prompt)
        gen_ids = output_ids[0, input_ids.shape[-1]:]
        print(self._tokenizer.decode(gen_ids, skip_special_tokens=True).strip())
        return self._tokenizer.decode(gen_ids, skip_special_tokens=True).strip()

    # ------------------------------ internals
    def _resolve_model_dir(self) -> Path:
        name = _MODEL_ALIASES.get(self.model_key, self.model_key)
        model_dir = self.base_dir / name
        if not model_dir.exists():
            raise FileNotFoundError(f"Local model not found: {model_dir}")
        return model_dir

    def _load_model(self):
        model_dir = self._resolve_model_dir()

        # Use slow tokenizer if fast is not available (e.g., SentencePiece)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_dir,
            local_files_only=True,
            use_fast=False,
            trust_remote_code=True,  # some small models use custom code
        )

        self._model = AutoModelForCausalLM.from_pretrained(
            model_dir,
            local_files_only=True,
            torch_dtype=self._dtype,
            device_map=self._device_map,     # "auto" if available; else CPU/MPS/CUDA
            trust_remote_code=True,
        )

        # ensure eos token if missing
        if self._tokenizer.eos_token_id is None and self._tokenizer.pad_token_id is not None:
            self._tokenizer.eos_token_id = self._tokenizer.pad_token_id

    def _pick_device(self):
        """
        Returns (device, dtype, device_map)
        Prefer device_map='auto' when accelerate is available;
        otherwise fallback to a single device.
        """
        device_map = "auto"
        dtype = torch.float16

        if torch.backends.mps.is_available():   # Apple Silicon
            device = torch.device("mps")
            device_map = {"": device}
            dtype = torch.float16
        elif torch.cuda.is_available():
            device = torch.device("cuda")
            # keep device_map='auto' to spread layers if multi-GPU
            dtype = torch.float16
        else:
            device = torch.device("cpu")
            device_map = {"": device}
            dtype = torch.float32

        return device, dtype, device_map

    def _build_prompt(self, question: str, system_prompt: Optional[str]) -> str:
        system = system_prompt or (
            "Eres un tutor de matemáticas paciente. Explica paso a paso, "
            "concluye con una pista accionable."
        )

        # Very simple “chat” template that works for most IT models.
        if self.model_key == "qwen":
            # Qwen-style generic chat
            return f"<|system|>\n{system}\n<|user|>\n{question}\n<|assistant|>\n"
        else:
            # Gemma/Generic instruction prompt
            return f"{system}\n\nUsuario: {question}\nAsistente:"
