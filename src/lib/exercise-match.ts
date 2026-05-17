export function normalizeExerciseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function exerciseMatches(a: string, b: string): boolean {
  const x = normalizeExerciseName(a);
  const y = normalizeExerciseName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function findExerciseMatch<T>(
  target: string,
  items: T[],
  key: (t: T) => string
): T | undefined {
  const t = normalizeExerciseName(target);
  if (!t) return undefined;
  return (
    items.find((i) => normalizeExerciseName(key(i)) === t) ??
    items.find((i) => exerciseMatches(target, key(i)))
  );
}
