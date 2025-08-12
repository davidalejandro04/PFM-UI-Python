# services/guard.py
import re

# Very light heuristics; tune as you wish
ALLOWED_TOPICS = [
    "aritm", "álge", "geometr", "trigonom", "cálcul", "estad", "probab",
    "fracci", "divis", "multip", "sum", "rest", "porcent", "proporc",
    "matem", "ecuaci", "inecuac", "vect", "matriz", "funci", "deriv", "integr"
]

BANNED_PATTERNS = [
    r"\b(insult|groser|obscen|porn|sexual|violaci[oó]n|odio|racism|matar|asesinar|suicid|autoles)\b",
    r"\b(armas?|drogas?|explosiv)\b"
]

SPANISH_MARKERS = [
    " el ", " la ", " de ", " que ", " y ", " con ", " una ", " por ", " para ", " como ", " esto "
]

MSG_NOT_MATH   = "Este tutor solo responde preguntas de matemáticas. Reformula tu consulta dentro de ese ámbito."
MSG_NOT_SPAN   = "Por favor, formula tu pregunta en español para poder ayudarte."
MSG_INAPPROPR  = "No puedo ayudar con ese tipo de contenido."

def is_math_related(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ALLOWED_TOPICS)

def is_banned(text: str) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in BANNED_PATTERNS)

def pregate(user_text: str) -> str | None:
    """
    Returns a canned Spanish message if the prompt must be blocked,
    otherwise None (let the model answer).
    Rule priority: banned > not math > not spanish.
    """
    if is_banned(user_text):
        return MSG_INAPPROPR
    return None
