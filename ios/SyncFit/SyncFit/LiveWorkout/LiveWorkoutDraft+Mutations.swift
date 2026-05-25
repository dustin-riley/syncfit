import Foundation

extension LiveWorkoutDraft {

    // MARK: pending-set lifecycle

    mutating func preparePendingIfNeeded(forExerciseIndex i: Int) {
        guard exercises.indices.contains(i),
              exercises[i].pendingSet == nil else { return }
        let e = exercises[i]
        let pre: PendingSet
        if let last = e.loggedSets.last {
            pre = PendingSet(weight: last.weight, reps: last.reps, dirty: false)
        } else if e.targetSets != nil {
            // Planned exercise, first set: pre-fill from plan targets.
            pre = PendingSet(
                weight: e.targetWeight ?? 0,
                reps: e.targetReps ?? 0,
                dirty: false
            )
        } else {
            // Unplanned exercise: start from zeros, no fabrication.
            pre = PendingSet(weight: 0, reps: 0, dirty: false)
        }
        exercises[i].pendingSet = pre
    }

    mutating func setPendingWeight(_ w: Double, forExerciseIndex i: Int) {
        guard exercises.indices.contains(i) else { return }
        preparePendingIfNeeded(forExerciseIndex: i)
        exercises[i].pendingSet?.weight = w
        exercises[i].pendingSet?.dirty = true
    }

    mutating func setPendingReps(_ r: Int, forExerciseIndex i: Int) {
        guard exercises.indices.contains(i) else { return }
        preparePendingIfNeeded(forExerciseIndex: i)
        exercises[i].pendingSet?.reps = r
        exercises[i].pendingSet?.dirty = true
    }

    // Append current pending → loggedSets, reset pending pre-filled from the
    // just-logged values (dirty=false).
    mutating func promotePending(forExerciseIndex i: Int, now: Date = Date()) {
        guard exercises.indices.contains(i),
              let p = exercises[i].pendingSet else { return }
        let logged = LoggedSet(id: UUID(), weight: p.weight, reps: p.reps, loggedAt: now)
        exercises[i].loggedSets.append(logged)
        exercises[i].pendingSet = PendingSet(weight: p.weight, reps: p.reps, dirty: false)
    }

    // Promote only if dirty AND valid (reps >= 1). Dirty-but-invalid pendings
    // survive on the exercise so the user keeps any values they entered.
    mutating func autoCommitDirty(forExerciseIndex i: Int, now: Date = Date()) {
        guard exercises.indices.contains(i),
              let p = exercises[i].pendingSet,
              p.dirty, p.reps >= 1 else { return }
        promotePending(forExerciseIndex: i, now: now)
    }

    // MARK: structural — exercises

    mutating func addExercise(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        exercises.append(
            DraftExercise(
                id: UUID(), name: trimmed,
                targetSets: nil, targetReps: nil, targetWeight: nil,
                loggedSets: [], pendingSet: nil
            )
        )
    }

    mutating func removeExercise(at i: Int) {
        guard exercises.indices.contains(i) else { return }
        exercises.remove(at: i)
    }

    // SwiftUI's onMove semantics: `to` is the destination index in the array
    // AFTER the source has been removed. Forward `IndexSet`/destination as-is.
    mutating func moveExercise(from source: Int, to destination: Int) {
        guard exercises.indices.contains(source) else { return }
        exercises.move(fromOffsets: IndexSet(integer: source), toOffset: destination)
    }

    mutating func renameExercise(at i: Int, to newName: String) {
        guard exercises.indices.contains(i) else { return }
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        exercises[i].name = trimmed
    }

    // MARK: structural — logged sets

    mutating func editLoggedSet(exerciseIndex i: Int, setId: UUID, weight: Double, reps: Int) {
        guard exercises.indices.contains(i),
              let s = exercises[i].loggedSets.firstIndex(where: { $0.id == setId }) else { return }
        exercises[i].loggedSets[s].weight = weight
        exercises[i].loggedSets[s].reps = reps
    }
}
