# views/lessons.py  (reemplaza)
from PySide6.QtWidgets import (
    QWidget, QStackedWidget, QListWidget, QListWidgetItem,
    QTextBrowser, QVBoxLayout, QHBoxLayout, QPushButton
)
from PySide6.QtCore import Qt, Signal, QSize

# ---------- widgets auxiliares ---------------------------------
def _make_list(icon_size=QSize(240,90)):
    lw = QListWidget()
    lw.setViewMode(QListWidget.IconMode)
    lw.setIconSize(icon_size)
    lw.setResizeMode(QListWidget.Adjust)
    lw.setSpacing(12)
    lw.setWordWrap(True)
    return lw

class LessonReader(QWidget):
    backClicked = Signal()
    nextStage   = Signal()
    prevStage   = Signal()

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)
        self.browser = QTextBrowser()
        self.browser.setOpenExternalLinks(True)
        nav = QHBoxLayout()
        self.prev_btn = QPushButton("←"); self.next_btn = QPushButton("→")
        self.prev_btn.clicked.connect(self.prevStage.emit)
        self.next_btn.clicked.connect(self.nextStage.emit)
        self.back_btn = QPushButton("Atrás")
        self.back_btn.clicked.connect(self.backClicked.emit)
        nav.addWidget(self.back_btn); nav.addStretch(1)
        nav.addWidget(self.prev_btn); nav.addWidget(self.next_btn)
        lay.addLayout(nav); lay.addWidget(self.browser, 1)

    def set_html(self, html): self.browser.setHtml(html)

# ---------- vista principal (tres capas) -----------------------
class LessonsView(QWidget):
    unitSelected    = Signal(str)
    lessonSelected  = Signal(str)
    backToUnits     = Signal()
    requestExplain  = Signal(str)   # “Explícame …” (futuro)

    def __init__(self):
        super().__init__()
        self.stack = QStackedWidget(self)   # 0=units 1=lessons 2=reader
        lay = QVBoxLayout(self); lay.addWidget(self.stack)

        # capa 0: unidades
        self.unitsList = _make_list(QSize(260,100))
        self.unitsList.itemClicked.connect(lambda it:
            self.unitSelected.emit(it.text()))
        self.stack.addWidget(self.unitsList)

        # capa 1: lecciones
        w1 = QWidget(); l1 = QVBoxLayout(w1)
        self.lessonsList = _make_list(QSize(220,80))
        l1.addWidget(self.lessonsList)
        self.lessonsList.itemClicked.connect(
            lambda it: self.lessonSelected.emit(it.data(Qt.UserRole))
        )
        backU = QPushButton("Volver a unidades")
        backU.clicked.connect(self.backToUnits.emit)
        l1.addWidget(backU)
        self.stack.addWidget(w1)

        # capa 2: lector
        self.reader = LessonReader()
        self.stack.addWidget(self.reader)

    # ---------------- unidades
    def populate_units(self, units):
        self.unitsList.clear()
        for u in units:
            it = QListWidgetItem(u); it.setTextAlignment(Qt.AlignCenter)
            self.unitsList.addItem(it)

    # ---------------- lecciones
    def populate_lessons(self, unit, lessons):
        self.lessonsList.clear()
        for lesson in lessons:
            it = QListWidgetItem(f"{lesson['title']}\n{lesson['description']}")
            it.setData(Qt.UserRole, lesson)             #  ←  guarda el dict
            it.setTextAlignment(Qt.AlignCenter)
            self.lessonsList.addItem(it)
        self.stack.setCurrentIndex(1)
    
    # ---------------- lector
    def show_stage(self, html, at_first, at_last):
        self.reader.set_html(html)
        self.reader.prev_btn.setEnabled(not at_first)
        self.reader.next_btn.setEnabled(not at_last)
        self.stack.setCurrentIndex(2)

    # cambiar a vista unidades
    def go_home(self): self.stack.setCurrentIndex(0)
