
from PySide6.QtWidgets import (
    QWidget, QStackedWidget, QListWidget, QListWidgetItem,
    QVBoxLayout, QHBoxLayout, QPushButton
)
from PySide6.QtCore import Qt, Signal, QSize, QUrl
from PySide6.QtWebEngineWidgets import QWebEngineView

def _make_list(list_mode="list"):
    lw = QListWidget()
    if list_mode == "icons":
        lw.setViewMode(QListWidget.IconMode)
        lw.setIconSize(QSize(240, 90))
        lw.setResizeMode(QListWidget.Adjust)
    else:
        lw.setViewMode(QListWidget.ListMode)
    lw.setWordWrap(True)
    lw.setSpacing(10)
    lw.setStyleSheet("""
        QListWidget::item {
            margin: 6px;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid #2a2a2a;
            background: #151515;
        }
        QListWidget::item:selected {
            background: #3b82f6;
            color: white;
            border: 1px solid #2563eb;
        }
    """)
    return lw

class LessonReader(QWidget):
    backToLessons = Signal()
    backToUnits   = Signal()
    nextStage     = Signal()
    prevStage     = Signal()

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)
        self.web = QWebEngineView()
        nav = QHBoxLayout()
        # Navigation buttons
        self.home_btn = QPushButton("Inicio")
        self.back_btn = QPushButton("Lecciones")
        self.prev_btn = QPushButton("← Anterior")
        self.next_btn = QPushButton("Siguiente →")

        self.home_btn.clicked.connect(self.backToUnits.emit)
        self.back_btn.clicked.connect(self.backToLessons.emit)
        self.prev_btn.clicked.connect(self.prevStage.emit)
        self.next_btn.clicked.connect(self.nextStage.emit)

        nav.addWidget(self.home_btn)
        nav.addWidget(self.back_btn)
        nav.addStretch(1)
        nav.addWidget(self.prev_btn)
        nav.addWidget(self.next_btn)

        lay.addLayout(nav)
        lay.addWidget(self.web, 1)

    def set_html(self, html):
        self.web.setHtml(html, QUrl("about:blank"))

class LessonsView(QWidget):
    unitSelected    = Signal(str)
    lessonSelected  = Signal(dict)
    backToUnits     = Signal()

    def __init__(self):
        super().__init__()
        self.stack = QStackedWidget(self)
        lay = QVBoxLayout(self)
        lay.addWidget(self.stack)

        # Page 0: Units
        self.unitsList = _make_list("list")
        self.unitsList.itemClicked.connect(lambda it: self.unitSelected.emit(it.text()))
        self.stack.addWidget(self.unitsList)

        # Page 1: Lessons
        w1 = QWidget(); l1 = QVBoxLayout(w1)
        self.lessonsList = _make_list("list")
        l1.addWidget(self.lessonsList, 1)
        backU = QPushButton("Volver a unidades")
        backU.clicked.connect(self._go_units)
        l1.addWidget(backU, 0, alignment=Qt.AlignRight)
        self.lessonsList.itemClicked.connect(
            lambda it: self.lessonSelected.emit(it.data(Qt.UserRole))
        )
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
            it = QListWidgetItem(name)
            it.setTextAlignment(Qt.AlignLeft | Qt.AlignVCenter)
            self.unitsList.addItem(it)
        self.stack.setCurrentIndex(0)

    def populate_lessons(self, unit_name, lessons):
        self.lessonsList.clear()
        for lesson in lessons:
            title = lesson.get("title","(sin título)")
            desc  = lesson.get("description","")
            text  = f"{title}\n{desc}"
            it = QListWidgetItem(text)
            it.setData(Qt.UserRole, lesson)
            it.setTextAlignment(Qt.AlignLeft | Qt.AlignVCenter)
            self.lessonsList.addItem(it)
        self.stack.setCurrentIndex(1)

    def show_stage(self, html, at_first, at_last):
        self.reader.set_html(html)
        self.reader.prev_btn.setEnabled(not at_first)
        self.reader.next_btn.setEnabled(not at_last)
        self.stack.setCurrentIndex(2)

    def _go_units(self): self.stack.setCurrentIndex(0)
    def _go_lessons(self): self.stack.setCurrentIndex(1)
