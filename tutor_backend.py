# tutor_backend.py
from pathlib import Path
import re
from typing import Optional, Literal, Dict, Any

from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

# ---- 1) Acelerar FP32 con Tensor Cores (TF32)
if torch.cuda.is_available():
    torch.set_float32_matmul_precision('high')   # habilita TF32 para matmul FP32
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32  = True

# ---- 2) (Opcional) Silenciar/autolimitar aviso de Inductor
try:
    import torch._inductor.config as inductor_config
    inductor_config.max_autotune_gemm = False
except Exception:
    pass


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
        temperature: float = 0.3,
        top_p: float = 0.9,
        repetition_penalty=1.2,
        no_repeat_ngram_size=3,
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

    def generate(self, question: str, system_prompt: Optional[str] = None, mode: str = "default") -> str:
        prompt = self._build_prompt(question, system_prompt)
        tk = self._tokenizer(
            prompt,
            return_tensors="pt",
            add_special_tokens=True,
            padding=False
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

        gen_ids = output_ids[0, input_ids.shape[-1]:]
        raw = self._tokenizer.decode(gen_ids, skip_special_tokens=True).strip()
        return self._postprocess_output(raw, mode=mode)

    # ------------------------------ cleaning / extraction
    def _postprocess_output(self, text, mode="default"):
        """
        Limpia la salida según el modo:
        - explain: extrae TEMATICA/OBJETIVO/EXPLICACION/CONEXION (o ERROR)
        - default: limpia marcadores y devuelve texto usable (o EJEMPLO/RESUMEN si aplica)
        """
        if mode == "explain":
            # ERROR explícito
            m_err = re.search(r"<ERROR>.*?</ERROR>", text, flags=re.S | re.I)
            if m_err:
                return m_err.group(0).strip()

            blocks = {}
            for tag in ["TEMATICA", "OBJETIVO", "EXPLICACION", "CONEXION"]:
                m = re.search(fr"<{tag}>(.*?)</{tag}>", text, flags=re.S | re.I)
                if m:
                    blocks[tag] = m.group(1).strip()

            if blocks:
                out = []
                if "TEMATICA" in blocks:    out.append("Temática: " + blocks["TEMATICA"])
                if "OBJETIVO" in blocks:    out.append("Objetivo: " + blocks["OBJETIVO"])
                if "EXPLICACION" in blocks: out.append("Explicación: " + blocks["EXPLICACION"])
                if "CONEXION" in blocks:    out.append("Conexión: " + blocks["CONEXION"])
                return "\n".join(out)

            # Fallback minimal
            t = re.sub(r"^\s*(<\|assistant\|>|Asistente:)", "", text, flags=re.I)
            return t.strip()

        # ---- default (chat de Problemas)
        def _extract(tag):
            m = re.search(fr"<{tag}>(.*?)</{tag}>", text, flags=re.S|re.I)
            return (m.group(1).strip() if m else "")
        ejemplo = _extract("EJEMPLO")
        resumen = _extract("RESUMEN")
        if ejemplo or resumen:
            parts = []
            if ejemplo: parts += ["Ejemplo:", ejemplo]
            if resumen: parts += ["\nResumen:", resumen]
            return "\n".join(parts).strip()

        # Limpieza de marcadores de rol
        t = re.sub(r"^\s*(<\|assistant\|>|\*\*Asistente:?\*\*|Asistente:)\s*", "", text, flags=re.I)
        t = re.sub(r"^\s*(<\|system\|>|<\|user\|>).*", "", t, flags=re.I)
        return t.strip()

    # ------------------------------ internals
    def _resolve_model_dir(self) -> Path:
        name = _MODEL_ALIASES.get(self.model_key, self.model_key)
        model_dir = self.base_dir / name
        if not model_dir.exists():
            raise FileNotFoundError(f"Local model not found: {model_dir}")
        return model_dir

    def _load_model(self):
        model_dir = self._resolve_model_dir()

        self._tokenizer = AutoTokenizer.from_pretrained(
            model_dir,
            local_files_only=True,
            use_fast=False,
            trust_remote_code=True,
        )

        # Si device_map falla por ausencia de accelerate, caer a None
        try:
            self._model = AutoModelForCausalLM.from_pretrained(
                model_dir,
                local_files_only=True,
                torch_dtype=self._dtype,
                device_map=self._device_map,
                trust_remote_code=True,
            )
        except Exception:
            self._model = AutoModelForCausalLM.from_pretrained(
                model_dir,
                local_files_only=True,
                torch_dtype=self._dtype,
                trust_remote_code=True,
            ).to(self._device)

        if self._tokenizer.eos_token_id is None and self._tokenizer.pad_token_id is not None:
            self._tokenizer.eos_token_id = self._tokenizer.pad_token_id

    def _pick_device(self):
        device_map = "auto"
        dtype = torch.float16

        if torch.backends.mps.is_available():
            device = torch.device("mps")
            device_map = {"": device}
            dtype = torch.float16
        elif torch.cuda.is_available():
            device = torch.device("cuda")
            dtype = torch.float16
        else:
            device = torch.device("cpu")
            device_map = {"": device}
            dtype = torch.float32

        return device, dtype, device_map

    def _build_prompt(self, question: str, system_prompt: Optional[str]) -> str:
        POLICY_ES = (
            "Eres un tutor de matemáticas en español. Políticas OBLIGATORIAS:\n"
            "1) Solo respondes temas de matemáticas escolares/universitarias. "
            "   Si la consulta no es de matemáticas, responde exactamente: "
            "   'Este tutor solo responde preguntas de matemáticas. Reformula tu consulta dentro de ese ámbito.'\n"
            "2) Siempre respondes en español, con pasos claros. Si el usuario escribe en otro idioma, responde exactamente: "
            "   'Por favor, formula tu pregunta en español para poder ayudarte.'\n"
            "3) Si la consulta es grosera, inapropiada u ofensiva, responde exactamente: "
            "   'No puedo ayudar con ese tipo de contenido.'\n"
            "4) Cuando incluyas fórmulas, usa notación LaTeX entre $...$ o $$...$$. "
            "   Sé breve, correcto y pedagógico."
        )
        system = system_prompt or POLICY_ES

        if self.model_key == "qwen":
            return (
                f"<|system|>\n{system}\n"
                f"<|user|>\n{question}\n"
                f"<|assistant|>\n"
            )
        else:
            return (
                f"{system}\n\n"
                f"Usuario: {question}\n"
                f"Asistente:"
            )
