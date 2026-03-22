import { RAG_CONFIG } from "./config.mjs";

/**
 * Strip HTML tags and collapse whitespace to plain text.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chunks the lesson catalog into searchable text segments.
 * Each stage of each lesson becomes one chunk.
 *
 * @param {Array} units - Normalized units from loadLessonCatalogFromDirectory
 * @returns {Array<import("./schemas.mjs").Chunk>}
 */
export function chunkLessonCatalog(units) {
  const chunks = [];

  for (const unit of units) {
    const unitId = unit.id;
    const unitTitle = unit.unit || unit.title || "";

    for (const lesson of unit.lessons || []) {
      const lessonId = lesson.id;
      const lessonTitle = lesson.title || "";

      for (const stage of lesson.stages || []) {
        let text = stripHtml(stage.html);
        if (text.length > RAG_CONFIG.maxChunkLength) {
          text = text.slice(0, RAG_CONFIG.maxChunkLength);
        }

        if (!text) continue;

        chunks.push({
          id: `${unitId}/${lessonId}/${stage.id}`,
          text,
          metadata: {
            lessonId,
            unitId,
            stageId: stage.id,
            title: stage.title || "",
            unitTitle,
            lessonTitle,
            order: stage.order || 0
          }
        });
      }
    }
  }

  return chunks;
}
