# views/lessons.py
from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QStackedWidget, QListWidget, QListWidgetItem,
    QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QGridLayout, QFrame
)
from PySide6.QtCore import Qt, Signal, QSize, QUrl
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtSvgWidgets import QSvgWidget  # <- NUEVO

ASSETS = Path(__file__).parent.parent / "assets"
SVG_DIR = ASSETS / "svg"

def _svg_path(name: str) -> str:
    """Busca primero en assets/svg y si no, intenta fallback en /mnt/data."""
    p = SVG_DIR / f"{name}.svg"
    if p.exists():
        return str(p)
    # fallback para tu entorno de trabajo indicado en la conversación
    fallback = Path("/mnt/data") / f"{name}.svg"
    return str(fallback) if fallback.exists() else ""

def _pick_svg_for(text: str) -> str:
    """Heurística simple por palabras clave."""
    t = (text or "").lower()
    if "relac" in t or "divis" in t: return _svg_path("multiplication")
    if "fracción" in t or "fraccion" in t: return _svg_path("fraction")
    if "geom" in t or "triáng" in t or "angulo" in t or "ángulo" in t: return _svg_path("geometry")
    if "patr" in t or "númer" in t or "numero" in t: return _svg_path("numberline")
    if "medici" in t or"ábaco" in t or "abaco" in t: return _svg_path("abacus")
    if "cálcul" in t or "suma" in t or "resta" in t or "multiplic" in t or "divis" in t or "porc" in t:
        return _svg_path("calculator")
    return _svg_path("chalkboard")

def _card_widget(title: str, svg_file: str, svg_w=180, svg_h=120) -> QWidget:
    """Tarjeta con texto arriba y SVG abajo."""
    card = QFrame()
    card.setObjectName("card")
    card.setStyleSheet("""
        QFrame#card {
            border-radius: 12px;
            border: 1px solid #2a2a2a;
            background: #151515;
        }
        QFrame#card:hover {
            border: 1px solid #2563eb;
        }
        QLabel#title {
            font-weight: 600;
            color: #eee;
        }
    """)
    lay = QVBoxLayout(card)
    lay.setContentsMargins(12, 12, 12, 12)
    lay.setSpacing(8)

    lbl = QLabel(title); lbl.setObjectName("title")
    lbl.setAlignment(Qt.AlignHCenter | Qt.AlignTop)
    lbl.setWordWrap(True)
    lay.addWidget(lbl)

    svg = QSvgWidget(svg_file) if svg_file else QSvgWidget()
    svg.setFixedSize(svg_w, svg_h)
    lay.addWidget(svg, 0, Qt.AlignHCenter)

    return card


def _make_list(list_mode="list"):
    lw = QListWidget()
    if list_mode == "icons":
        lw.setViewMode(QListWidget.IconMode)
        lw.setResizeMode(QListWidget.Adjust)
        lw.setMovement(QListWidget.Static)
        lw.setSpacing(12)
        lw.setUniformItemSizes(False)
        lw.setWrapping(True)  # ← permite grilla
    else:
        lw.setViewMode(QListWidget.ListMode)
        lw.setSpacing(10)
    lw.setWordWrap(True)
    lw.setStyleSheet("""
        QListWidget::item {
            margin: 6px;
            padding: 8px;
            border: none;
            background: transparent;
        }
        QListWidget::item:selected { background: transparent; }
    """)
    return lw


class LessonReader(QWidget):
    backToLessons = Signal()
    backToUnits   = Signal()
    nextStage     = Signal()
    prevStage     = Signal()
    explainSelected = Signal(str)
    finishLesson = Signal()  # <- asegura que existe

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)
        self.web = QWebEngineView()
        nav = QHBoxLayout()

        self.home_btn = QPushButton("Inicio")
        self.back_btn = QPushButton("Lecciones")
        self.prev_btn = QPushButton("← Anterior")
        self.next_btn = QPushButton("Siguiente →")
        self.finish_btn = QPushButton("Finalizar lección")
        self.finish_btn.hide()

        self.home_btn.clicked.connect(self.backToUnits.emit)
        self.back_btn.clicked.connect(self.backToLessons.emit)
        self.prev_btn.clicked.connect(self.prevStage.emit)
        self.next_btn.clicked.connect(self.nextStage.emit)
        self.finish_btn.clicked.connect(self.finishLesson.emit)

        # (opcional) botón "Explícame esto" que ya tenías/querías
        self.explain_btn = QPushButton("Explicame esto")
        self.explain_btn.setEnabled(False)
        self.explain_btn.clicked.connect(self._emit_explain)


        nav.addWidget(self.home_btn)
        nav.addWidget(self.back_btn)
        nav.addWidget(self.explain_btn)
        nav.addStretch(1)
        nav.addWidget(self.prev_btn)
        nav.addWidget(self.next_btn)
        nav.addWidget(self.finish_btn)

        lay.addLayout(nav)
        lay.addWidget(self.web, 1)

        self._last_selection = ""
        self.web.page().selectionChanged.connect(self._on_selection_changed)

    def set_html(self, html):
        self.web.setHtml(html, QUrl("about:blank"))
        self._last_selection = ""
        self.explain_btn.setEnabled(False)

    def _on_selection_changed(self):
        txt = self.web.selectedText().strip()
        self._last_selection = txt
        self.explain_btn.setEnabled(bool(txt))

    def _emit_explain(self):
        if self._last_selection:
            self.explainSelected.emit(self._last_selection)


