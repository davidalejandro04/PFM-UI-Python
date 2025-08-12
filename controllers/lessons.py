# controllers/lessons.py (or your current lessons.py controller section)

import json, sys
from pathlib import Path
from functools import partial
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QDialog, QVBoxLayout, QTextEdit
from views.lessons import LessonsView
from services.lm_service import LMService

EXPLAIN_SYSTEM_PROMPT = "GENERA LA EXPLICACIÓN EN ESPAÑOL: EXPLICA BREVEMENTE EL TEXTO SIGUIENTE:\n\n"

class _ExplanationWindow(QDialog):
    def __init__(self, parent=None, title="Explicación"):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.resize(720, 480)
        lay = QVBoxLayout(self)
        self.text = QTextEdit(self)
        self.text.setReadOnly(True)
        lay.addWidget(self.text)

    def show_loading(self):
        self.text.setPlainText("Generando explicación…")

    def set_text(self, t: str):
        self.text.setPlainText(t.strip() if t else "(sin contenido)")

class LessonsController(QWidget):
    def __init__(self, lessons_json="data/lessons.json"):
        super().__init__()
        self.view = LessonsView()
        lay = QVBoxLayout(self); lay.addWidget(self.view)

        p = Path(lessons_json)
        if not p.exists():
            p = Path(__file__).parent / "data" / "lessons.json"
        data = json.loads(p.read_text(encoding="utf-8"))

        self.units = {u["unit"]: u for u in data}
        self.view.populate_units(list(self.units.keys()))

        self.current_unit_name = None
        self.current_lesson = None
        self.stages = []
        self.stage_idx = 0

        # Language model service
        self._lm = LMService(model="qwen")

        # Signals
        self.view.unitSelected.connect(self.on_unit_selected)
        self.view.lessonSelected.connect(self.on_lesson_selected)
        self.view.reader.nextStage.connect(self.on_next_stage)
        self.view.reader.prevStage.connect(self.on_prev_stage)

        # Hook “Explicame esto”
        self.view.reader.explainSelected.connect(self.on_explain_selected)

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

    # ---- explain flow ----
    def on_explain_selected(self, selected_text: str):
        win = _ExplanationWindow(self, title="Explicación — selección")
        win.show_loading()
        win.show()

        ok_handler   = partial(self._handle_explain_ok,    win)
        fail_handler = partial(self._handle_explain_error, win)
        self._lm.answered.connect(ok_handler)
        self._lm.failed.connect(fail_handler)
        win._handlers = (ok_handler, fail_handler)

        self._lm.ask(question=selected_text, system_prompt=EXPLAIN_SYSTEM_PROMPT)

    def _cleanup_handlers(self, win: _ExplanationWindow):
        if hasattr(win, "_handlers"):
            ok_handler, fail_handler = win._handlers
            try: self._lm.answered.disconnect(ok_handler)
            except: pass
            try: self._lm.failed.disconnect(fail_handler)
            except: pass
            delattr(win, "_handlers")

    def _handle_explain_ok(self, win: _ExplanationWindow, text: str):
        self._cleanup_handlers(win)
        win.set_text(text)

    def _handle_explain_error(self, win: _ExplanationWindow, err: str):
        self._cleanup_handlers(win)
        win.set_text(f"[Error] {err}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = LessonsController()
    w.resize(960, 640)
    w.setWindowTitle("Lecciones — Demo")
    w.show()
    sys.exit(app.exec())
