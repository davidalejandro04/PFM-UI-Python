# views/profile.py
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QPushButton


class ProfileView(QWidget):
    """Vista Perfil – muestra progreso y permite reset."""
    def __init__(self):
        super().__init__()
        self._label = QLabel()
        self._reset_btn = QPushButton("Reiniciar progreso")

        lay = QVBoxLayout(self)
        lay.addWidget(self._label)
        lay.addStretch(1)
        lay.addWidget(self._reset_btn)

    # ------- API usada por el controlador
    def set_data(self, xp: int, lessons_completed: int):
        self._label.setText(
            f"<h3>Perfil</h3>"
            f"Puntos de experiencia: {xp}<br>"
            f"Lecciones terminadas: {lessons_completed}"
        )

    @property
    def reset_clicked(self):
        return self._reset_btn.clicked
