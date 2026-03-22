/**
 * Augments a system prompt with RAG context.
 * @param {string} systemPrompt - Original system prompt
 * @param {string} ragContext   - Retrieved context string
 * @returns {string} Augmented system prompt
 */
export function augmentPromptWithContext(systemPrompt, ragContext) {
  if (!ragContext) return systemPrompt;

  return (
    systemPrompt +
    "\n\nRef:\n" + ragContext + "\n"
  );
}

/**
 * Builds a user message with RAG context prepended.
 * @param {string} question   - User's question
 * @param {string} ragContext - Retrieved context string
 * @returns {string} Augmented user message
 */
export function buildRAGUserPrompt(question, ragContext) {
  if (!ragContext) return question;

  return ragContext + "\n\n" + question;
}
