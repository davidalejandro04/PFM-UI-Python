# controllers/lessons.py  (reemplaza)
from PySide6.QtCore import QObject
from views.lessons import LessonsView
from models.lessons import LessonsModel
from models.profile import ProfileModel
from services.lm_service import LMService

class LessonsController(QObject):
    def __init__(self, lessons_model: LessonsModel, profile_model: ProfileModel):
        super().__init__()
        self.m_lessons = lessons_model
        self.m_profile = profile_model
        self.view = LessonsView()
        self.view.populate_units(self.m_lessons.all_units())

        # rutas
        self.view.unitSelected.connect(self._open_unit)
        self.view.lessonSelected.connect(self._open_lesson)
        self.view.backToUnits.connect(self.view.go_home)

        # lector
        self.view.reader.prevStage.connect(self._prev_stage)
        self.view.reader.nextStage.connect(self._next_stage)
        self.view.reader.backClicked.connect(lambda: self.view.stack.setCurrentIndex(1))

        # estado navegación
        self._current_unit   = None
        self._current_less   = None
        self._stages         = []
        self._stage_index    = 0

        self.lm     = LMService(model="gemma")    # preparado para futuro “explícame” (RF‑03)

    # -------- controladores de navegación
    def _open_unit(self, unit):
        self._current_unit = unit
        lessons = self.m_lessons.lessons_of(unit)
        self.view.populate_lessons(unit, lessons)

    def _open_lesson(self, lesson_dict):
        if not isinstance(lesson_dict, dict):
            return   # ignora señales mal formadas

        self._current_less = lesson_dict["title"]
        self._stages       = lesson_dict.get("stages", [])
        self._stage_index  = 0
        if self._stages:
            self._render_stage()
            self.m_profile.add_xp(2)      # recompensa por abrir la lección
        else:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.information(
                self.view, "Sin contenido",
                "Esta lección todavía no tiene páginas definidas."
            )

    def _render_stage(self):
        html = self._stages[self._stage_index]["html"]
        self.view.show_stage(
            html,
            at_first=self._stage_index == 0,
            at_last =self._stage_index == len(self._stages)-1
        )

    def _prev_stage(self):
        if self._stage_index > 0:
            self._stage_index -= 1
            self._render_stage()

    def _next_stage(self):
        if self._stage_index < len(self._stages)-1:
            self._stage_index += 1
            self._render_stage()
