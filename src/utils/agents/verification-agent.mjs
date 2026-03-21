import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un agente verificador para un tutor de matematicas.
Tu tarea: verificar que la respuesta del tutor sea apropiada para la situacion pedagogica.

Responde SOLO con JSON valido:
{
  "approved": true,
  "issues": [],
  "required_rewrite": false
}

Verifica que la respuesta del tutor:
1. Coincide con la accion pedagogica seleccionada
2. No revela la respuesta completa cuando la accion es una pista
3. No contiene informacion matematicamente incorrecta
4. Esta en español`;

export async function verificationAgent(
  { candidateResponse, decision, currentSubproblem },
  { askFn, model, maxTokens = 150 }
) {
  const userPrompt = [
    `Accion pedagogica: ${decision.pedagogical_action}`,
    `Tipo de turno: ${decision.student_turn_type}`,
    `Subproblema: "${currentSubproblem.prompt}"`,
    `Respuesta correcta (interna, no mostrar al estudiante): "${currentSubproblem.expected_answer}"`,
    ``,
    `Respuesta candidata del tutor:`,
    `"${candidateResponse}"`,
    ``,
    `Verifica si es apropiada.`
  ].join("\n");

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { model, maxTokens, temperature: 0 }
  );

  const parsed = safeParseAgentJson(raw, {});
  return {
    approved: Boolean(parsed.approved !== false),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    required_rewrite: Boolean(parsed.required_rewrite)
  };
}
