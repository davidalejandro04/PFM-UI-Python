import json, itertools
from pathlib import Path

_DATA = Path(__file__).parent.parent / "data" / "lessons.json"

class LessonsModel:
    def __init__(self):
        self.lessons = json.loads(_DATA.read_text(encoding="utf8"))

    def all(self):
        return self.lessons

    def by_unit(self):
        keyfunc = lambda l: l.get("unit", "General")
        for unit, group in itertools.groupby(sorted(self.lessons, key=keyfunc), keyfunc):
            yield unit, list(group)
