# controllers/profile.py
from PySide6.QtCore import QObject
from views.profile import ProfileView
from models.profile import ProfileModel
from models.lessons import LessonsModel

class ProfileController(QObject):
    """Controlador Perfil: conecta vista ↔ modelo y calcula sugerencias."""
    def __init__(self, profile_model: ProfileModel, lessons_model: LessonsModel):
        super().__init__()
        self.model = profile_model
        self.lessons = lessons_model
        self.view  = ProfileView()

        self._refresh()
        self.view.reset_clicked.connect(self._reset)

    # -------- slots internos
    def _reset(self):
        self.model.reset()
        self._refresh()

    def _refresh(self):
        # 1) KPIs arriba
        self.view.set_data(xp=self.model.xp(),
                           lessons_completed=self.model.lessons_completed())
        # 2) Tablero de chequeo (todas las unidades/lecciones, marcando completadas)
        completed = self.model.completed_pairs()
        self.view.set_progress(self.lessons.units, completed)

        # 3) Sugerencia: primera lección no vista según el orden del archivo
        suggestion = self._next_unseen(completed)
        if suggestion:
            unit_name, lesson_title = suggestion
        else:
            unit_name = lesson_title = None
        self.view.set_suggestion(unit_name, lesson_title)

    def _next_unseen(self, completed_pairs: set[tuple[str, str]]):
        for unit in self.lessons.units:
            uname = unit.get("unit", "")
            for l in unit.get("lessons", []):
                lt = l.get("title", "")
                if (uname, lt) not in completed_pairs:
                    return (uname, lt)
        return None
