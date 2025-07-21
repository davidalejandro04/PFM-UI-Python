import random

def rand_resp(question: str) -> str:
    templates = [
        "¡Interesante pregunta! Para resolverla, recuerda que {}.",
        "Pensemos juntos 🤔. Un buen primer paso es {}.",
        "Prueba descomponer el problema: {}.",
        "Una pista: {}."
    ]
    hint = random.choice([
        "sumar los términos semejantes",
        "dibujar un diagrama",
        "aplicar la propiedad distributiva",
        "buscar un patrón en los números"
    ])
    return random.choice(templates).format(hint)
