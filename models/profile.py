from pathlib import Path
import json

_DATA = Path(__file__).parent.parent / "data"
_DATA.mkdir(exist_ok=True)

class ProfileModel:
    _FILE = _DATA / "profile.json"

    def __init__(self):
        self.data = self._load()

    # ------------------------ API pública
    def xp(self):                 return self.data["xp"]
    def lessons_completed(self):  return self.data["lessonsCompleted"]

    def add_xp(self, pts: int =1):
        self.data["xp"] += pts
        self._save()

    def reset(self):
        self.data = {"xp":0, "lessonsCompleted":0}
        self._save()

    # ------------------------ Active‑Record Interno

    def _load(self):
        try:
            if self._FILE.exists() and self._FILE.stat().st_size > 0:
                return json.loads(self._FILE.read_text(encoding="utf8"))
        except json.JSONDecodeError:
            # log opcional: archivo corrupto
            pass
        # valor por defecto
        return {"xp": 0, "lessonsCompleted": 0}

    def _save(self):
        self._FILE.write_text(json.dumps(self.data, indent=2), encoding="utf8")
