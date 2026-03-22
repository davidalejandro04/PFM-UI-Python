/** RAG configuration constants — tuned for minimum latency. */
export const RAG_CONFIG = {
  topK: 2,                // fewer results = less context = faster LLM inference
  minScore: 0.15,         // aggressive filter to avoid weak matches
  bm25: { k1: 1.2, b: 0.75 },
  maxChunkLength: 300,    // shorter chunks = tighter context
  contextMaxTokens: 100,  // hard cap: ≤100 tokens of context sent to LLM
  stopwords: new Set([    // skip common Spanish words during indexing
    "de","la","el","en","y","los","las","del","un","una","es","que",
    "por","con","se","su","al","lo","para","como","son","no","mas",
    "hay","cada","este","esta","estos","estas","todo","toda","todos"
  ])
};
