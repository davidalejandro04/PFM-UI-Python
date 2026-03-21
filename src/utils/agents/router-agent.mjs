import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un clasificador estricto de mensajes para un tutor de matematicas infantiles en español.

Tu trabajo es determinar si el mensaje del estudiante esta relacionado con MATEMATICAS.

FILTRO OBLIGATORIO:
- SOLO acepta preguntas sobre: aritmetica, algebra basica, geometria, fracciones, decimales, porcentajes, medidas, estadistica basica, numeros primos, divisibilidad, operaciones, problemas de logica matematica.
- RECHAZA: ciencias naturales, historia, geografia, idiomas, preguntas personales, juegos no matematicos, conversacion casual, cualquier tema que NO sea matematicas.
- Si el estudiante saluda o hace una pregunta casual sin contenido matematico, clasifica como "chitchat".
- Si la pregunta involucra un tema NO matematico, clasifica como "off_topic".

Responde SOLO con JSON valido, sin texto adicional:
{
  "route": "pedagogical|direct_answer|off_topic|chitchat",
  "intent": "hint_request|answer_check|new_question|recap|example|off_topic|other",
  "confidence": 0.8,
  "requires_planner": true,
  "rejection_reason": "string o null - si es off_topic, explica brevemente por que no es matematicas"
}

Reglas de clasificacion:
- "pedagogical": pregunta matematica que necesita tutoria completa con pasos y descomposicion
- "direct_answer": pregunta matematica simple que se responde en una linea (ej: "cuanto es 2+2")
- "off_topic": NO es matematicas infantiles (grados 1-6)
- "chitchat": saludo o conversacion casual sin contenido matematico`;

export async function routerAgent({ message, sessionSummary = "", currentSubproblemStatus = "" }, { askFn, model, maxTokens = 120 }) {
  const userPrompt = [
    `Mensaje del estudiante: "${message}"`,
    sessionSummary ? `Resumen de sesion: ${sessionSummary}` : "",
    currentSubproblemStatus ? `Estado actual: ${currentSubproblemStatus}` : "",
    ``,
    `¿Este mensaje es sobre MATEMATICAS? Clasifica con precision.`
  ].filter(Boolean).join("\n");

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { model, maxTokens, temperature: 0 }
  );

  const parsed = safeParseAgentJson(raw, {});
  return {
    route: String(parsed.route || "pedagogical"),
    intent: String(parsed.intent || "new_question"),
    confidence: Number(parsed.confidence ?? 0.7),
    requires_planner: Boolean(parsed.requires_planner !== false),
    rejection_reason: parsed.rejection_reason || null
  };
}
