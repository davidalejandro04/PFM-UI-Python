import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un planificador pedagogico para un tutor de matematicas infantiles en español.
Tu tarea: transformar la pregunta del estudiante en un plan de tutoria eficiente y progresivo.

Responde SOLO con JSON valido:
{
  "learning_objective": "string",
  "main_problem": "string",
  "subproblems": [
    {
      "id": "sp1",
      "prompt": "string - pregunta clara y concreta",
      "expected_answer": "string - respuesta corta y directa",
      "hint_ladder": ["pista 1 (orientacion general)", "pista 2 (mas especifica)", "La respuesta es: ..."],
      "common_misconceptions": ["error tipico"]
    }
  ]
}

ESTRATEGIA DE PREGUNTAS (obligatoria):
1. PRIMER subproblema: Identifica el concepto central y haz una pregunta INDIRECTA relacionada.
   Ejemplo: si el tema es "numeros primos", pregunta "¿Un numero primo se puede dividir exactamente entre cuantos numeros?"
2. SEGUNDO subproblema: Da un ejemplo ULTRA SIMPLE y pregunta al estudiante sobre el.
   Ejemplo: "¿El numero 2 es primo? ¿Por que?"
3. TERCER subproblema (y siguientes): Formula la pregunta final usando TODOS los elementos que el estudiante ya domino.
   Ejemplo: "Ahora que sabes que es un primo, ¿37 es primo? Explica tu razonamiento."

REGLAS PARA PISTAS (obligatorias):
- SIEMPRE genera exactamente 3 pistas por subproblema
- Pista 1: Orientacion general (en que pensar, sin revelar la respuesta)
- Pista 2: Mas especifica (que operacion o concepto aplicar)
- Pista 3: SIEMPRE debe ser la respuesta completa, en formato "La respuesta es: [respuesta]"
- Las pistas se muestran UNA A LA VEZ al estudiante

REGLAS GENERALES:
- Usa entre 2 y 5 subproblemas ordenados de menor a mayor dificultad
- Cada subproblema debe ser una pregunta CONCRETA que se pueda responder en 1-2 frases cortas
- NO repitas la pregunta original como unico subproblema
- Las respuestas esperadas deben ser CORTAS y CLARAS (1 frase o un numero)
- NO generes preguntas que se desvien del tema matematico
- Todo en español`;

export async function scaffoldingPlannerAgent(
  { question, subject = "matematicas", gradeLevel = "", learnerModel = null },
  { askFn, model, maxTokens = 900 }
) {
  const supportLevel = learnerModel?.recommended_support_level || "medium";
  const misconceptions = (learnerModel?.misconceptions || []).join(", ");

  const userPrompt = [
    `Pregunta del estudiante: "${question}"`,
    `Materia: ${subject}`,
    gradeLevel ? `Nivel escolar: ${gradeLevel}` : "",
    `Nivel de apoyo recomendado: ${supportLevel}`,
    misconceptions ? `Conceptos erroneos detectados: ${misconceptions}` : "",
    ``,
    `Instrucciones:`,
    `1. Identifica el concepto central de la pregunta`,
    `2. Primer paso: pregunta INDIRECTA sobre el concepto central`,
    `3. Segundo paso: ejemplo ULTRA SIMPLE para que el estudiante practique`,
    `4. Tercer paso (o mas): la pregunta final usando lo que ya domino`,
    `5. Cada paso necesita 3 pistas: general, especifica, y la respuesta completa`,
    `6. La tercera pista SIEMPRE empieza con "La respuesta es:"`,
    ``,
    `Crea el plan de tutoria.`
  ].filter(Boolean).join("\n");

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { model, maxTokens, temperature: 0.2 }
  );

  const parsed = safeParseAgentJson(raw, {});
  const subproblems = Array.isArray(parsed.subproblems) ? parsed.subproblems : [];

  if (!subproblems.length) {
    return {
      learning_objective: question,
      main_problem: question,
      subproblems: [{
        id: "sp1",
        prompt: question,
        expected_answer: "",
        hint_ladder: [
          "Piensa en lo que ya sabes sobre este tema.",
          "Intenta pensar paso a paso.",
          "La respuesta es: revisa la pregunta e intenta de nuevo."
        ],
        common_misconceptions: []
      }]
    };
  }

  return {
    learning_objective: String(parsed.learning_objective || question),
    main_problem: String(parsed.main_problem || question),
    subproblems: subproblems.slice(0, 7).map((sp, i) => {
      const hintLadder = Array.isArray(sp.hint_ladder) ? sp.hint_ladder : [];
      const expectedAnswer = String(sp.expected_answer || "");
      // Ensure we always have 3 hints, with the 3rd being the answer
      while (hintLadder.length < 2) {
        hintLadder.push(
          hintLadder.length === 0 ? "Piensa en lo que ya sabes sobre este tema."
          : "Intenta aplicar lo que acabas de pensar."
        );
      }
      // Force 3rd hint to be the answer
      if (hintLadder.length < 3) {
        hintLadder.push(expectedAnswer ? `La respuesta es: ${expectedAnswer}` : "La respuesta es: revisa la pregunta e intenta de nuevo.");
      } else if (hintLadder[2] && !String(hintLadder[2]).toLowerCase().startsWith("la respuesta es")) {
        hintLadder[2] = expectedAnswer ? `La respuesta es: ${expectedAnswer}` : hintLadder[2];
      }
      return {
        id: String(sp.id || `sp${i + 1}`),
        prompt: String(sp.prompt || ""),
        expected_answer: expectedAnswer,
        hint_ladder: hintLadder.slice(0, 3),
        common_misconceptions: Array.isArray(sp.common_misconceptions) ? sp.common_misconceptions : []
      };
    })
  };
}
