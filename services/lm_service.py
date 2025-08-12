# services/lm_service.py
"""
Qt service layer that calls the LocalLLM in a background thread and
emits 'answered' back to controllers. Drop-in replacement for the
previous random-responder service.
"""
from PySide6.QtCore import QObject, QThread, Signal
from typing import Optional, Literal

from tutor_backend import LocalLLM
from .guard import pregate   # ← NEW


class _GenThread(QThread):
    done  = Signal(str)
    error = Signal(str)

    def __init__(self, backend: LocalLLM, question: str, system_prompt: Optional[str] = None):
        super().__init__()
        self.backend = backend
        self.question = question
        self.system_prompt = system_prompt

    def run(self):
        try:
            text = self.backend.generate(self.question, self.system_prompt)
            self.done.emit(text)
        except Exception as e:
            self.error.emit(str(e))


class LMService(QObject):
    answered = Signal(str)
    failed   = Signal(str)

    def __init__(self, model: Literal["gemma","qwen"] = "gemma"):
        super().__init__()
        self._backend = LocalLLM(model=model)
        self._threads = []

    def set_model(self, model: Literal["gemma","qwen"]) -> None:
        self._backend.set_model(model)

    def ask(self, question: str, system_prompt: Optional[str] = None):
        # NEW: pre‑gate (fast path)
        blocked = pregate(question)
        if blocked:
            self.answered.emit(blocked)  # Spanish canned message
            return

        # Normal async generation
        worker = _GenThread(self._backend, question, system_prompt)
        worker.done.connect(self.answered.emit)
        worker.error.connect(self.failed.emit)
        worker.finished.connect(lambda: self._threads.remove(worker) if worker in self._threads else None)
        self._threads.append(worker)
        worker.start()
