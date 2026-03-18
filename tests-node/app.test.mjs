import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addPracticeXp,
  completedPairs,
  defaultProfile,
  hasStudiedConcept,
  knownConcepts,
  migrateProfile,
  profileSummary,
  recordLessonCompletion,
  setupProfile,
  trackConceptStudy,
  trackLessonFlashcards,
  trackStruggleSignal
} from "../src/utils/profile.mjs";
import {
  completionRatio,
  firstUnseen,
  getLesson
} from "../src/utils/lessons.mjs";
import {
  LESSON_CATALOG_SCHEMA_VERSION,
  loadLessonCatalogFromDirectory
} from "../src/utils/lesson-catalog.mjs";
import { wrapStageHtml } from "../src/utils/content.mjs";
import legacyLessons from "../data/lessons.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createDuplicateCatalogFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-catalog-"));
  const unitOneDir = path.join(tempDir, "units", "01-unit-one");
  const unitTwoDir = path.join(tempDir, "units", "02-unit-two");
  const lessonPayload = (unitId, lessonId, order) => ({
    schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
    id: lessonId,
    slug: lessonId,
    unitId,
    order,
    title: lessonId,
    description: "",
    metadata: {
      contentType: "lesson",
      coursework: "math-primary",
      lineIndex: 1,
      lessonIndex: order
    },
    formulas: [],
    assets: [],
    stages: [
      {
        id: "stage-01",
        order: 1,
        title: "Etapa 1",
        html: "<html><body><h1>Demo</h1></body></html>"
      }
    ]
  });

  await fs.mkdir(path.join(unitOneDir, "lessons"), { recursive: true });
  await fs.mkdir(path.join(unitTwoDir, "lessons"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "catalog.json"), JSON.stringify({
    schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
    units: [
      { id: "unit-one", order: 1, file: "./units/01-unit-one/unit.json" },
      { id: "unit-two", order: 2, file: "./units/02-unit-two/unit.json" }
    ]
  }, null, 2));
  await fs.writeFile(path.join(unitOneDir, "unit.json"), JSON.stringify({
    schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
    id: "unit-one",
    slug: "unit-one",
    title: "Unidad 1",
    metadata: {
      contentType: "numbers",
      coursework: "math-primary",
      lineIndex: 1
    },
    lessons: [
      { id: "lesson-one", order: 1, file: "./lessons/01-lesson-one.json" }
    ]
  }, null, 2));
  await fs.writeFile(path.join(unitTwoDir, "unit.json"), JSON.stringify({
    schemaVersion: LESSON_CATALOG_SCHEMA_VERSION,
    id: "unit-two",
    slug: "unit-two",
    title: "Unidad 2",
    metadata: {
      contentType: "geometry",
      coursework: "math-primary",
      lineIndex: 1
    },
    lessons: [
      { id: "lesson-two", order: 1, file: "./lessons/01-lesson-two.json" }
    ]
  }, null, 2));
  await fs.writeFile(path.join(unitOneDir, "lessons", "01-lesson-one.json"), JSON.stringify(lessonPayload("unit-one", "lesson-one", 1), null, 2));
  await fs.writeFile(path.join(unitTwoDir, "lessons", "01-lesson-two.json"), JSON.stringify(lessonPayload("unit-two", "lesson-two", 1), null, 2));

  return tempDir;
}

