export const modeLabels = {
  coach: "Tutor",
  steps: "Paso a paso",
  challenge: "Reto"
};

export function buildSystemPrompt(mode) {
  const stylePrompt = {
    coach: "Responde como tutor cercano: breve, claro, con un siguiente paso concreto.",
    steps: "Responde con pasos enumerados y explica por que ocurre cada paso.",
    challenge: "No entregues toda la solucion al inicio: da una pista, valida comprension y luego desarrolla."
  }[mode] || "Responde de forma clara y pedagogica.";

  return (
    "Eres un tutor de matematicas en espanol. " +
    "Solo ayudas con matematicas escolares o universitarias, " +
    "siempre en espanol y con notacion LaTeX cuando haga falta. " +
    stylePrompt
  );
}

export const explainPrompt =
  "Eres un tutor de matematicas para estudiantes. " +
  "Responde solo en JSON valido con esta forma exacta: " +
  '{"concept":"...", "example":"...", "answer":"..."} ' +
  "donde concept resume el concepto general, example da un ejemplo corto y answer responde directamente la duda del estudiante.";

export function buildExplainUserPrompt(selection) {
  return [
    "Analiza la siguiente seleccion del estudiante.",
    "Descompon la respuesta en concepto general, ejemplo corto y respuesta directa.",
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido.",
    `Seleccion: ${selection}`
  ].join(" ");
}

export const visionExplainPrompt =
  "Eres un tutor visual de matematicas. " +
  "Recibiras una imagen recortada de una leccion. " +
  "Responde solo en JSON valido con esta forma exacta: " +
  '{"concept":"...", "example":"...", "answer":"..."} ' +
  "donde concept identifica el objeto matematico observado, example da un ejemplo cercano y answer responde la pregunta 'que es esto?'.";

export function buildExplainImageUserPrompt() {
  return [
    "Observa el recorte de la leccion.",
    "Identifica el objeto, figura o representacion matematica principal.",
    "Luego conecta lo que ves con una idea clave y un ejemplo.",
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido."
  ].join(" ");
}

export const studyClassifierPrompt =
  "Clasifica preguntas de estudiantes de matematicas. " +
  "Devuelve solo JSON valido con esta forma exacta: " +
  '{"kind":"concept|exercise|non_math","topic":"...","conceptTopic":"...","relatedTopics":["..."],"reason":"..."} ' +
  "Usa kind=concept si pide entender una idea, definicion, propiedad o comparacion conceptual. " +
  "Usa kind=exercise si pide resolver, revisar, comprobar o desarrollar un problema concreto. " +
  "Usa kind=non_math si no es contenido matematico o es conversacion irrelevante para estudiar. " +
  "conceptTopic debe nombrar el concepto matematico principal necesario para ayudar. " +
  "topic puede describir el foco inmediato de la pregunta. " +
  "relatedTopics debe contener solo 0 a 4 temas matematicos breves y utiles.";

export function buildClassifierUserPrompt(question, knownConcepts = []) {
  const known = knownConcepts.length
    ? knownConcepts.join(", ")
    : "sin conceptos registrados todavia";

  return [
    "Clasifica la siguiente pregunta del estudiante.",
    `Conceptos ya estudiados: ${known}.`,
    `Pregunta: ${question}`,
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido."
  ].join(" ");
}

export const studyDeckPrompt =
  "Genera tarjetas de estudio para un tutor de matematicas. " +
  "Devuelve solo JSON valido con esta forma exacta: " +
  '{"topic":"...","focusTrail":["..."],"relatedTopics":["..."],"cards":[{"kind":"concept","title":"...","body":"...","checkPrompt":"..."},{"kind":"example","title":"...","body":"...","example":"...","prompt":"..."},{"kind":"game","title":"...","body":"...","gameType":"match-pairs","instructions":"...","pairs":[{"left":"...","right":"..."}]}]} ' +
  "La secuencia debe ir de conceptos base a concepto objetivo. " +
  "La primera tarjeta explica el concepto general relevante. " +
  "La segunda tarjeta da un ejemplo trabajado. " +
  "La ultima tarjeta debe ser un juego generalizable de tipo game con gameType='match-pairs' y entre 3 y 5 pares. " +
  "Cada texto debe ser breve, claro y util para un estudiante.";

export function buildStudyDeckUserPrompt({
  question,
  topic,
  conceptTopic,
  relatedTopics = [],
  knownConcepts = []
}) {
  const known = knownConcepts.length ? knownConcepts.join(", ") : "sin conceptos registrados";
  const related = relatedTopics.length ? relatedTopics.join(", ") : "sin temas adicionales";

  return [
    "Crea un set de study cards para este estudiante.",
    `Pregunta original: ${question}`,
    `Tema inmediato: ${topic}`,
    `Concepto principal: ${conceptTopic || topic}`,
    `Temas relacionados sugeridos: ${related}`,
    `Conceptos registrados para el estudiante: ${known}`,
    "Incluye un focusTrail de arriba hacia abajo con los conceptos previos y el objetivo.",
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido."
  ].join(" ");
}

export const exerciseTutorPrompt =
  "Genera una solucion guiada para un ejercicio de matematicas. " +
  "Devuelve solo JSON valido con esta forma exacta: " +
  '{"topic":"...","conceptTopic":"...","exercise":"...","steps":[{"title":"...","prompt":"...","acceptedAnswers":["..."],"hint":"...","explanation":"..."}],"finalReflection":"..."} ' +
  "La solucion debe ser paso a paso y obligar al estudiante a completar pasos. " +
  "Cada step debe pedir una accion concreta y tener 1 o mas acceptedAnswers cortas. " +
  "Las acceptedAnswers deben ser razonables y directas. " +
  "No regales toda la solucion en el primer paso. " +
  "finalReflection debe invitar a comprobar la estrategia usada.";

export function buildExerciseTutorUserPrompt({
  question,
  topic,
  conceptTopic,
  relatedTopics = [],
  knownConcepts = [],
  mode = "coach"
}) {
  const known = knownConcepts.length ? knownConcepts.join(", ") : "sin conceptos registrados";
  const related = relatedTopics.length ? relatedTopics.join(", ") : "sin temas adicionales";

  return [
    "Resuelve el ejercicio de forma guiada para que el estudiante complete pasos.",
    `Pregunta original: ${question}`,
    `Tema inmediato: ${topic}`,
    `Concepto principal: ${conceptTopic || topic}`,
    `Temas relacionados: ${related}`,
    `Modo pedagogico: ${mode}`,
    `Conceptos ya registrados: ${known}`,
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido."
  ].join(" ");
}
