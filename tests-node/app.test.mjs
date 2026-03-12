import assert from "node:assert/strict";

import {
  addPracticeXp,
  completedPairs,
  defaultProfile,
  migrateProfile,
  profileSummary,
  recordLessonCompletion,
  setupProfile
} from "../src/utils/profile.mjs";
import {
  completionRatio,
  firstUnseen,
  getLesson
} from "../src/utils/lessons.mjs";
import { wrapStageHtml } from "../src/utils/content.mjs";
import {
  WEBLLM_CUSTOM_QWEN35_ID,
  buildWebLLMEngineConfig,
  getDefaultWebLLMModel,
  getWebLLMModelChoices,
  getWebLLMModelLabel
} from "../src/utils/inference.mjs";
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

  const choices = getWebLLMModelChoices();
  assert.ok(choices.some((choice) => choice.modelId === getDefaultWebLLMModel() && choice.builtIn));
  assert.ok(choices.some((choice) => choice.modelId === WEBLLM_CUSTOM_QWEN35_ID && choice.custom));
  assert.equal(getWebLLMModelLabel(WEBLLM_CUSTOM_QWEN35_ID), "Qwen3.5 / Custom MLC");

  const builtInConfig = buildWebLLMEngineConfig({
    currentModel: getDefaultWebLLMModel()
  });
  assert.equal(builtInConfig.ok, true);
  assert.equal(builtInConfig.selectedModel, getDefaultWebLLMModel());

  const missingCustomConfig = buildWebLLMEngineConfig({
    currentModel: WEBLLM_CUSTOM_QWEN35_ID,
    webllmCustomModelId: "Qwen3.5-1.7B-MLC"
  });
  assert.equal(missingCustomConfig.ok, false);

  const customConfig = buildWebLLMEngineConfig({
    currentModel: WEBLLM_CUSTOM_QWEN35_ID,
    webllmCustomModelId: "Qwen3.5-1.7B-MLC",
    webllmCustomModelUrl: "https://example.com/qwen3_5/",
    webllmCustomModelLibUrl: "https://example.com/qwen3_5/model_lib.wasm"
  });
  assert.equal(customConfig.ok, true);
  assert.equal(customConfig.selectedModel, "Qwen3.5-1.7B-MLC");
  assert.match(customConfig.signature, /Qwen3\.5-1\.7B-MLC/);

  console.log("Smoke checks passed.");
}

run();
