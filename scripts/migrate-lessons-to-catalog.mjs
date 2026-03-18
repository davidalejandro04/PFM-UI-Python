import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import legacyLessons from "../data/lessons.json" with { type: "json" };
import {
  LESSON_CATALOG_SCHEMA_VERSION,
  extractAssetEntriesFromHtml,
  extractFormulaEntriesFromHtml,
  inferStageTitleFromHtml,
  slugifyCatalogId
} from "../src/utils/lesson-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "data", "lesson-catalog");

const UNIT_METADATA = {
  "Números y patrones — 3.º": {
    contentType: "number-sense",
    coursework: "mathematics-primary",
    lineIndex: 1,
    unitNumber: 1,
    gradeBands: ["3"],
    tags: ["numeros", "patrones", "calculo-mental"]
  },
  "Relaciones y expresiones — 5.º": {
    contentType: "algebraic-thinking",
    coursework: "mathematics-primary",
    lineIndex: 2,
    unitNumber: 2,
    gradeBands: ["5"],
    tags: ["relaciones", "expresiones", "tablas"]
  },
  "Fracciones en la vida diaria — 3.º y 5.º": {
    contentType: "fraction-reasoning",
    coursework: "mathematics-primary",
    lineIndex: 3,
    unitNumber: 3,
    gradeBands: ["3", "5"],
    tags: ["fracciones", "decimales", "porcentajes"]
  },
  "Datos y gráficas — 3.º y 5.º": {
    contentType: "data-literacy",
    coursework: "mathematics-primary",
    lineIndex: 4,
    unitNumber: 4,
    gradeBands: ["3", "5"],
    tags: ["datos", "graficas", "tablas"]
  },
  "Medición y estimación — 3.º y 5.º": {
    contentType: "measurement",
    coursework: "mathematics-primary",
    lineIndex: 5,
    unitNumber: 5,
    gradeBands: ["3", "5"],
    tags: ["medicion", "estimacion", "area", "perimetro"]
  },
  "Geometría 1 — Triángulos": {
    contentType: "geometry",
    coursework: "mathematics-extension",
    lineIndex: 1,
    unitNumber: 1,
    gradeBands: [],
    tags: ["geometria", "triangulos", "heron"]
  }
};

function titleSlug(value = "", index = 0) {
  const slug = slugifyCatalogId(value);
  return `${String(index).padStart(2, "0")}-${slug}`;
}

function lessonMetadata(unitMeta, lessonIndex) {
  return {
    contentType: "lesson",
    coursework: unitMeta.coursework,
    lineIndex: unitMeta.lineIndex,
    lessonIndex,
    gradeBands: [...(unitMeta.gradeBands || [])],
    sourceFormat: "legacy-lessons-json"
  };
}

function buildStage(stage, stageIndex) {
  const html = String(stage.html || "");
  return {
    id: `stage-${String(stageIndex).padStart(2, "0")}`,
    order: stageIndex,
    title: inferStageTitleFromHtml(html, `Etapa ${stageIndex}`),
    html,
    formulas: extractFormulaEntriesFromHtml(html),
    assets: extractAssetEntriesFromHtml(html)
  };
}

function rollupFormulas(stages = []) {
  const formulas = new Map();
  for (const stage of stages) {
    for (const entry of stage.formulas || []) {
      const key = `${entry.displayMode ? "display" : "inline"}::${entry.latex}`;
      if (formulas.has(key)) {
        const current = formulas.get(key);
        if (!current.stageIds.includes(stage.id)) {
          current.stageIds.push(stage.id);
        }
        continue;
      }
      formulas.set(key, {
        ...entry,
        stageIds: [stage.id]
      });
    }
  }
  return [...formulas.values()];
}

function rollupAssets(stages = []) {
  const assets = new Map();
  for (const stage of stages) {
    for (const entry of stage.assets || []) {
      const key = `${entry.kind}::${entry.source}::${entry.target}`;
      if (assets.has(key)) {
        const current = assets.get(key);
        if (!current.stageIds.includes(stage.id)) {
          current.stageIds.push(stage.id);
        }
        continue;
      }
      assets.set(key, {
        ...entry,
        stageIds: [stage.id]
      });
    }
  }
  return [...assets.values()];
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });

  const catalog = {
    schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
    title: "TutorMate lesson catalog",
    validation: {
      uniqueUnitSlotKey: ["metadata.coursework", "metadata.lineIndex"],
      uniqueLessonOrderWithinUnit: true
    },
    units: []
  };

  for (const [unitIndex, unit] of legacyLessons.entries()) {
    const unitMeta = UNIT_METADATA[unit.unit];
    if (!unitMeta) {
      throw new Error(`Falta metadata estructural para la unidad "${unit.unit}".`);
    }

    const unitId = `unit-${titleSlug(unit.unit, unitIndex + 1)}`;
    const unitDirName = titleSlug(unit.unit, unitMeta.lineIndex);
    const unitFile = `./units/${unitDirName}/unit.json`;
    const unitDir = path.join(OUTPUT_DIR, "units", unitDirName);
    const lessonsDir = path.join(unitDir, "lessons");
    const unitLessons = [];

    for (const [lessonIndex, lesson] of (unit.lessons || []).entries()) {
      const order = lessonIndex + 1;
      const lessonSlug = titleSlug(lesson.title, order);
      const lessonId = `lesson-${slugifyCatalogId(unit.unit)}-${lessonSlug}`;
      const lessonFileName = `${lessonSlug}.json`;
      const stages = (lesson.stages || []).map((stage, stageIndex) => buildStage(stage, stageIndex + 1));
      const formulas = rollupFormulas(stages);
      const assets = rollupAssets(stages);

      await writeJson(path.join(lessonsDir, lessonFileName), {
        schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
        id: lessonId,
        slug: lessonSlug,
        unitId,
        order,
        title: lesson.title,
        description: lesson.description || "",
        metadata: lessonMetadata(unitMeta, order),
        formulas,
        assets,
        stages
      });

      unitLessons.push({
        id: lessonId,
        order,
        file: `./lessons/${lessonFileName}`
      });
    }

    await writeJson(path.join(unitDir, "unit.json"), {
      schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
      id: unitId,
      slug: unitDirName,
      title: unit.unit,
      metadata: {
        ...unitMeta
      },
      lessons: unitLessons
    });

    catalog.units.push({
      id: unitId,
      order: unitIndex + 1,
      file: unitFile
    });
  }

  await writeJson(path.join(OUTPUT_DIR, "catalog.json"), catalog);
  console.log(`Lesson catalog generated at ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
