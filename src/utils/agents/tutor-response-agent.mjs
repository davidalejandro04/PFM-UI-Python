import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres el agente tutor visible de un sistema de tutoria de matematicas infantiles en español.
Tu tarea: generar la respuesta que el estudiante vera basandote en la decision pedagogica.

Responde SOLO con JSON valido:
{
  "response": "texto de respuesta aqui"
}

Reglas ESTRICTAS:
- UN solo movimiento pedagogico por turno
- Maximo 2-3 oraciones cortas
- Tono alentador, cercano y amigable (como un profesor que le habla a un niño)
- SIEMPRE en español

Segun la accion pedagogica:
- confirm_and_advance: Celebra brevemente ("¡Muy bien!", "¡Correcto!", "¡Excelente!") y di que avanzamos al siguiente paso. NO hagas mas preguntas.
- give_hint_1: Da una pista suave y general. Pregunta algo que oriente al estudiante sin revelar la respuesta.
- give_hint_2: Da una pista mas directa. Señala el camino especifico.
- give_hint_3: Da una pista muy fuerte, casi la respuesta. Solo deja que el estudiante complete el ultimo paso.
- give_solution: Muestra la respuesta completa y explica brevemente por que es correcta. Usa "La respuesta es:" al inicio.
- corrective_feedback: Señala amablemente que parte esta bien y que parte necesita ajuste. No ataques al estudiante.
- clarify_request: Pide amablemente que el estudiante explique mas o sea mas especifico.
- motivate: Da animo especifico y concreto.`;

export async function tutorResponseAgent(
  { decision, currentSubproblem, learnerModel = null },
  { askFn, model, maxTokens = 220 }
) {
  const hintText = (() => {
    const action = decision.pedagogical_action;
    const ladder = currentSubproblem.hint_ladder || [];
    if (action === "give_hint_1") return ladder[0] || "";
    if (action === "give_hint_2") return ladder[1] || ladder[0] || "";
    if (action === "give_hint_3") return ladder[2] || ladder[1] || ladder[0] || "";
    if (action === "give_solution") return currentSubproblem.expected_answer || "";
    return "";
  })();

  const isHighFrustration = (learnerModel?.frustration_risk || 0) > 0.6;

  const userPrompt = [
    `Subproblema: "${currentSubproblem.prompt}"`,
    `Respuesta esperada (referencia interna): "${currentSubproblem.expected_answer}"`,
    `Tipo de turno del estudiante: ${decision.student_turn_type}`,
    `Accion pedagogica seleccionada: ${decision.pedagogical_action}`,
    `Razon: ${decision.reason}`,
    hintText ? `Material de apoyo para tu respuesta: "${hintText}"` : "",
    isHighFrustration ? "NOTA: El estudiante puede estar frustrado. Usa un tono especialmente alentador y paciente." : "",
    ``,
    decision.pedagogical_action === "confirm_and_advance"
      ? `IMPORTANTE: La respuesta del estudiante es correcta. Confirma brevemente y felicita.`
      : "",
    decision.pedagogical_action === "give_solution"
      ? `IMPORTANTE: Da la respuesta completa al estudiante. Empieza con "La respuesta es:" y luego explica brevemente.`
      : ""
  ].filter(Boolean).join("\n");

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { model, maxTokens, temperature: 0.3 }
  );

  const parsed = safeParseAgentJson(raw, null);
  if (parsed?.response) return { response: String(parsed.response) };

  const trimmed = String(raw || "").trim();
  return { response: trimmed || "Sigue intentando, vas bien." };
}
