export function resolveAgentModels(settings) {
  const fallback = settings.currentModel || "";
  return {
    router: settings.agentRouterModel || fallback,
    tutor: settings.agentTutorModel || fallback,
    function: settings.agentFunctionModel || fallback
  };
}

export const TOKEN_BUDGETS = {
  router: { maxTokens: 120 },
  learnerModel: { maxTokens: 220 },
  scaffoldingPlanner: { maxTokens: 900 },
  pedagogicalDecision: { maxTokens: 180 },
  tutorResponse: { maxTokens: 220 },
  verification: { maxTokens: 150 },
  progress: { maxTokens: 180 }
};
