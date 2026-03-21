import { routerAgent } from "./router-agent.mjs";
import { learnerModelAgent } from "./learner-model-agent.mjs";
import { scaffoldingPlannerAgent } from "./scaffolding-planner-agent.mjs";
import { pedagogicalDecisionAgent } from "./pedagogical-decision-agent.mjs";
import { tutorResponseAgent } from "./tutor-response-agent.mjs";
import { verificationAgent } from "./verification-agent.mjs";
import { progressAgent } from "./progress-agent.mjs";
import { createTutorState, advanceSubproblem, tutorStateToSolution } from "./tutor-state.mjs";

export { createTutorState, tutorStateToSolution };

const TURN_TYPE_TO_RESULT = {
  correct: "correct",
  needs_next_subproblem: "correct",
  incorrect: "incorrect",
  off_topic: "incorrect",
  partial: "ambiguous",
  unclear: "ambiguous",
  student_inquiry: "ambiguous",
  continue: "ambiguous"
};

const ACTION_TO_DECISIONS = {
  confirm_and_advance: ["b1", "b2", "g2"],
  give_hint_1: ["a3", "d1"],
  give_hint_2: ["a3", "c1"],
  give_hint_3: ["a3", "c2"],
  corrective_feedback: ["a1", "a2"],
  give_solution: ["a2", "c2", "g1"],
  ask_subquestion: ["b2", "c3"],
  clarify_request: ["d1", "d2"],
  redirect: ["h"],
  motivate: ["b2"]
};

export async function runTutorPipeline(question, sessionId, { profile, askFn, models }) {
  // 1. Router Agent — fast intent classification
  const routerResult = await routerAgent(
    { message: question },
    { askFn, model: models.router, maxTokens: 120 }
  );

  if (routerResult.route === "off_topic" || routerResult.route === "chitchat") {
    return { isOffTopic: true, route: routerResult.route, routerResult };
  }

  // 2. Learner Model Agent — estimate student state from profile
  const learnerResult = await learnerModelAgent(
    { recentResponses: [], profile, retryCount: 0 },
    { askFn, model: models.tutor, maxTokens: 220 }
  );

  // 3. Scaffolding Planner Agent — decompose question into CLASS-style plan
  const plannerResult = await scaffoldingPlannerAgent(
    { question, learnerModel: learnerResult },
    { askFn, model: models.tutor, maxTokens: 900 }
  );

  // 4. Create TutorState
  const tutorState = createTutorState({
    sessionId,
    topic: plannerResult.learning_objective,
    learningObjective: plannerResult.learning_objective,
    mainProblem: plannerResult.main_problem,
    subproblems: plannerResult.subproblems,
    studentMasteryEstimate: learnerResult.mastery_estimate,
    frustrationRisk: learnerResult.frustration_risk
  });

  return {
    isOffTopic: false,
    tutorState,
    solution: tutorStateToSolution(tutorState),
    routerResult,
    learnerResult,
    plannerResult
  };
}

export async function runTurnPipeline(tutorState, { step, answer, retryCount = 0 }, { profile, askFn, models }) {
  // Reconstruct subproblem from step (step may come from existing solution.steps format)
  const currentSubproblem = tutorState.subproblems.find((sp) => sp.id === step.id) || {
    id: step.id,
    prompt: step.prompt || step.title || "",
    expected_answer: (step.acceptedAnswers || [])[0] || "",
    hint_ladder: step.hintLadder || [],
    common_misconceptions: step.misconceptions || []
  };

  // 1. Learner Model — lightweight update based on this answer
  const learnerResult = await learnerModelAgent(
    { recentResponses: [{ step: step.id, answer, result: null }], profile, currentSubproblem, retryCount },
    { askFn, model: models.tutor, maxTokens: 220 }
  );

  // 2. Pedagogical Decision Agent — choose next tutoring move
  const decision = await pedagogicalDecisionAgent(
    { studentMessage: answer, currentSubproblem, learnerModel: learnerResult, retryCount },
    { askFn, model: models.tutor, maxTokens: 180 }
  );

  // 3. Tutor Response Agent — generate visible student-facing message
  const responseResult = await tutorResponseAgent(
    { decision, currentSubproblem, learnerModel: learnerResult },
    { askFn, model: models.tutor, maxTokens: 220 }
  );

  // 4. Verification Agent — lightweight gate before showing response
  const verification = await verificationAgent(
    { candidateResponse: responseResult.response, decision, currentSubproblem },
    { askFn, model: models.function, maxTokens: 150 }
  );

  const finalMessage = responseResult.response;
  let result = TURN_TYPE_TO_RESULT[decision.student_turn_type] || "ambiguous";
  const decisions = ACTION_TO_DECISIONS[decision.pedagogical_action] || ["d1"];

  // When give_solution is chosen, treat it as "correct" to auto-advance
  if (decision.pedagogical_action === "give_solution") {
    result = "correct";
  }

  // Advance subproblem in TutorState if correct
  let updatedTutorState = {
    ...tutorState,
    student_turn_type: decision.student_turn_type,
    pedagogical_action: decision.pedagogical_action,
    student_mastery_estimate: learnerResult.mastery_estimate,
    frustration_risk: learnerResult.frustration_risk,
    final_response: finalMessage
  };

  if (result === "correct") {
    updatedTutorState = advanceSubproblem(updatedTutorState);
  }

  return {
    result,
    message: finalMessage,
    decisions,
    decision,
    learnerResult,
    verification,
    updatedTutorState
  };
}

export async function runProgressPipeline(tutorState, sessionEvents, { askFn, models }) {
  return progressAgent(
    { tutorState, sessionEvents },
    { askFn, model: models.function, maxTokens: 180 }
  );
}
