import json, os, sys
from pathlib import Path
from datetime import datetime
from PySide6.QtCore    import Qt, QSize
from PySide6.QtGui     import QIcon
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QTabWidget, QWidget,
    QVBoxLayout, QLabel, QListWidget, QListWidgetItem,
    QHBoxLayout, QTextEdit, QPushButton, QFileDialog
)

import tutor_backend as backend

BASE_DIR = Path(__file__).parent
PROFILE_FILE = BASE_DIR / "profile.json"
LESSONS_FILE = BASE_DIR / "lessons.json"

# --------------------------------------------------------------------- UI helpers
def load_profile():
    if PROFILE_FILE.exists():
        return json.loads(PROFILE_FILE.read_text(encoding="utf8"))
    return {"xp": 0, "lessonsCompleted": 0}

def save_profile(data):
    PROFILE_FILE.write_text(json.dumps(data, indent=2), encoding="utf8")

def load_lessons():
    if LESSONS_FILE.exists():
        return json.loads(LESSONS_FILE.read_text(encoding="utf8"))
    return []

# --------------------------------------------------------------------- Main Window
class TutorWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Tutor de matemáticas")
        if (BASE_DIR/"assets/tutor.ico").exists():
            self.setWindowIcon(QIcon(str(BASE_DIR/"assets/tutor.ico")))
        self.resize(820, 520)

        self.profile = load_profile()
        self.lessons = load_lessons()

        tabs = QTabWidget()
        tabs.addTab(self._build_lessons_tab(),   "Lecciones")
        tabs.addTab(self._build_problems_tab(),  "Problemas")
        tabs.addTab(self._build_profile_tab(),   "Perfil")
        self.setCentralWidget(tabs)

    # ------------------------------ Lessons
    def _build_lessons_tab(self):
        w = QWidget();  lay = QVBoxLayout(w)
        listw = QListWidget()
        for lesson in self.lessons:
            item = QListWidgetItem(f"{lesson['title']} – {lesson['description']}")
            item.setData(Qt.UserRole, lesson)
            listw.addItem(item)
        listw.itemDoubleClicked.connect(self._open_lesson)
        lay.addWidget(QLabel("<h2>Lesson catalogue</h2>"))
        lay.addWidget(listw)
        return w

    def _open_lesson(self, item):
        lesson = item.data(Qt.UserRole)
        QFileDialog.information(self, "Abrir lección",
            f"Aquí abrirías la lección:\n\n{json.dumps(lesson, indent=2, ensure_ascii=False)}")

    # ------------------------------ Problems / Chat
    def _build_problems_tab(self):
        w = QWidget();  lay = QVBoxLayout(w)
        lay.addWidget(QLabel("<h2>Práctica de problemas</h2>"))

        # chat history
        self.chat_box = QListWidget()
        lay.addWidget(self.chat_box, 1)

        # input row
        row = QHBoxLayout()
        self.input = QTextEdit();  self.input.setFixedHeight(50)
        send_btn   = QPushButton("Send")
        send_btn.setDefault(True)
        send_btn.clicked.connect(self._on_send)
        row.addWidget(self.input, 1)
        row.addWidget(send_btn)
        lay.addLayout(row)

        return w

    def _on_send(self):
        msg = self.input.toPlainText().strip()
        if not msg: return
        self._add_chat(msg, "user")
        self.input.clear()

        # backend call (instant; en producción podría ser async)
        resp = backend.rand_resp(msg)
        self._add_chat(resp, "bot")

    def _add_chat(self, text, who):
        item = QListWidgetItem(text)
        item.setTextAlignment(Qt.AlignRight if who == "user" else Qt.AlignLeft)
        self.chat_box.addItem(item)
        self.chat_box.scrollToBottom()

    # ------------------------------ Profile
    def _build_profile_tab(self):
        w = QWidget(); lay = QVBoxLayout(w)
        self.profile_lbl = QLabel()
        self._refresh_profile_label()
        reset = QPushButton("Reiniciar progreso")
        reset.clicked.connect(self._reset_profile)
        lay.addWidget(QLabel("<h2>Your profile</h2>"))
        lay.addWidget(self.profile_lbl)
        lay.addStretch(1)
        lay.addWidget(reset)
        return w

    def _refresh_profile_label(self):
        p = self.profile
        self.profile_lbl.setText(f"XP points: {p['xp']}\nLessons finished: {p['lessonsCompleted']}")

    def _reset_profile(self):
        self.profile = {"xp":0,"lessonsCompleted":0}
        save_profile(self.profile)
        self._refresh_profile_label()

# --------------------------------------------------------------------- Run
if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = TutorWindow()
    win.show()
    sys.exit(app.exec())