class LessonsView(QWidget):
    unitSelected    = Signal(str)
    lessonSelected  = Signal(dict)
    backToUnits     = Signal()

    def __init__(self):
        super().__init__()
        self.stack = QStackedWidget(self)
        lay = QVBoxLayout(self)
        lay.addWidget(self.stack)

        # Page 0: Units (grid 3×n)
        w0 = QWidget(); l0 = QVBoxLayout(w0); l0.setContentsMargins(0,0,0,0)
        self.unitsList = _make_list("icons")
        self.unitsList.itemClicked.connect(lambda it: self.unitSelected.emit(it.data(Qt.UserRole)))
        l0.addWidget(self.unitsList, 1)
        self.stack.addWidget(w0)

        # Page 1: Lessons (grid 3×n)
        w1 = QWidget(); l1 = QVBoxLayout(w1); l1.setContentsMargins(0,0,0,0)
        self.lessonsList = _make_list("icons")
        backU = QPushButton("Volver a unidades")
        backU.clicked.connect(self._go_units)
        self.lessonsList.itemClicked.connect(lambda it: self.lessonSelected.emit(it.data(Qt.UserRole)))
        l1.addWidget(self.lessonsList, 1)
        l1.addWidget(backU, 0, alignment=Qt.AlignRight)
        self.stack.addWidget(w1)

        # Page 2: Reader
        self.reader = LessonReader()
        self.reader.backToLessons.connect(self._go_lessons)
        self.reader.backToUnits.connect(self._go_units)
        self.stack.addWidget(self.reader)

    # ---- Public API ----
    def populate_units(self, unit_names):
        self.unitsList.clear()
        for name in unit_names:
            it = QListWidgetItem()
            it.setData(Qt.UserRole, name)
            # tamaño de tarjeta para forzar 3 columnas (ajusta si cambias ventana)
            it.setSizeHint(QSize(240, 220))
            self.unitsList.addItem(it)
            card = _card_widget(name, _pick_svg_for(name))
            self.unitsList.setItemWidget(it, card)
        self._set_three_columns(self.unitsList)
        self.stack.setCurrentIndex(0)

    def populate_lessons(self, unit_name, lessons):
        self.lessonsList.clear()
        for lesson in lessons:
            title = lesson.get("title","(sin título)")
            it = QListWidgetItem()
            it.setData(Qt.UserRole, lesson)
            it.setSizeHint(QSize(240, 220))
            self.lessonsList.addItem(it)
            card = _card_widget(title, _pick_svg_for(title))
            self.lessonsList.setItemWidget(it, card)
        self._set_three_columns(self.lessonsList)
        self.stack.setCurrentIndex(1)

    def show_stage(self, html, at_first, at_last):
        self.reader.set_html(html)
        self.reader.prev_btn.setEnabled(not at_first)
        if at_last:
            self.reader.next_btn.hide()
            self.reader.finish_btn.show()
        else:
            self.reader.finish_btn.hide()
            self.reader.next_btn.show()
        self.stack.setCurrentIndex(2)

    # ---- Navigation helpers
    def _go_units(self): self.stack.setCurrentIndex(0)
    def _go_lessons(self): self.stack.setCurrentIndex(1)

    # ---- Layout helper: fija 3 columnas
    def _set_three_columns(self, lw: QListWidget):
        vw = lw.viewport().width() or 720
        col = 3
        spacing = lw.spacing() or 12
        card_w = max(220, int((vw - spacing*(col+1)) / col))
        card_h = card_w  # ← AHORA ES CUADRADO
        lw.setGridSize(QSize(card_w + spacing, card_h + spacing))
