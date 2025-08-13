# views/profile.py
from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QPushButton, QScrollArea,
    QWidget, QGridLayout, QFrame, QHBoxLayout
)
from PySide6.QtCore import Signal, Qt
from PySide6.QtSvgWidgets import QSvgWidget  # <- NUEVO

ASSETS = Path(__file__).parent.parent / "assets"
SVG_DIR = ASSETS / "svg"

def _svg_path(name: str) -> str:
    p = SVG_DIR / f"{name}.svg"
    if p.exists(): return str(p)
    fb = Path("/mnt/data") / f"{name}.svg"
    return str(fb) if fb.exists() else ""


class ProfileView(QWidget):
    """Vista Perfil – progreso, tablero de lecciones y sugerencia."""
    openLessonRequested = Signal(str, str)  # (unit_name, lesson_title)

    def __init__(self):
        super().__init__()

        # Header con icono reward
        header_row = QHBoxLayout()
        self._header = QLabel(); self._header.setTextFormat(Qt.RichText)
        header_row.addWidget(self._header, 1)

        reward_icon = QSvgWidget(_svg_path("reward"))
        reward_icon.setFixedSize(80, 80)  # más grande
        header_row.addWidget(reward_icon, 0, Qt.AlignRight)

        self._suggest_btn = QPushButton("Continuar con la siguiente lección →")
        self._suggest_btn.setEnabled(False)
        self._suggest_target = None
        self._suggest_btn.clicked.connect(self._emit_open_suggested)

        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._grid_host = QWidget()
        self._grid = QGridLayout(self._grid_host)
        self._grid.setContentsMargins(0, 0, 0, 0)
        self._grid.setHorizontalSpacing(12)
        self._grid.setVerticalSpacing(8)
        self._scroll.setWidget(self._grid_host)

        self._reset_btn = QPushButton("Reiniciar progreso")

        lay = QVBoxLayout(self)
        lay.addLayout(header_row)
        lay.addWidget(self._suggest_btn, 0, alignment=Qt.AlignLeft)
        lay.addWidget(self._scroll, 1)
        lay.addWidget(self._reset_btn, 0, alignment=Qt.AlignRight)
    # ------- API usada por el controlador
    def set_data(self, xp: int, lessons_completed: int):
        self._header.setText(
            f"<h3>Perfil</h3>"
            f"Puntos de experiencia: <b>{xp}</b><br>"
            f"Lecciones terminadas: <b>{lessons_completed}</b>"
        )

    def set_progress(self, units: list[dict], completed_pairs: set[tuple[str, str]]):
        """Dibuja un tablero (checkboard) con todas las lecciones, marcando las completadas."""
        # limpiar grilla
        while self._grid.count():
            item = self._grid.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

        row = 0
        for unit in units:
            unit_name = unit.get("unit", "(unidad)")
            title_lbl = QLabel(f"<b>{unit_name}</b>")
            self._grid.addWidget(title_lbl, row, 0, 1, 4)
            row += 1

            col = 0
            for lesson in unit.get("lessons", []):
                lt = lesson.get("title", "(sin título)")
                checked = (unit_name, lt) in completed_pairs

                pill = QFrame()
                pill.setObjectName("pill")
                pill.setProperty("checked", checked)
                pill.setToolTip(lt)
                pill.setStyleSheet("""
                    QFrame#pill {
                        border-radius: 6px; padding: 6px 10px;
                        border: 1px solid #2a2a2a; background: #151515; color: #eee;
                    }
                    QFrame#pill[checked="true"] {
                        background: #3b82f6; border-color: #2563eb; color: white;
                    }
                """)
                text = QLabel(("✓ " if checked else "• ") + lt)
                text.setWordWrap(True)

                inner = QVBoxLayout(pill)
                inner.setContentsMargins(8, 6, 8, 6)
                inner.addWidget(text)

                self._grid.addWidget(pill, row, col)
                col += 1
                if col >= 4:
                    col = 0
                    row += 1
            row += 1  # espacio entre unidades

    def set_suggestion(self, unit_name: str | None, lesson_title: str | None):
        if unit_name and lesson_title:
            self._suggest_target = (unit_name, lesson_title)
            self._suggest_btn.setText(f"Continuar: {lesson_title}  ({unit_name})")
            self._suggest_btn.setEnabled(True)
        else:
            self._suggest_target = None
            self._suggest_btn.setText("No hay lecciones pendientes 🎉")
            self._suggest_btn.setEnabled(False)

    @property
    def reset_clicked(self):
        return self._reset_btn.clicked

    # ------- helpers
    def _emit_open_suggested(self):
        if self._suggest_target:
            unit, title = self._suggest_target
            self.openLessonRequested.emit(unit, title)
