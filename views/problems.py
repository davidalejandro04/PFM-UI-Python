from PySide6.QtWidgets import QWidget, QVBoxLayout, QListWidget, QTextEdit, QPushButton, QHBoxLayout
from PySide6.QtCore     import Qt, Signal

class ProblemsView(QWidget):
    sendClicked = Signal(str)   # → controlador

    def __init__(self):
        super().__init__()
        lay = QVBoxLayout(self)

        self.chat  = QListWidget()
        lay.addWidget(self.chat, 1)

        self.input = QTextEdit(); self.input.setFixedHeight(50)
        send = QPushButton("Send"); send.setDefault(True)
        send.clicked.connect(self._emit_send)

        row = QHBoxLayout(); row.addWidget(self.input,1); row.addWidget(send)
        lay.addLayout(row)

    # -------------- interfaz pública (Controlador → Vista)
    def add_user(self, txt): self._add(txt, Qt.AlignRight)
    def add_bot (self, txt): self._add(txt, Qt.AlignLeft)

    # -------------- interna
    def _emit_send(self):
        txt = self.input.toPlainText().strip()
        if txt:
            self.sendClicked.emit(txt)
            self.input.clear()

    def _add(self, txt, align):
        from PySide6.QtWidgets import QListWidgetItem
        it = QListWidgetItem(txt); it.setTextAlignment(align)
        self.chat.addItem(it); self.chat.scrollToBottom()
