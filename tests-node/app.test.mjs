import assert from "node:assert/strict";

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
  trackConceptStudy
} from "../src/utils/profile.mjs";
import {
  completionRatio,
  firstUnseen,
  getLesson
} from "../src/utils/lessons.mjs";
import { wrapStageHtml } from "../src/utils/content.mjs";
import lessons from "../data/lessons.json" with { type: "json" };

function run() {
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

  console.log("Smoke checks passed.");
}

run();
