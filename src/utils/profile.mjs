export const defaultProfile = {
  name: "",
  avatar: "tutor",
  grade: "5.o",
  dailyGoal: 20,
  focusArea: "Resolucion de problemas",
  responseMode: "coach",
  onboardingCompleted: false,
  xp: 0,
  lessonsCompleted: 0,
  completed: [],
  activity: [],
  conceptProgress: [],
  tutorSessions: [],
  struggleSignals: []
};

const XP_PER_LEVEL = 40;
const CONCEPT_STATUS_RANK = {
  introduced: 1,
  studying: 2,
  known: 3
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeTopicKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueTopics(values = []) {
  const seen = new Set();
  const topics = [];

  for (const value of values) {
    const topic = String(value || "").trim();
    if (!topic) continue;
    const key = normalizeTopicKey(topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
  }

  return topics;
}

function normalizeConceptEntry(input = {}) {
  const topic = String(input.topic || "").trim();
  const key = normalizeTopicKey(input.key || topic);
  if (!topic || !key) return null;

  const status = CONCEPT_STATUS_RANK[input.status] ? input.status : "introduced";

  return {
    key,
    topic,
    relatedTopics: uniqueTopics(input.relatedTopics),
    status,
    source: String(input.source || "study-card"),
    ts: input.ts || nowIso(),
    lastStudiedAt: input.lastStudiedAt || input.ts || nowIso(),
    masteredAt: status === "known" ? (input.masteredAt || nowIso()) : (input.masteredAt || null)
  };
}

function mergeConceptEntries(existing, incoming) {
  const currentRank = CONCEPT_STATUS_RANK[existing.status] || 0;
  const nextRank = CONCEPT_STATUS_RANK[incoming.status] || 0;
  const status = nextRank >= currentRank ? incoming.status : existing.status;

  return {
    ...existing,
    ...incoming,
    status,
    ts: existing.ts || incoming.ts || nowIso(),
    lastStudiedAt: incoming.lastStudiedAt || incoming.ts || nowIso(),
    masteredAt: status === "known"
      ? (incoming.masteredAt || existing.masteredAt || nowIso())
      : (existing.masteredAt || incoming.masteredAt || null),
    relatedTopics: uniqueTopics([...(existing.relatedTopics || []), ...(incoming.relatedTopics || [])])
  };
}

function normalizeStruggleSignal(input = {}) {
  const conceptTopic = String(input.conceptTopic || input.topic || "").trim();
  const stepId = String(input.stepId || "").trim();
  const stepTitle = String(input.stepTitle || "").trim();
  const keyBase = `${conceptTopic}::${stepId || stepTitle}`.trim();
  const key = normalizeTopicKey(keyBase);
  if (!conceptTopic || !key) return null;

  return {
    key,
    conceptTopic,
    topic: String(input.topic || conceptTopic).trim() || conceptTopic,
    stepId,
    stepTitle,
    sessionIds: uniqueTopics(input.sessionIds || []).filter(Boolean),
    failures: Math.max(1, Number(input.failures || input.attemptsAtDetection || 1)),
    occurrences: Math.max(1, Number(input.occurrences || 1)),
    status: String(input.status || "open").trim() || "open",
    ts: input.ts || nowIso(),
    lastDetectedAt: input.lastDetectedAt || input.ts || nowIso()
  };
}

function mergeStruggleSignals(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    sessionIds: uniqueTopics([...(existing.sessionIds || []), ...(incoming.sessionIds || [])]),
    failures: Math.max(Number(existing.failures || 0), Number(incoming.failures || 0)),
    occurrences: Math.max(1, Number(existing.occurrences || 1) + Number(incoming.occurrences || 1)),
    status: incoming.status || existing.status || "open",
    ts: existing.ts || incoming.ts || nowIso(),
    lastDetectedAt: incoming.lastDetectedAt || nowIso()
  };
}

export function migrateProfile(input = {}) {
  const conceptProgress = Array.isArray(input.conceptProgress)
    ? input.conceptProgress
        .map((item) => normalizeConceptEntry(item))
        .filter(Boolean)
    : [];
  const tutorSessions = Array.isArray(input.tutorSessions)
    ? input.tutorSessions.map((session) => ({
        id: String(session?.id || "").trim(),
        kind: String(session?.kind || "practice").trim(),
        topic: String(session?.topic || "").trim(),
        conceptTopic: String(session?.conceptTopic || "").trim(),
        source: String(session?.source || "").trim(),
        ts: session?.ts || nowIso(),
        status: String(session?.status || "active").trim(),
        hiddenTrace: Array.isArray(session?.hiddenTrace) ? session.hiddenTrace : [],
        visibleSteps: Array.isArray(session?.visibleSteps) ? session.visibleSteps : [],
        events: Array.isArray(session?.events) ? session.events : []
      }))
    : [];
  const struggleSignals = Array.isArray(input.struggleSignals)
    ? input.struggleSignals
        .map((signal) => normalizeStruggleSignal(signal))
        .filter(Boolean)
    : [];

  return {
    ...defaultProfile,
    ...input,
    completed: Array.isArray(input.completed) ? input.completed : [],
    activity: Array.isArray(input.activity) ? input.activity : [],
    conceptProgress,
    tutorSessions,
    struggleSignals
  };
}

export function setupProfile(profile, payload) {
  return migrateProfile({
    ...profile,
    name: payload.name.trim() || "Estudiante",
    avatar: payload.avatar,
    grade: payload.grade,
    dailyGoal: Number(payload.dailyGoal),
    focusArea: payload.focusArea,
    responseMode: payload.responseMode,
    onboardingCompleted: true
  });
}

export function addPracticeXp(profile, amount = 1) {
  const xp = Math.max(0, Number(amount));
  return migrateProfile({
    ...profile,
    xp: Number(profile.xp || 0) + xp,
    activity: [
      ...(profile.activity || []),
      { kind: "practice", xp, ts: nowIso() }
    ]
  });
}

export function recordLessonCompletion(profile, unit, title, xpGain = 5) {
  const exists = (profile.completed || []).some(
    (item) => item.unit === unit && item.title === title
  );
  if (exists) {
    return migrateProfile(profile);
  }

  const ts = nowIso();
  return migrateProfile({
    ...profile,
    xp: Number(profile.xp || 0) + xpGain,
    lessonsCompleted: Number(profile.lessonsCompleted || 0) + 1,
    completed: [...(profile.completed || []), { unit, title, ts }],
    activity: [...(profile.activity || []), { kind: "lesson", xp: xpGain, unit, title, ts }]
  });
}

export function resetProgress(profile) {
  return migrateProfile({
    ...profile,
    xp: 0,
    lessonsCompleted: 0,
    completed: [],
    activity: [],
    conceptProgress: [],
    tutorSessions: [],
    struggleSignals: []
  });
}

export function completedPairs(profile) {
  return new Set((profile.completed || []).map((item) => `${item.unit}::${item.title}`));
}

export function conceptProgress(profile) {
  return migrateProfile(profile).conceptProgress || [];
}

export function findConceptRecord(profile, topic) {
  const targetKey = normalizeTopicKey(topic);
  if (!targetKey) return null;

  return conceptProgress(profile).find((item) => {
    if (item.key === targetKey) return true;
    return (item.relatedTopics || []).some((relatedTopic) => normalizeTopicKey(relatedTopic) === targetKey);
  }) || null;
}

export function hasStudiedConcept(profile, topic) {
  return Boolean(findConceptRecord(profile, topic));
}

export function trackConceptStudy(profile, payload) {
  const nextEntry = normalizeConceptEntry(payload);
  if (!nextEntry) {
    return migrateProfile(profile);
  }

  const current = conceptProgress(profile);
  const index = current.findIndex((item) => item.key === nextEntry.key);
  const nextConcepts = [...current];

  if (index >= 0) {
    nextConcepts[index] = mergeConceptEntries(nextConcepts[index], nextEntry);
  } else {
    nextConcepts.push(nextEntry);
  }

  return migrateProfile({
    ...profile,
    conceptProgress: nextConcepts
  });
}

export function knownConcepts(profile) {
  return conceptProgress(profile)
    .filter((item) => item.status === "introduced" || item.status === "studying" || item.status === "known")
    .sort((left, right) => String(right.lastStudiedAt || right.ts || "").localeCompare(String(left.lastStudiedAt || left.ts || "")));
}

export function struggleSignals(profile) {
  return [...(migrateProfile(profile).struggleSignals || [])]
    .sort((left, right) => String(right.lastDetectedAt || right.ts || "").localeCompare(String(left.lastDetectedAt || left.ts || "")));
}

export function trackStruggleSignal(profile, payload) {
  const nextSignal = normalizeStruggleSignal(payload);
  if (!nextSignal) {
    return migrateProfile(profile);
  }

  const current = struggleSignals(profile);
  const index = current.findIndex((item) => item.key === nextSignal.key);
  const nextSignals = [...current];

  if (index >= 0) {
    nextSignals[index] = mergeStruggleSignals(nextSignals[index], nextSignal);
  } else {
    nextSignals.push(nextSignal);
  }

  return migrateProfile({
    ...profile,
    struggleSignals: nextSignals
  });
}

export function recentActivity(profile, limit = 6) {
  return [...(profile.activity || [])]
    .sort((left, right) => String(right.ts || "").localeCompare(String(left.ts || "")))
    .slice(0, limit);
}

export function streakDays(profile) {
  const days = new Set(
    (profile.activity || [])
      .map((item) => String(item.ts || "").slice(0, 10))
      .filter(Boolean)
  );

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function dailyGoalProgress(profile) {
  const today = new Date().toISOString().slice(0, 10);
  return Math.min(
    Number(profile.dailyGoal || 20),
    (profile.activity || [])
      .filter((item) => String(item.ts || "").startsWith(today))
      .reduce((sum, item) => sum + Number(item.xp || 0), 0)
  );
}

export function profileSummary(profile) {
  const current = migrateProfile(profile);
  return {
    ...current,
    displayName: current.name || "Estudiante",
    level: Math.max(1, Math.floor(Number(current.xp || 0) / XP_PER_LEVEL) + 1),
    xpToNextLevel: XP_PER_LEVEL - (Number(current.xp || 0) % XP_PER_LEVEL || 0),
    streakDays: streakDays(current),
    dailyGoalProgress: dailyGoalProgress(current),
    knownConcepts: knownConcepts(current).length,
    struggleSignals: struggleSignals(current).length
  };
}
