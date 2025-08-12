# views/problems.py
from pathlib import Path
import json
from PySide6.QtWidgets import QWidget, QVBoxLayout, QTextEdit, QPushButton, QHBoxLayout
from PySide6.QtCore import Signal, QUrl
from PySide6.QtWebEngineWidgets import QWebEngineView  # pip install PySide6 (includes WebEngine)

ASSETS = Path(__file__).parent.parent / "assets"

class ProblemsView(QWidget):
    sendClicked = Signal(str)   # → controller

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)

        # Web chat (KaTeX-enabled)
        self.web = QWebEngineView()
        html = (ASSETS / "chat.html").as_posix()
        self.web.setUrl(QUrl.fromLocalFile(str(ASSETS / "chat.html")))
        lay.addWidget(self.web, 1)

        # Input row
        self.input = QTextEdit(); self.input.setFixedHeight(56)
        send = QPushButton("Send"); send.setDefault(True)
        send.clicked.connect(self._emit_send)

        row = QHBoxLayout(); row.addWidget(self.input, 1); row.addWidget(send)
        lay.addLayout(row)

    # ------------ public API (controller → view)
    def add_user(self, txt: str): self._add("user", txt)
    def add_bot (self, txt: str): self._add("bot",  txt)

    # ------------ internal helpers
    def _emit_send(self):
        text = self.input.toPlainText().strip()
        if text:
            self.sendClicked.emit(text)
            self.input.clear()

    def _add(self, role: str, text: str):
        # pass safe JSON string to JS (avoids quoting issues)
        js = f"window.addMessage({json.dumps(role)}, {json.dumps(text)});"
        self.web.page().runJavaScript(js)
