import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un agente de decision pedagogica para un tutor de matematicas infantiles siguiendo la metodologia CLASS.

Tu tarea PRINCIPAL: interpretar semanticamente la respuesta del estudiante y decidir la accion pedagogica.

REGLA CRITICA DE INTERPRETACION:
- Tu trabajo NO es comparar texto literal. Tu trabajo es ENTENDER el significado de la respuesta.
- Si el estudiante demuestra comprension del concepto, es CORRECTO aunque use palabras diferentes a la respuesta esperada.
- Ejemplo: si la pregunta es "¿Por que 37 es primo?" y la respuesta esperada es "Solo es divisible entre 1 y 37", entonces "Porque es solo divisible entre 37 y 1" ES CORRECTO.
- Ejemplo: si la pregunta es "¿Cuanto es 3+4?" y el estudiante responde "siete" o "7" o "es 7", todo es CORRECTO.
- Acepta variaciones de orden, sinonimos, explicaciones equivalentes, formatos diferentes (numeros vs palabras).
- Solo marca "incorrect" cuando el concepto matematico sea genuinamente erroneo.
- Marca "partial" solo si falta una parte significativa de la respuesta, no por diferencia de formato.

Responde SOLO con JSON valido:
{
  "student_turn_type": "correct|incorrect|partial|unclear|student_inquiry",
  "pedagogical_action": "confirm_and_advance|give_hint_1|give_hint_2|give_hint_3|corrective_feedback|clarify_request|give_solution|motivate",
  "stay_on_subproblem": true,
  "next_subproblem_id": null,
  "reason": "explicacion breve"
}

Politica de acciones segun clasificacion:
- Si student_turn_type es "correct": SIEMPRE usa pedagogical_action "confirm_and_advance" y stay_on_subproblem false
- Si student_turn_type es "partial": usa "corrective_feedback" para indicar que falta
- Si student_turn_type es "incorrect": sigue la politica de pistas segun intentos fallidos
- Si student_turn_type es "unclear": usa "clarify_request"
- Si student_turn_type es "student_inquiry": usa "motivate" o "give_hint_1"

Politica de pistas segun intentos fallidos:
- 0-1 fallos: give_hint_1
- 2+ fallos: give_solution (dar la respuesta y avanzar)

Tipos de turno:
- correct: la respuesta demuestra comprension del concepto (aunque use palabras diferentes)
- incorrect: el concepto matematico es claramente erroneo
- partial: parte de la respuesta es correcta pero falta algo importante
- unclear: respuesta demasiado vaga para evaluar
- student_inquiry: el estudiante hace una pregunta en vez de responder`;

export async function pedagogicalDecisionAgent(
  { studentMessage, currentSubproblem, learnerModel = null, retryCount = 0 },
  { askFn, model, maxTokens = 180 }
) {
  const userPrompt = [
    `Subproblema actual:`,
    `  Pregunta: "${currentSubproblem.prompt}"`,
    `  Respuesta esperada (referencia, no literal): "${currentSubproblem.expected_answer}"`,
    `  Pistas disponibles: ${JSON.stringify(currentSubproblem.hint_ladder || [])}`,
    `  Errores comunes: ${JSON.stringify(currentSubproblem.common_misconceptions || [])}`,
    ``,
    `Respuesta del estudiante: "${studentMessage}"`,
    `Intentos previos fallidos: ${retryCount}`,
    learnerModel ? `Nivel de frustracion: ${learnerModel.frustration_risk}` : "",
    ``,
    `INSTRUCCIONES:`,
    `1. Interpreta el SIGNIFICADO de la respuesta del estudiante, no la comparacion literal de texto.`,
    `2. Si el estudiante demuestra comprension correcta del concepto, marca "correct" y "confirm_and_advance".`,
    `3. Si ya lleva ${retryCount} fallos previos y la respuesta es incorrecta, ${retryCount >= 2 ? 'usa "give_solution" para dar la respuesta y avanzar' : 'da una pista apropiada'}.`,
    `4. Clasifica la respuesta y elige la accion pedagogica.`
  ].filter(Boolean).join("\n");

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { model, maxTokens, temperature: 0.1 }
  );

  const parsed = safeParseAgentJson(raw, {});

  // If retryCount >= 2 and still incorrect, force give_solution
  let turnType = String(parsed.student_turn_type || "unclear");
  let action = String(parsed.pedagogical_action || "give_hint_1");
  let stayOnSubproblem = Boolean(parsed.stay_on_subproblem !== false);

  if (turnType === "correct") {
    action = "confirm_and_advance";
    stayOnSubproblem = false;
  } else if (retryCount >= 2 && turnType !== "correct" && turnType !== "student_inquiry") {
    action = "give_solution";
    stayOnSubproblem = false;
  }

  return {
    student_turn_type: turnType,
    pedagogical_action: action,
    stay_on_subproblem: stayOnSubproblem,
    next_subproblem_id: parsed.next_subproblem_id || null,
    reason: String(parsed.reason || "")
  };
}
