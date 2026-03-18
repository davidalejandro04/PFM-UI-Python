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

export const contextFlashcardPrompt =
  "Eres un tutor de matematicas que convierte dudas breves en tarjetas de ayuda. " +
  "Responde solo en JSON valido con esta forma exacta: " +
  '{"needsMoreContext":false,"followUp":"...","topic":"...","cards":[{"title":"...","body":"..."},{"title":"...","body":"..."},{"title":"...","body":"..."}]} ' +
  "Si la seleccion no tiene suficiente contexto para ayudar de forma responsable, usa needsMoreContext=true y followUp debe pedir que el estudiante seleccione mas texto. " +
  "Si si hay contexto, genera exactamente 3 tarjetas: concepto general, ejemplo guiado y relacion con lo seleccionado. " +
  "No uses markdown ni bloques de codigo.";

export function buildExplainImageUserPrompt() {
  return [
    "Observa el recorte de la leccion.",
    "Identifica el objeto, figura o representacion matematica principal.",
    "Luego conecta lo que ves con una idea clave y un ejemplo.",
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido."
  ].join(" ");
}

export function buildContextFlashcardUserPrompt(selection) {
  return [
    "Analiza la seleccion del estudiante dentro de una leccion de matematicas.",
    "Decide si tiene suficiente contexto.",
    "Si lo tiene, crea 3 tarjetas: concepto, ejemplo y relacion con la seleccion.",
    `Seleccion del estudiante: ${selection}`
  ].join(" ");
}

export function buildVisualFlashcardUserPrompt() {
  return [
    "Analiza el recorte visual de una leccion de matematicas.",
    "Identifica el objeto o idea principal.",
    "Crea 3 tarjetas: concepto general, ejemplo y relacion con lo que se ve en el recorte.",
    "No uses markdown ni bloques de codigo. Solo devuelve JSON valido."
  ].join(" ");
}

export const kidMathGatePrompt =
  "Clasifica una pregunta. " +
  "Responde solo con una etiqueta exacta en minusculas: kid_math o not_kid_math. " +
  "Usa kid_math solo si la pregunta trata sobre matematicas escolares para ninos o adolescentes. " +
  "Usa not_kid_math si no es matematicas o si requiere contenido avanzado fuera de ese nivel.";

export function buildKidMathGateUserPrompt(question) {
  return `Pregunta: ${question}`;
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

export const exerciseTracePrompt =
  "Tu objetivo es crear una conversacion simulada invisible para el estudiante entre Student y Tutorbot para un problema de matematicas. " +
  "Tutorbot divide el problema principal en subproblemas secuenciales, solo da pistas y simula multiples respuestas incorrectas del estudiante. " +
  "Debes seguir estas funciones de Decision: a1,a2,a3,b1,b2,c1,c2,c3,d1,d2,e1,e2,f1,f2,g1,g2,h. " +
  "Responde solo con JSON valido usando un arreglo de objetos con esta forma exacta: " +
  '[{"Student":"...","Thoughts":"...","Decision":"a1,a2","Subproblem":"...","Tutorbot":"..."}] ' +
  "Genera entre 5 y 9 turnos, con varios errores del estudiante, y mantente siempre en matematicas. " +
  "No uses markdown ni bloques de codigo.";

export function buildExerciseTraceUserPrompt(problem, stepLimit = 4) {
  return [
    "Ahora crea la conversacion simulada.",
    `Question: ${problem}`,
    `Limita la cantidad de subproblemas visibles a un maximo de ${stepLimit}.`,
    "Incluye varias respuestas incorrectas, ambiguas o incompletas del estudiante para que Tutorbot tenga que corregir, aclarar y redirigir.",
    "Recuerda que esto sera invisible para el estudiante pero se almacenara localmente."
  ].join(" ");
}
