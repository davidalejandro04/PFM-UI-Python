# ui/style.py
from PySide6.QtGui  import QPalette, QColor, QFont
from PySide6.QtCore import Qt

_QSS = """
QWidget        { font-family: 'Segoe UI'; font-size: 15px; }
QPushButton,
QTabBar::tab,
QListWidget,
QTextEdit      { padding: 8px 14px; }

QPushButton    {
    background: #4285F4; color: white; border-radius: 6px;
}
QPushButton:hover   { background: #5b9dff; }
QPushButton:pressed { background: #3367d6; }
"""

def apply_style(app):
    """Aplica estilo Fusion + QSS + escalado HiDPI (llamar una vez)."""
    # 1‑ Habilitar auto‑escalado
    app.setAttribute(Qt.AA_EnableHighDpiScaling)
    app.setAttribute(Qt.AA_UseHighDpiPixmaps)

    # 2‑ Estilo Fusion y paleta clara
    app.setStyle("Fusion")
    pal = QPalette()
    pal.setColor(QPalette.Window,         QColor("#f2f2f2"))
    pal.setColor(QPalette.WindowText,     Qt.black)
    pal.setColor(QPalette.Button,         QColor("#4285F4"))
    pal.setColor(QPalette.ButtonText,     Qt.white)
    pal.setColor(QPalette.Highlight,      QColor("#75a7ff"))
    pal.setColor(QPalette.HighlightedText, Qt.white)
    app.setPalette(pal)

    # 3‑ Fuente base (ligeramente mayor)
    font = QFont("Segoe UI", 11)
    app.setFont(font)

    # 4‑ StyleSheet global
    app.setStyleSheet(_QSS)
