import Foundation

// The single in-progress workout. Persisted as Documents/live-workout.json.
// Bump LiveWorkoutDraft.currentSchemaVersion any time the on-disk shape changes;
// persistence discards files with a mismatched version on load (no migrations
// for a single-row local cache — single in-progress slot, low cost to lose).
struct LiveWorkoutDraft: Codable, Equatable, Sendable, Identifiable {
    static let currentSchemaVersion: Int = 1

    let id: UUID
    let startedAt: Date
    var title: String
    var exercises: [DraftExercise]
    let schemaVersion: Int
}
