import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un agente de modelado del estudiante para un tutor de matematicas.
Analiza el historial del estudiante y estima su estado de aprendizaje actual.

Responde SOLO con JSON valido:
{
  "mastery_estimate": 0.5,
  "misconceptions": [],
  "frustration_risk": 0.0,
  "recommended_support_level": "medium",
  "notes": ""
}

Escalas:
- mastery_estimate: 0.0 (no sabe nada) a 1.0 (domina completamente)
- frustration_risk: 0.0 (tranquilo) a 1.0 (muy frustrado)
- recommended_support_level: "low" (avanza rapido), "medium" (ritmo normal), "high" (necesita muchas pistas)`;

export async function learnerModelAgent(
  { recentResponses = [], profile = null, currentSubproblem = null, retryCount = 0 },
  { askFn, model, maxTokens = 220 }
) {
  const openStruggles = profile?.struggleSignals?.filter((s) => s.status === "open").length || 0;
  const knownCount = profile?.conceptProgress?.filter((c) => c.status === "known").length || 0;
  const recentFailures = recentResponses.filter((r) => r.result === "incorrect").length;

  const userPrompt = [
    `Historial del estudiante:`,
    `- Conceptos dominados: ${knownCount}`,
    `- Senales de dificultad abiertas: ${openStruggles}`,
    `- Fallos en esta sesion: ${recentFailures}`,
    `- Intentos en el subproblema actual: ${retryCount}`,
    recentResponses.length ? `Respuestas recientes: ${JSON.stringify(recentResponses.slice(-5))}` : "",
    currentSubproblem ? `Subproblema actual: "${currentSubproblem.prompt}"` : ""
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
    mastery_estimate: Number(parsed.mastery_estimate ?? 0.5),
    misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : [],
    frustration_risk: Number(parsed.frustration_risk ?? 0.0),
    recommended_support_level: String(parsed.recommended_support_level || "medium"),
    notes: String(parsed.notes || "")
  };
}
