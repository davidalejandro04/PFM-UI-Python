# controllers/problems.py
from PySide6.QtCore import QObject
from services.lm_service import LMService
from views.problems import ProblemsView

class ProblemsController(QObject):
    def __init__(self, profile_model):
        super().__init__()
        self.view   = ProblemsView()
        self.lm     = LMService(model="qwen")
        self.modelP = profile_model

        # Vista → controlador
        self.view.sendClicked.connect(self._handle_question)
        # Servicio LM → controlador
        self.lm.answered.connect(self._bot_reply)
        self.lm.failed.connect(self._bot_error)   # <- ahora manejamos errores

    # ------------ slots internos
    def _handle_question(self, txt: str):
        self.view.add_user(txt)
        self.view.set_busy(True)                  # bloquear mientras responde
        self.lm.ask(txt, system_prompt=None, mode="default")
        self.modelP.add_xp(1)

    def _bot_reply(self, resp: str):
        self.view.set_busy(False)
        self.view.add_bot(resp if resp else "(sin respuesta)")

    def _bot_error(self, err: str):
        self.view.set_busy(False)
        self.view.add_bot(f"[Error] {err or 'Fallo desconocido'}")
