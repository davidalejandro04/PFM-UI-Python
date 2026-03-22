import { RAG_CONFIG } from "./config.mjs";

/**
 * High-level retrieval: combines search results into a context string for the LLM.
 */
export class Retriever {
  /**
   * @param {import("./indexer.mjs").RAGIndex} ragIndex
   */
  constructor(ragIndex) {
    this._index = ragIndex;
  }

  /**
   * Retrieve relevant context for a query.
   * @param {string} query
   * @param {number} [topK]
   * @returns {import("./schemas.mjs").RetrievalResult}
   */
  retrieve(query, topK = RAG_CONFIG.topK) {
    const results = this._index.search(query, topK);

    if (results.length === 0) {
      return { context: "", sources: [] };
    }

    const sources = [];
    const blocks = [];
    let approxTokens = 0;

    for (const { chunk } of results) {
      const m = chunk.metadata;
      // Rough token estimate: chars / 4
      const estimatedTokens = Math.ceil(chunk.text.length / 4);
      if (approxTokens + estimatedTokens > RAG_CONFIG.contextMaxTokens && blocks.length > 0) {
        break;
      }
      approxTokens += estimatedTokens;

      blocks.push(`[${m.lessonTitle}] ${chunk.text}`);
      sources.push({
        lessonTitle: m.lessonTitle,
        unitTitle: m.unitTitle,
        stageTitle: m.title
      });
    }

    const context = blocks.join("\n");
    return { context, sources };
  }
}
