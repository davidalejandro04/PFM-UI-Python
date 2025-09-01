# services/lm_service.py
"""
Qt service layer that calls the LocalLLM in a background thread and
emits 'answered' back to controllers. Drop-in replacement for the
previous random-responder service.
"""
from PySide6.QtCore import QObject, QThread, Signal
from typing import Optional, Literal

from tutor_backend import LocalLLM


# pregate opcional (no rompe si no existe guard.py)
try:
    from .guard import pregate
except Exception:
    def pregate(_q: str) -> str:
        return ""  # no-op fallback


class _GenThread(QThread):
    done = Signal(str)
    error = Signal(str)

    def __init__(self, llm, question, system_prompt=None, mode="default"):
        super().__init__()
        self._llm = llm
        self._question = question
        self._system_prompt = system_prompt
        self._mode = mode

    def run(self):
        try:
            answer = self._llm.generate(self._question, self._system_prompt, mode=self._mode)
            self.done.emit(answer)
        except Exception as e:
            self.error.emit(str(e))


class LMService(QObject):
    answered = Signal(str)
    failed   = Signal(str)

    def __init__(self, model: Literal["gemma","qwen"] = "gemma"):
        super().__init__()
        self._llm = LocalLLM(model)
        self._threads = []

    def set_model(self, model: Literal["gemma","qwen"]) -> None:
        self._llm.set_model(model)

    def ask(self, question: str, system_prompt: Optional[str] = None, mode: str = "default"):
        pregate_response = pregate(question)
        if pregate_response:
            self.answered.emit(pregate_response)
            return

        thread = _GenThread(self._llm, question, system_prompt, mode)
        thread.done.connect(self.answered.emit)
        thread.error.connect(self.failed.emit)
        thread.finished.connect(lambda: self._threads.remove(thread))
        self._threads.append(thread)
        thread.start()
