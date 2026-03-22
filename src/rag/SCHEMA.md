# RAG Schemas

## Chunk

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID: `unitId/lessonId/stageId` |
| `text` | `string` | Plain text (HTML stripped, max 300 chars) |
| `metadata` | `ChunkMetadata` | See below |

## ChunkMetadata

| Field | Type | Description |
|-------|------|-------------|
| `lessonId` | `string` | Lesson identifier |
| `unitId` | `string` | Unit identifier |
| `stageId` | `string` | Stage identifier |
| `title` | `string` | Stage title |
| `unitTitle` | `string` | Unit title |
| `lessonTitle` | `string` | Lesson title |
| `order` | `number` | Stage order within lesson |

## IndexEntry

| Field | Type | Description |
|-------|------|-------------|
| `docIndex` | `number` | Index into chunks array |
| `tf` | `number` | Term frequency in document |

## SearchResult

| Field | Type | Description |
|-------|------|-------------|
| `chunk` | `Chunk` | The matched chunk |
| `score` | `number` | BM25 relevance score |

## RetrievalResult

| Field | Type | Description |
|-------|------|-------------|
| `context` | `string` | Formatted context for the LLM |
| `sources` | `Source[]` | Array of source references |

### Source

| Field | Type | Description |
|-------|------|-------------|
| `lessonTitle` | `string` | Lesson title |
| `unitTitle` | `string` | Unit title |
| `stageTitle` | `string` | Stage title |

## RAGConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `topK` | `number` | `2` | Max results returned |
| `minScore` | `number` | `0.15` | Minimum BM25 score threshold |
| `bm25.k1` | `number` | `1.2` | Term frequency saturation |
| `bm25.b` | `number` | `0.75` | Document length normalization |
| `maxChunkLength` | `number` | `300` | Max chars per chunk |
| `contextMaxTokens` | `number` | `100` | Hard token budget for LLM context |
| `stopwords` | `Set<string>` | *(30 common Spanish words)* | Excluded from indexing for speed |
