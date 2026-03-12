export const defaultProfile = {
  name: "",
  avatar: "tutor",
  grade: "5.º",
  dailyGoal: 20,
  focusArea: "Resolución de problemas",
  responseMode: "coach",
  onboardingCompleted: false,
  xp: 0,
  lessonsCompleted: 0,
  completed: [],
  activity: []
};

const XP_PER_LEVEL = 40;

function nowIso() {
  return new Date().toISOString();
}

export function migrateProfile(input = {}) {
  return {
    ...defaultProfile,
    ...input,
    completed: Array.isArray(input.completed) ? input.completed : [],
    activity: Array.isArray(input.activity) ? input.activity : []
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
    activity: []
  });
}

export function completedPairs(profile) {
  return new Set((profile.completed || []).map((item) => `${item.unit}::${item.title}`));
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
    dailyGoalProgress: dailyGoalProgress(current)
  };
}
