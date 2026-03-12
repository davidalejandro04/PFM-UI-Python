export function completionRatio(lessons, completedSet) {
  const total = lessons.reduce((sum, unit) => sum + (unit.lessons || []).length, 0);
  const done = lessons.reduce(
    (sum, unit) =>
      sum +
      (unit.lessons || []).filter((lesson) =>
        completedSet.has(`${unit.unit}::${lesson.title}`)
      ).length,
    0
  );
  return { done, total };
}

export function unitProgress(lessons, unitName, completedSet) {
  const unit = lessons.find((item) => item.unit === unitName);
  const entries = unit?.lessons || [];
  return {
    done: entries.filter((lesson) => completedSet.has(`${unitName}::${lesson.title}`)).length,
    total: entries.length
  };
}

export function firstUnseen(lessons, completedSet) {
  for (const unit of lessons) {
    for (const lesson of unit.lessons || []) {
      const key = `${unit.unit}::${lesson.title}`;
      if (!completedSet.has(key)) {
        return { unit: unit.unit, title: lesson.title };
      }
    }
  }
  return null;
}

export function flattenLessons(lessons) {
  return lessons.flatMap((unit) =>
    (unit.lessons || []).map((lesson) => ({
      unit: unit.unit,
      title: lesson.title,
      description: lesson.description || "",
      stageCount: (lesson.stages || []).length
    }))
  );
}

export function getLesson(lessons, unitName, lessonTitle) {
  const unit = lessons.find((item) => item.unit === unitName);
  return (unit?.lessons || []).find((lesson) => lesson.title === lessonTitle) || null;
}
