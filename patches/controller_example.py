
# Minimal example controller that wires LessonsView to a lessons.json file.
# You can adapt the snippet into your main.py.

import json, sys, os
from pathlib import Path
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout
from views.lessons import LessonsView  # use the patched lessons.py above

class LessonsController(QWidget):
    def __init__(self, lessons_json="data/lessons.json"):
        super().__init__()
        self.view = LessonsView()
        lay = QVBoxLayout(self); lay.addWidget(self.view)

        # Load content
        p = Path(lessons_json)
        if not p.exists():
            # fallback to script folder
            p = Path(__file__).parent / "data" / "lessons.json"
        data = json.loads(p.read_text(encoding="utf-8"))

        # Our JSON is a list of units
        self.units = {u["unit"]: u for u in data}
        self.view.populate_units(list(self.units.keys()))

        # State
        self.current_unit_name = None
        self.current_lesson = None
        self.stages = []
        self.stage_idx = 0

        # Signals
        self.view.unitSelected.connect(self.on_unit_selected)
        self.view.lessonSelected.connect(self.on_lesson_selected)
        self.view.reader.nextStage.connect(self.on_next_stage)
        self.view.reader.prevStage.connect(self.on_prev_stage)

    def on_unit_selected(self, unit_name):
        self.current_unit_name = unit_name
        lessons = self.units[unit_name]["lessons"]
        self.view.populate_lessons(unit_name, lessons)

    def on_lesson_selected(self, lesson_dict):
        self.current_lesson = lesson_dict
        self.stages = lesson_dict.get("stages", [])
        self.stage_idx = 0
        self._show_current_stage()

    def on_next_stage(self):
        if self.stage_idx + 1 < len(self.stages):
            self.stage_idx += 1
            self._show_current_stage()

    def on_prev_stage(self):
        if self.stage_idx > 0:
            self.stage_idx -= 1
            self._show_current_stage()

    def _show_current_stage(self):
        at_first = (self.stage_idx == 0)
        at_last  = (self.stage_idx == len(self.stages)-1)
        html = self.stages[self.stage_idx].get("html", "<h1>Vacío</h1>")
        self.view.show_stage(html, at_first, at_last)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = LessonsController()
    w.resize(960, 640)
    w.setWindowTitle("Lecciones — Demo")
    w.show()
    sys.exit(app.exec())
