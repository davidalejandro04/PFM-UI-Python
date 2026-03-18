import fs from "node:fs/promises";
import path from "node:path";

export const LESSON_CATALOG_SCHEMA_VERSION = 1;

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function slugifyCatalogId(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueBy(items = [], keyBuilder = (item) => item) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const key = keyBuilder(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}

function stripScripts(html = "") {
  return String(html || "").replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

function stripTags(html = "") {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferStageTitleFromHtml(html = "", fallback = "Etapa") {
  const cleanHtml = String(html || "");
  const titleMatch = cleanHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return stripTags(titleMatch[1]) || fallback;
  }

  const headingMatch = cleanHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (headingMatch?.[1]) {
    return stripTags(headingMatch[1]) || fallback;
  }

  return fallback;
}

function createFormulaEntry(latex = "", displayMode = false) {
  return {
    latex: String(latex || "").trim(),
    displayMode: Boolean(displayMode)
  };
}

export function extractFormulaEntriesFromHtml(html = "") {
  const source = stripScripts(html);
  const formulas = [];

  for (const match of source.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    formulas.push(createFormulaEntry(match[1], true));
  }
  for (const match of source.matchAll(/\\\[([\s\S]+?)\\\]/g)) {
    formulas.push(createFormulaEntry(match[1], true));
  }
  for (const match of source.matchAll(/\\\(([\s\S]+?)\\\)/g)) {
    formulas.push(createFormulaEntry(match[1], false));
  }
  for (const match of source.matchAll(/(?<!\$)\$([^\$]+?)\$(?!\$)/g)) {
    formulas.push(createFormulaEntry(match[1], false));
  }

  return uniqueBy(
    formulas.filter((entry) => entry.latex),
    (entry) => `${entry.displayMode ? "display" : "inline"}::${entry.latex}`
  );
}

export function extractAssetEntriesFromHtml(html = "") {
  const source = String(html || "");
  const assets = [];

  for (const match of source.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    assets.push({
      kind: "stylesheet",
      source: "external",
      target: match[1]
    });
  }
  for (const match of source.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)) {
    assets.push({
      kind: "script",
      source: "external",
      target: match[1]
    });
  }
  if (/<svg\b/i.test(source)) {
    assets.push({
      kind: "svg",
      source: "inline",
      target: "inline-svg"
    });
  }

  return uniqueBy(
    assets,
    (entry) => `${entry.kind}::${entry.source}::${entry.target}`
  );
}

function rollupEntries(stages = [], field) {
  const entries = [];
  for (const stage of stages) {
    for (const item of stage[field] || []) {
      const key = field === "formulas"
        ? `${item.displayMode ? "display" : "inline"}::${item.latex}`
        : `${item.kind}::${item.source}::${item.target}`;
      const existing = entries.find((entry) => entry.key === key);
      if (existing) {
        if (!existing.stageIds.includes(stage.id)) {
          existing.stageIds.push(stage.id);
        }
        continue;
      }
      entries.push({
        ...item,
        stageIds: [stage.id],
        key
      });
    }
  }

  return entries.map(({ key, ...item }) => item);
}

function mergeFormulaEntries(entries = [], validStageIds = new Set()) {
  const merged = new Map();
  for (const entry of entries) {
    const latex = String(entry?.latex || "").trim();
    if (!latex) continue;
    const displayMode = Boolean(entry?.displayMode);
    const stageIds = uniqueBy(
      (Array.isArray(entry?.stageIds) ? entry.stageIds : [])
        .map((stageId) => String(stageId || "").trim())
        .filter((stageId) => stageId && (!validStageIds.size || validStageIds.has(stageId)))
    );
    const key = `${displayMode ? "display" : "inline"}::${latex}`;
    if (merged.has(key)) {
      const current = merged.get(key);
      current.stageIds = uniqueBy([...(current.stageIds || []), ...stageIds]);
      continue;
    }
    merged.set(key, { latex, displayMode, stageIds });
  }
  return [...merged.values()];
}

function mergeAssetEntries(entries = [], validStageIds = new Set()) {
  const merged = new Map();
  for (const entry of entries) {
    const kind = String(entry?.kind || "asset").trim();
    const source = String(entry?.source || "external").trim();
    const target = String(entry?.target || "").trim();
    if (!target) continue;
    const stageIds = uniqueBy(
      (Array.isArray(entry?.stageIds) ? entry.stageIds : [])
        .map((stageId) => String(stageId || "").trim())
        .filter((stageId) => stageId && (!validStageIds.size || validStageIds.has(stageId)))
    );
    const key = `${kind}::${source}::${target}`;
    if (merged.has(key)) {
      const current = merged.get(key);
      current.stageIds = uniqueBy([...(current.stageIds || []), ...stageIds]);
      continue;
    }
    merged.set(key, { kind, source, target, stageIds });
  }
  return [...merged.values()];
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function resolveRelativeJson(baseFile, relativeFile) {
  return path.resolve(path.dirname(baseFile), relativeFile);
}

function normalizeStage(stage = {}, index = 0) {
  const html = String(stage.html || "").trim();
  ensure(html, `La etapa ${index + 1} no tiene contenido html.`);

  return {
    id: String(stage.id || `stage-${String(index + 1).padStart(2, "0")}`).trim(),
    order: Number(stage.order || index + 1),
    title: String(stage.title || inferStageTitleFromHtml(html, `Etapa ${index + 1}`)).trim(),
    html,
    formulas: Array.isArray(stage.formulas) && stage.formulas.length
      ? stage.formulas.map((entry) => createFormulaEntry(entry.latex, entry.displayMode))
      : extractFormulaEntriesFromHtml(html),
    assets: Array.isArray(stage.assets) && stage.assets.length
      ? stage.assets.map((entry) => ({
          kind: String(entry.kind || "asset"),
          source: String(entry.source || "external"),
          target: String(entry.target || "")
        }))
      : extractAssetEntriesFromHtml(html)
  };
}

function normalizeLesson(unit, lesson = {}) {
  ensure(lesson.unitId === unit.id, `La leccion ${lesson.id || lesson.title || "sin-id"} no pertenece a la unidad ${unit.id}.`);
  ensure(Array.isArray(lesson.stages) && lesson.stages.length, `La leccion ${lesson.id || lesson.title || "sin-id"} no tiene etapas.`);

  const stageIds = new Set();
  const stages = lesson.stages.map((stage, index) => {
    const normalizedStage = normalizeStage(stage, index);
    ensure(!stageIds.has(normalizedStage.id), `La leccion ${lesson.id || lesson.title || "sin-id"} repite la etapa ${normalizedStage.id}.`);
    stageIds.add(normalizedStage.id);
    return normalizedStage;
  });
  const validStageIds = new Set(stages.map((stage) => stage.id));

  return {
    id: String(lesson.id || "").trim(),
    slug: String(lesson.slug || slugifyCatalogId(lesson.title)).trim(),
    title: String(lesson.title || "").trim(),
    description: String(lesson.description || "").trim(),
    order: Number(lesson.order || 0),
    metadata: {
      ...(lesson.metadata || {})
    },
    formulas: Array.isArray(lesson.formulas) && lesson.formulas.length
      ? mergeFormulaEntries(lesson.formulas, validStageIds)
      : rollupEntries(stages, "formulas"),
    assets: Array.isArray(lesson.assets) && lesson.assets.length
      ? mergeAssetEntries(lesson.assets, validStageIds)
      : rollupEntries(stages, "assets"),
    stages
  };
}

function normalizeUnit(unit = {}, lessons = []) {
  ensure(String(unit.id || "").trim(), "Cada unidad debe tener un id.");
  ensure(String(unit.title || "").trim(), `La unidad ${unit.id || "sin-id"} no tiene titulo.`);
  ensure(Array.isArray(lessons), `La unidad ${unit.id || "sin-id"} no contiene lecciones normalizadas.`);

  const metadata = {
    ...(unit.metadata || {})
  };
  ensure(String(metadata.contentType || "").trim(), `La unidad ${unit.id} no tiene metadata.contentType.`);
  ensure(String(metadata.coursework || "").trim(), `La unidad ${unit.id} no tiene metadata.coursework.`);
  ensure(Number.isInteger(Number(metadata.lineIndex)) && Number(metadata.lineIndex) > 0, `La unidad ${unit.id} no tiene un lineIndex valido.`);

  return {
    id: String(unit.id).trim(),
    slug: String(unit.slug || slugifyCatalogId(unit.title)).trim(),
    unit: String(unit.title).trim(),
    metadata: {
      ...metadata,
      lineIndex: Number(metadata.lineIndex)
    },
    lessons
  };
}

export async function loadLessonCatalogFromDirectory(rootDir) {
  const catalogPath = path.join(rootDir, "catalog.json");
  const catalog = await readJson(catalogPath);
  ensure(catalog.schemaVersion === LESSON_CATALOG_SCHEMA_VERSION, `Version de catalogo no soportada en ${catalogPath}.`);
  ensure(Array.isArray(catalog.units) && catalog.units.length, `El catalogo ${catalogPath} no define unidades.`);

  const seenUnitIds = new Set();
  const occupiedCourseworkSlots = new Map();
  const normalizedUnits = [];

  for (const unitRef of catalog.units) {
    const unitPath = path.resolve(rootDir, unitRef.file);
    const unitData = await readJson(unitPath);
    ensure(unitData.schemaVersion === LESSON_CATALOG_SCHEMA_VERSION, `Version de unidad no soportada en ${unitPath}.`);
    ensure(unitData.id === unitRef.id, `El id de ${unitPath} no coincide con el catalogo.`);
    ensure(!seenUnitIds.has(unitData.id), `La unidad ${unitData.id} esta repetida en el catalogo.`);
    seenUnitIds.add(unitData.id);

    const lessonRefs = Array.isArray(unitData.lessons) ? unitData.lessons : [];
    const seenLessonOrders = new Set();
    const seenLessonIds = new Set();
    const lessons = [];

    for (const lessonRef of lessonRefs) {
      ensure(Number.isInteger(Number(lessonRef.order)) && Number(lessonRef.order) > 0, `La unidad ${unitData.id} contiene una leccion sin order valido.`);
      ensure(!seenLessonOrders.has(Number(lessonRef.order)), `La unidad ${unitData.id} repite el lesson order ${lessonRef.order}.`);
      seenLessonOrders.add(Number(lessonRef.order));

      const lessonPath = resolveRelativeJson(unitPath, lessonRef.file);
      const lessonData = await readJson(lessonPath);
      ensure(lessonData.schemaVersion === LESSON_CATALOG_SCHEMA_VERSION, `Version de leccion no soportada en ${lessonPath}.`);
      ensure(lessonData.id === lessonRef.id, `El id de ${lessonPath} no coincide con la unidad ${unitData.id}.`);
      ensure(!seenLessonIds.has(lessonData.id), `La unidad ${unitData.id} repite la leccion ${lessonData.id}.`);
      seenLessonIds.add(lessonData.id);
      ensure(Number(lessonData.order) === Number(lessonRef.order), `La leccion ${lessonData.id} no coincide con el indice ${lessonRef.order} declarado en la unidad ${unitData.id}.`);

      lessons.push(normalizeLesson(unitData, lessonData));
    }

    lessons.sort((left, right) => left.order - right.order);
    const normalizedUnit = normalizeUnit(unitData, lessons);
    const slotKey = `${normalizedUnit.metadata.coursework}::${normalizedUnit.metadata.lineIndex}`;
    if (occupiedCourseworkSlots.has(slotKey)) {
      throw new Error(
        `Las unidades ${occupiedCourseworkSlots.get(slotKey)} y ${normalizedUnit.id} ocupan el mismo coursework/index (${slotKey}).`
      );
    }
    occupiedCourseworkSlots.set(slotKey, normalizedUnit.id);
    normalizedUnits.push(normalizedUnit);
  }

  return normalizedUnits;
}
