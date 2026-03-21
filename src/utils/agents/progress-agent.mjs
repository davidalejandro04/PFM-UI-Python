import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un agente de progreso para un tutor de matematicas.
Tu tarea: resumir la sesion y generar actualizaciones de memoria para el perfil del estudiante.

Responde SOLO con JSON valido:
{
  "memory_update": {
    "concept": "nombre del concepto",
    "status": "introducing|improving|mastered",
    "misconceptions": []
  },
  "session_summary": "resumen breve de una o dos oraciones"
}`;

export async function progressAgent(
  { tutorState, sessionEvents = [] },
  { askFn, model, maxTokens = 180 }
) {
  const completedSps = tutorState.subproblems.filter((sp) => sp.status === "done").length;
  const totalSps = tutorState.subproblems.length;

  const userPrompt = [
    `Sesion de tutoria completada:`,
    `Tema: ${tutorState.topic}`,
    `Objetivo: ${tutorState.learning_objective}`,
    `Subproblemas completados: ${completedSps} / ${totalSps}`,
    `Estimacion de dominio final: ${tutorState.student_mastery_estimate}`,
    `Riesgo de frustracion: ${tutorState.frustration_risk}`,
    tutorState.memory_updates?.length ? `Notas acumuladas: ${JSON.stringify(tutorState.memory_updates)}` : "",
    `Genera actualizacion de memoria y resumen de sesion.`
  ].filter(Boolean).join("\n");

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { model, maxTokens, temperature: 0.1 }
  );

  const parsed = safeParseAgentJson(raw, {});
  return {
    memory_update: parsed.memory_update || {
      concept: tutorState.topic,
      status: "improving",
      misconceptions: []
    },
    session_summary: String(parsed.session_summary || "")
  };
}
