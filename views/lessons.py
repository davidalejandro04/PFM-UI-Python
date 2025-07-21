# views/lessons.py
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QListWidget, QListWidgetItem
)
from PySide6.QtCore import Qt, Signal


class LessonsView(QWidget):
    """Vista Lecciones – catálogo agrupado por unidad."""
    lessonDoubleClicked = Signal(dict)  # → controlador (lección seleccionada)

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)
        lay.addWidget(QLabel("<h2>Lesson catalogue</h2>"))

        self.listw = QListWidget()
        self.listw.itemDoubleClicked.connect(self._emit_lesson)
        lay.addWidget(self.listw, 1)

    # -------- API pública (Controlador -> Vista)
    def populate(self, grouped_lessons):
        """
        `grouped_lessons` es un iterable (unidad, [lecciones])
        """
        self.listw.clear()
        for unit, lessons in grouped_lessons:
            header = QListWidgetItem(f"— {unit} —")
            header.setFlags(Qt.ItemIsEnabled)          # no seleccionable
            self.listw.addItem(header)

            for l in lessons:
                item = QListWidgetItem(f"• {l['title']} – {l['description']}")
                item.setData(Qt.UserRole, l)
                self.listw.addItem(item)

    # -------- interna
    def _emit_lesson(self, item):
        data = item.data(Qt.UserRole)
        if isinstance(data, dict):
            self.lessonDoubleClicked.emit(data)
