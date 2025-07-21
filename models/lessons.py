# models/lessons.py  (reemplaza el archivo)
import json
from pathlib import Path

_DATA = Path(__file__).parent.parent / "data" / "lessons.json"

class LessonsModel:
    """Gestiona unidades → lecciones → stages."""
    def __init__(self):
        self.units = self._load()

    # --------------- lectura segura
    def _load(self):
        if not _DATA.exists():
            return []
        try:
            return json.loads(_DATA.read_text(encoding="utf8"))
        except json.JSONDecodeError:
            return []

    # --------------- API
    def all_units(self):
        return [u["unit"] for u in self.units]

    def lessons_of(self, unit_name):
        unit = next((u for u in self.units if u["unit"] == unit_name), None)
        return unit["lessons"] if unit else []

    def stages_of(self, unit_name, lesson_title):
        for l in self.lessons_of(unit_name):
            if l["title"] == lesson_title:
                return l["stages"]
        return []
