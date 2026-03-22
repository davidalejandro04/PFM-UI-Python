import { RAG_CONFIG } from "./config.mjs";

// Precomputed accent-stripping map for speed
const ACCENT_MAP = {
  "\u00e1": "a", "\u00e9": "e", "\u00ed": "i", "\u00f3": "o", "\u00fa": "u",
  "\u00fc": "u", "\u00f1": "n",
  "\u00c1": "a", "\u00c9": "e", "\u00cd": "i", "\u00d3": "o", "\u00da": "u",
  "\u00dc": "u", "\u00d1": "n"
};
const ACCENT_RE = /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1]/g;

/**
 * Spanish-aware tokenizer: lowercase, strip accents, split on non-alphanumeric.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const lower = text.toLowerCase().replace(ACCENT_RE, (ch) => ACCENT_MAP[ch] || ch);
  const tokens = lower.split(/[^a-z0-9]+/).filter(
    (t) => t.length > 1 && !RAG_CONFIG.stopwords.has(t)
  );
  return tokens;
}

/**
 * BM25-based inverted index for fast full-text retrieval.
 */
export class RAGIndex {
  constructor() {
    /** @type {Array<import("./schemas.mjs").Chunk>} */
    this._chunks = [];
    /** @type {Map<string, Array<{docIndex: number, tf: number}>>} */
    this._postings = new Map();
    /** @type {number[]} document lengths in tokens */
    this._docLengths = [];
    /** @type {number} average document length */
    this._avgDl = 0;
    /** @type {number} total documents */
    this._n = 0;
  }

  /**
   * Build the index from an array of chunks.
   * @param {Array<import("./schemas.mjs").Chunk>} chunks
   */
  build(chunks) {
    this._chunks = chunks;
    this._n = chunks.length;
    this._postings = new Map();
    this._docLengths = new Array(this._n);

    let totalLength = 0;

    for (let i = 0; i < this._n; i++) {
      const tokens = tokenize(chunks[i].text);
      this._docLengths[i] = tokens.length;
      totalLength += tokens.length;

      // Count term frequencies
      const tfMap = new Map();
      for (const token of tokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }

      // Add to postings
      for (const [term, tf] of tfMap) {
        let list = this._postings.get(term);
        if (!list) {
          list = [];
          this._postings.set(term, list);
        }
        list.push({ docIndex: i, tf });
      }
    }

    this._avgDl = this._n > 0 ? totalLength / this._n : 0;
  }

  /**
   * Search for the top-K most relevant chunks.
   * @param {string} query
   * @param {number} [topK]
   * @returns {Array<import("./schemas.mjs").SearchResult>}
   */
  search(query, topK = RAG_CONFIG.topK) {
    if (this._n === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const { k1, b } = RAG_CONFIG.bm25;
    const scores = new Float64Array(this._n);

    for (const term of queryTokens) {
      const postings = this._postings.get(term);
      if (!postings) continue;

      const df = postings.length;
      // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log((this._n - df + 0.5) / (df + 0.5) + 1);

      for (const { docIndex, tf } of postings) {
        const dl = this._docLengths[docIndex];
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / this._avgDl));
        scores[docIndex] += idf * tfNorm;
      }
    }

    // Find top-K using partial sort
    const results = [];
    for (let i = 0; i < this._n; i++) {
      if (scores[i] >= RAG_CONFIG.minScore) {
        results.push({ chunk: this._chunks[i], score: scores[i] });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
