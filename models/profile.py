# models/profile.py
from pathlib import Path
import json, datetime as dt

_DATA = Path(__file__).parent.parent / "data"
_DATA.mkdir(exist_ok=True)

class ProfileModel:
    _FILE = _DATA / "profile.json"

    def __init__(self):
        self.data = self._load()

    # ------------------------ API pública
    def xp(self):                 return self.data.get("xp", 0)
    def lessons_completed(self):  return self.data.get("lessonsCompleted", 0)

    def add_xp(self, pts: int =1):
        self.data["xp"] = self.data.get("xp", 0) + int(pts)
        self._save()

    def reset(self):
        self.data = {"xp": 0, "lessonsCompleted": 0, "completed": []}
        self._save()

    # ---- NUEVO: registrar finalización de una lección
    def record_completion(self, unit: str, title: str, xp_gain: int = 5):
        pair = {"unit": unit, "title": title, "ts": dt.datetime.utcnow().isoformat()}
        comp = self.data.setdefault("completed", [])
        # idempotente: no duplicar si ya existe
        if not any(c["unit"] == unit and c["title"] == title for c in comp):
            comp.append(pair)
            self.data["lessonsCompleted"] = self.data.get("lessonsCompleted", 0) + 1
            self.data["xp"] = self.data.get("xp", 0) + xp_gain
            self._save()

    # ---- NUEVO: utilidades para la UI
    def completed_pairs(self):
        """Conjunto {(unit, title)} de lecciones completadas."""
        return {(c["unit"], c["title"]) for c in self.data.get("completed", [])}

    def recent(self, n: int = 6):
        """Últimas n lecciones (unit, title, ts) más recientes."""
        comp = list(self.data.get("completed", []))
        comp.sort(key=lambda c: c.get("ts", ""), reverse=True)
        return comp[:n]

    # ------------------------ Active-Record Interno
    def _load(self):
        try:
            if self._FILE.exists() and self._FILE.stat().st_size > 0:
                data = json.loads(self._FILE.read_text(encoding="utf8"))
                # valores por defecto si faltan
                data.setdefault("xp", 0)
                data.setdefault("lessonsCompleted", 0)
                data.setdefault("completed", [])
                return data
        except json.JSONDecodeError:
            pass
        return {"xp": 0, "lessonsCompleted": 0, "completed": []}

    def _save(self):
        self._FILE.write_text(json.dumps(self.data, indent=2), encoding="utf8")
