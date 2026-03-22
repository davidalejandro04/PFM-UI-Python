/**
 * @typedef {Object} ChunkMetadata
 * @property {string} lessonId
 * @property {string} unitId
 * @property {string} stageId
 * @property {string} title       - Stage title
 * @property {string} unitTitle
 * @property {string} lessonTitle
 * @property {number} order       - Stage order within lesson
 */

/**
 * @typedef {Object} Chunk
 * @property {string} id    - Unique chunk identifier (unitId/lessonId/stageId)
 * @property {string} text  - Plain text content (HTML stripped)
 * @property {ChunkMetadata} metadata
 */

/**
 * @typedef {Object} IndexEntry
 * @property {number} docIndex  - Index into chunks array
 * @property {number} tf        - Term frequency in this document
 */

/**
 * @typedef {Object} SearchResult
 * @property {Chunk}  chunk
 * @property {number} score - BM25 score
 */

/**
 * @typedef {Object} RetrievalResult
 * @property {string} context  - Formatted context string for LLM
 * @property {Array<{lessonTitle: string, unitTitle: string, stageTitle: string}>} sources
 */

/**
 * @typedef {Object} RAGConfig
 * @property {number} topK
 * @property {number} minScore
 * @property {{k1: number, b: number}} bm25
 * @property {number} maxChunkLength
 * @property {number} contextMaxTokens
 */

/**
 * Validates a chunk object has required fields.
 * @param {*} chunk
 * @returns {boolean}
 */
export function isValidChunk(chunk) {
  return (
    chunk != null &&
    typeof chunk.id === "string" && chunk.id.length > 0 &&
    typeof chunk.text === "string" &&
    chunk.metadata != null &&
    typeof chunk.metadata.lessonId === "string" &&
    typeof chunk.metadata.unitId === "string" &&
    typeof chunk.metadata.stageId === "string"
  );
}

/**
 * Validates a search result.
 * @param {*} result
 * @returns {boolean}
 */
export function isValidSearchResult(result) {
  return (
    result != null &&
    isValidChunk(result.chunk) &&
    typeof result.score === "number" &&
    result.score >= 0
  );
}

/**
 * Validates a retrieval result.
 * @param {*} result
 * @returns {boolean}
 */
export function isValidRetrievalResult(result) {
  return (
    result != null &&
    typeof result.context === "string" &&
    Array.isArray(result.sources)
  );
}
