import sys
from pathlib import Path
from PySide6.QtWidgets import QApplication, QMainWindow, QTabWidget

from ui import apply_style           
from models.profile    import ProfileModel
from models.lessons    import LessonsModel
from controllers.profile  import ProfileController
from controllers.lessons  import LessonsController
from controllers.problems import ProblemsController

class TutorApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Math Tutor (MVC‑Qt)")
        self.resize(900, 560)

        # -------- modelos
        profile_m = ProfileModel()
        lessons_m = LessonsModel()

        # -------- controladores (autocrean su vista)
        self.profileC  = ProfileController(profile_m)
        self.lessonsC  = LessonsController(lessons_m, profile_m)
        self.problemsC = ProblemsController(profile_m)

        # -------- TabBook (las VISTAS)
        tabs = QTabWidget()
        tabs.addTab(self.lessonsC.view,   "Lessons")
        tabs.addTab(self.problemsC.view,  "Problems")
        tabs.addTab(self.profileC.view,   "Profile")
        self.setCentralWidget(tabs)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    apply_style(app)                  # ② NUEVO

    win = TutorApp()   # ← guarda la referencia
    win.show()
    sys.exit(app.exec())   # ← deja que Qt procese eventos
