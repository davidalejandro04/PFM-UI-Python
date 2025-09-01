# views/problems.py
from pathlib import Path
import json
from PySide6.QtWidgets import QWidget, QVBoxLayout, QTextEdit, QPushButton, QHBoxLayout
from PySide6.QtCore import Signal, QUrl, Qt
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtSvgWidgets import QSvgWidget
from PySide6.QtWidgets import QGraphicsOpacityEffect

ASSETS = Path(__file__).parent.parent / "assets"
SVG_DIR = ASSETS / "svg"

def _svg_path(name: str) -> str:
    p = SVG_DIR / f"{name}.svg"
    if p.exists(): return str(p)
    fb = Path("/mnt/data") / f"{name}.svg"
    return str(fb) if fb.exists() else ""

class ProblemsView(QWidget):
    sendClicked = Signal(str)   # → controller

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)

        # Web chat (KaTeX-enabled)
        self.web = QWebEngineView()
        self.web.setUrl(QUrl.fromLocalFile(str(ASSETS / "chat.html")))
        self.web.setAttribute(Qt.WA_TranslucentBackground, True)
        self.web.loadFinished.connect(self._on_loaded)
        self._loaded = False
        self._queue = []  # mensajes en cola (role, text)

        # Overlay SVG "tutor" con opacidad
        self._overlay = QSvgWidget(_svg_path("tutor"), self)
        self._overlay.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        self._overlay.setFixedSize(420, 280)
        eff = QGraphicsOpacityEffect(self._overlay)
        eff.setOpacity(0.25)
        self._overlay.setGraphicsEffect(eff)
        self._overlay.raise_()

        lay.addWidget(self.web, 1)

        # Input row
        self.input = QTextEdit(); self.input.setFixedHeight(56)
        self.send_btn = QPushButton("Send"); self.send_btn.setDefault(True)
        self.send_btn.clicked.connect(self._emit_send)

        row = QHBoxLayout(); row.addWidget(self.input, 1); row.addWidget(self.send_btn)
        lay.addLayout(row)

    def resizeEvent(self, ev):
        super().resizeEvent(ev)
        if self._overlay:
            cx = (self.width() - self._overlay.width()) // 2
            cy = (self.height() - self._overlay.height()) // 2 - 40
            self._overlay.move(max(0, cx), max(0, cy))

    # ------------ public API (controller → view)
    def add_user(self, txt: str): self._enqueue("user", txt)
    def add_bot (self, txt: str): self._enqueue("bot",  txt)

    def set_busy(self, busy: bool):
        self.send_btn.setDisabled(busy)
        self.input.setDisabled(busy)

    # ------------ internal helpers
    def _emit_send(self):
        text = self.input.toPlainText().strip()
        if text:
            self.sendClicked.emit(text)
            self.input.clear()

    def _enqueue(self, role: str, text: str):
        if not self._loaded:
            self._queue.append((role, text))
            return
        js = f"window.addMessage({json.dumps(role)}, {json.dumps(text)});"
        self.web.page().runJavaScript(js)

    def _on_loaded(self, ok: bool):
        self._loaded = ok
        if not ok:
            # si falla la carga, igual mostramos mensajes en plano
            for role, text in self._queue:
                prefix = ">>" if role == "user" else "<<"
                plain  = f"{prefix} {text}\n"   # << aquí agregamos el salto de línea
                serialized = json.dumps(plain)  # json.dumps se encarga de escaparlo
                js = f"document.body.innerText += {serialized};"
                self.web.page().runJavaScript(js)
            self._queue.clear()
            return