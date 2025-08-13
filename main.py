import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtWebEngineWidgets import QWebEngineView

from ui import apply_style
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
        self.setWindowTitle("Tutor de matemáticas")
        self.resize(900, 560)

        # -------- modelos
        profile_m = ProfileModel()
        lessons_m = LessonsModel()

        # -------- controladores (autocrean su vista)
        self.profileC  = ProfileController(profile_m, lessons_m)
        self.lessonsC  = LessonsController(profile_m)   # <-- ahora recibe profile_m
        self.problemsC = ProblemsController(profile_m)

        # -------- TabBook (las VISTAS)
        self.tabs = QTabWidget()  # <-- guardar en self
        self.tabs.addTab(self.lessonsC.view,   "Lecciones")
        self.tabs.addTab(self.problemsC.view,  "Problemas")
        self.tabs.addTab(self.profileC.view,   "Perfil")
        self.setCentralWidget(self.tabs)

        def _open_from_profile(unit, title):
            self.tabs.setCurrentIndex(0)  # pestaña "Lecciones"
            self.lessonsC.open_lesson(unit, title)

        self.profileC.view.openLessonRequested.connect(_open_from_profile)

if __name__ == "__main__":

    app = QApplication(sys.argv)
    apply_style(app)
    win = TutorApp()
    win.show()
    sys.exit(app.exec())
