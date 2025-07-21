from PySide6.QtCore import QObject
from services.lm_service import LMService
from views.problems import ProblemsView

class ProblemsController(QObject):
    def __init__(self, profile_model):
        super().__init__()
        self.view   = ProblemsView()
        self.lm     = LMService()
        self.modelP = profile_model

        # Vista → controlador
        self.view.sendClicked.connect(self._handle_question)
        # Servicio LM → controlador
        self.lm.answered.connect(self._bot_reply)

    # ------------ slots internos
    def _handle_question(self, txt):
        self.view.add_user(txt)
        self.lm.ask(txt)
        self.modelP.add_xp(1)            # gamificación mínima

    def _bot_reply(self, resp):
        self.view.add_bot(resp)
