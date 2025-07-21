# controllers/lessons.py
from PySide6.QtCore import QObject
from views.lessons import LessonsView
from models.lessons import LessonsModel
from models.profile import ProfileModel
from services.lm_service import LMService
from PySide6.QtWidgets import QMessageBox


class LessonsController(QObject):
    """Controlador Lecciones: catálogo + invocación opcional al LM."""
    def __init__(self, lessons_model: LessonsModel, profile_model: ProfileModel):
        super().__init__()
        self.lessons_m = lessons_model
        self.profile_m = profile_model

        self.view = LessonsView()
        self.view.populate(self.lessons_m.by_unit())
        self.view.lessonDoubleClicked.connect(self._open_lesson)

        # Serv. LM (opcional “Explícame esto”)
        self.lm = LMService()
        self.lm.answered.connect(self._show_explanation)

    # -------- slots internos
    def _open_lesson(self, lesson: dict):
        # Sumar XP por visitar lección
        self.profile_m.add_xp(1)

        txt = (f"<b>{lesson['title']}</b><br>{lesson['description']}<br><br>"
               "¿Deseas una explicación con IA?")
        reply = QMessageBox.question(self.view, "Open lesson", txt,
                                     QMessageBox.Yes | QMessageBox.No)

        if reply == QMessageBox.Yes:
            self.lm.ask(f"Explícame {lesson['title']} con más detalle")

    def _show_explanation(self, answer: str):
        QMessageBox.information(self.view, "Explanation", answer)
