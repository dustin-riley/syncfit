import Foundation

extension LiveWorkoutDraft {
    static func startFromPlan(planDay: PlanDay, now: Date = Date()) -> LiveWorkoutDraft {
        let title = planDay.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return LiveWorkoutDraft(
            id: UUID(),
            startedAt: now,
            title: title.isEmpty ? "Workout" : title,
            exercises: planDay.exercises.map { p in
                DraftExercise(
                    id: UUID(),
                    name: p.name,
                    targetSets: p.targetSets,
                    targetReps: p.targetReps,
                    targetWeight: p.targetWeight,
                    loggedSets: [],
                    pendingSet: nil
                )
            },
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }

    static func startBlank(now: Date = Date()) -> LiveWorkoutDraft {
        LiveWorkoutDraft(
            id: UUID(),
            startedAt: now,
            title: "Workout",
            exercises: [],
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }
}
