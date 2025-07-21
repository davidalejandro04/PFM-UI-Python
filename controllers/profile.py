# controllers/profile.py
from PySide6.QtCore import QObject
from views.profile import ProfileView
from models.profile import ProfileModel


class ProfileController(QObject):
    """Controlador Perfil: conecta vista  ↔  modelo."""
    def __init__(self, profile_model: ProfileModel):
        super().__init__()
        self.model = profile_model
        self.view  = ProfileView()

        self._refresh()
        self.view.reset_clicked.connect(self._reset)

    # -------- slots internos
    def _reset(self):
        self.model.reset()
        self._refresh()

    def _refresh(self):
        self.view.set_data(
            xp=self.model.xp(),
            lessons_completed=self.model.lessons_completed()
        )
