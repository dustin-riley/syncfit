// Normalizes for fuzzy comparison: folds accented Latin to base letters
// (NFKD + diacritic strip), lowercases, and collapses any other non-ascii /
// punctuation to spaces. v1 scope cut: non-Latin scripts (e.g. CJK) normalize
// to "" — unsupported by design; exercise names are expected ASCII/Latin.
export function normalizeExerciseName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
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
