export function createTutorState({
  sessionId,
  subject = "matematicas",
  topic = "",
  learningObjective = "",
  mainProblem = "",
  subproblems = [],
  studentMasteryEstimate = 0.5,
  frustrationRisk = 0.0
}) {
  const normalizedSps = subproblems.slice(0, 7).map((sp, i) => ({
    id: sp.id || `sp${i + 1}`,
    prompt: String(sp.prompt || ""),
    expected_answer: String(sp.expected_answer || ""),
    hint_ladder: Array.isArray(sp.hint_ladder) ? sp.hint_ladder : [],
    common_misconceptions: Array.isArray(sp.common_misconceptions) ? sp.common_misconceptions : [],
    status: "pending"
  }));

  return {
    session_id: sessionId,
    student_id: "local",
    subject,
    topic,
    learning_objective: learningObjective,
    main_problem: mainProblem,
    subproblems: normalizedSps,
    current_subproblem_id: normalizedSps[0]?.id || "sp1",
    student_turn_type: "continue",
    student_mastery_estimate: studentMasteryEstimate,
    frustration_risk: frustrationRisk,
    engagement_level: 0.8,
    retrieved_evidence: [],
    pedagogical_action: "ask_subquestion",
    final_response: "",
    memory_updates: []
  };
}

export function getCurrentSubproblem(tutorState) {
  return tutorState.subproblems.find((sp) => sp.id === tutorState.current_subproblem_id) || null;
}

export function advanceSubproblem(tutorState) {
  const currentIndex = tutorState.subproblems.findIndex((sp) => sp.id === tutorState.current_subproblem_id);
  const nextSp = tutorState.subproblems[currentIndex + 1];
  return {
    ...tutorState,
    subproblems: tutorState.subproblems.map((sp, i) =>
      i === currentIndex ? { ...sp, status: "done" } : sp
    ),
    current_subproblem_id: nextSp?.id || tutorState.current_subproblem_id
  };
}

export function tutorStateToSolution(tutorState) {
  return {
    topic: tutorState.topic,
    conceptTopic: tutorState.topic,
    exercise: tutorState.main_problem,
    steps: tutorState.subproblems.map((sp) => ({
      id: sp.id,
      title: sp.prompt,
      prompt: sp.prompt,
      acceptedAnswers: sp.expected_answer ? [sp.expected_answer] : [],
      hint: sp.hint_ladder[0] || "",
      explanation: sp.common_misconceptions.join(". ") || "",
      hintLadder: sp.hint_ladder,
      misconceptions: sp.common_misconceptions
    })),
    finalReflection: `Has completado: ${tutorState.learning_objective}`
  };
}
