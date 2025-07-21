# services/lm_service.py
import random
from PySide6.QtCore import QObject, Signal

class LMService(QObject):
    answered = Signal(str)                  # → controlador

    def ask(self, question: str):
        resp = self._rand_resp(question)
        self.answered.emit(resp)            # notifica al controlador

    # ------------------------------------------------ private
    def _rand_resp(self, q: str) -> str:
        templates = [
            "¡Interesante pregunta! Para resolverla, recuerda que {}.",
            "Pensemos juntos 🤔. Un buen primer paso es {}.",
            "Prueba descomponer el problema: {}.",
            "Una pista: {}."
        ]
        hint = random.choice([
            "sumar los términos semejantes",
            "dibujar un diagrama",
            "aplicar la propiedad distributiva",
            "buscar un patrón en los números"
        ])
        return random.choice(templates).format(hint)