async function run() {
  const lessons = await loadLessonCatalogFromDirectory(path.join(__dirname, "..", "data", "lesson-catalog"));
  let profile = migrateProfile(defaultProfile);
  profile = setupProfile(profile, {
    name: "Ana",
    avatar: "tutor",
    grade: "5.o",
    dailyGoal: 20,
    focusArea: "Fracciones",
    responseMode: "steps"
  });
  profile = addPracticeXp(profile, 2);
  profile = recordLessonCompletion(profile, "Unidad", "Leccion", 5);

  const summary = profileSummary(profile);
  assert.equal(summary.displayName, "Ana");
  assert.equal(summary.xp, 7);
  assert.equal(summary.lessonsCompleted, 1);
  assert.ok(completedPairs(profile).has("Unidad::Leccion"));
  assert.deepEqual(profile.tutorSessions, []);
  assert.deepEqual(profile.struggleSignals, []);
  assert.deepEqual(profile.lessonFlashcards, []);

  profile = trackConceptStudy(profile, {
    topic: "Fracciones equivalentes",
    relatedTopics: ["Comparacion de fracciones"],
    status: "studying"
  });
  assert.ok(hasStudiedConcept(profile, "Fracciones equivalentes"));
  assert.ok(hasStudiedConcept(profile, "Comparacion de fracciones"));
  profile = trackConceptStudy(profile, {
    topic: "Fracciones equivalentes",
    status: "known"
  });
  assert.equal(knownConcepts(profile)[0].status, "known");

  profile = migrateProfile({
    ...profile,
    tutorSessions: [
      {
        id: "session-1",
        kind: "exercise",
        topic: "Ecuaciones",
        conceptTopic: "Ecuaciones lineales",
        events: [{ type: "step-attempt", result: "correct" }]
      }
    ]
  });
  assert.equal(profile.tutorSessions.length, 1);
  assert.equal(profile.tutorSessions[0].kind, "exercise");

  profile = trackStruggleSignal(profile, {
    conceptTopic: "Ecuaciones lineales",
    topic: "Ecuaciones",
    stepId: "step-1",
    stepTitle: "Identifica la variable",
    failures: 3
  });
  profile = trackStruggleSignal(profile, {
    conceptTopic: "Ecuaciones lineales",
    topic: "Ecuaciones",
    stepId: "step-1",
    stepTitle: "Identifica la variable",
    failures: 4
  });
  assert.equal(profile.struggleSignals.length, 1);
  assert.equal(profile.struggleSignals[0].failures, 4);
  assert.equal(profile.struggleSignals[0].occurrences, 2);

  profile = trackLessonFlashcards(profile, {
    unit: "Unidad",
    lessonTitle: "Leccion",
    theme: "Fracciones equivalentes",
    source: "lesson-text",
    title: "Ayuda sobre fracciones",
    cards: [
      { title: "Concepto general", body: "Una fraccion representa partes iguales." }
    ]
  });
  profile = trackLessonFlashcards(profile, {
    unit: "Unidad",
    lessonTitle: "Leccion",
    theme: "Fracciones equivalentes",
    source: "lesson-image",
    title: "Que es esto?",
    cards: [
      { title: "Ejemplo guiado", body: "Dos cuartos equivalen a una mitad." }
    ]
  });
  assert.equal(profile.lessonFlashcards.length, 1);
  assert.equal(profile.lessonFlashcards[0].entries.length, 2);

  assert.equal(lessons.length, legacyLessons.length);
  assert.equal(
    lessons.reduce((sum, unit) => sum + unit.lessons.length, 0),
    legacyLessons.reduce((sum, unit) => sum + unit.lessons.length, 0)
  );
  const ratio = completionRatio(lessons, new Set());
  assert.ok(ratio.total > 0);

  const suggestion = firstUnseen(lessons, new Set());
  assert.ok(suggestion);
  assert.ok(getLesson(lessons, suggestion.unit, suggestion.title));

  const html = wrapStageHtml(
    '<html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css"></head><body><h1>Hola</h1><script>alert(1)</script><p>$1+1=2$</p></body></html>',
    "Demo",
    1,
    3
  );
  assert.match(html, /..\/assets\/katex\/katex\.min\.css/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(html, /alert\(1\)/);

  const duplicateCatalogDir = await createDuplicateCatalogFixture();
  try {
    await assert.rejects(
      loadLessonCatalogFromDirectory(duplicateCatalogDir),
      /mismo coursework\/index/
    );
  } finally {
    await fs.rm(duplicateCatalogDir, { recursive: true, force: true });
  }

  console.log("Smoke checks passed.");
}

await run();
