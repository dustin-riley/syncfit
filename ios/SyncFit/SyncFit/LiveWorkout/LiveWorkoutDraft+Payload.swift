import Foundation

extension LiveWorkoutDraft {
    // Returns the flat `[PostWorkoutSet]` payload (in exercise order, then
    // per-exercise insertion order) AND the mutated draft after auto-committing
    // dirty+valid pendings. The caller (LiveWorkoutStore.finish) persists the
    // mutated draft to disk before the POST so that a crash mid-POST doesn't
    // lose the auto-committed sets.
    func flattenForPost(now: Date = Date()) -> (payload: [PostWorkoutSet], mutated: LiveWorkoutDraft) {
        var copy = self
        for i in copy.exercises.indices {
            copy.autoCommitDirty(forExerciseIndex: i, now: now)
        }
        var out: [PostWorkoutSet] = []
        for e in copy.exercises {
            for s in e.loggedSets {
                out.append(PostWorkoutSet(exerciseName: e.name, weight: s.weight, reps: s.reps))
            }
        }
        return (out, copy)
    }
}
