import Foundation

struct DraftExercise: Codable, Equatable, Identifiable {
    let id: UUID
    var name: String
    var targetSets: Int?
    var targetReps: Int?
    var targetWeight: Double?
    var loggedSets: [LoggedSet]
    var pendingSet: PendingSet?
}

struct LoggedSet: Codable, Equatable, Identifiable {
    let id: UUID
    var weight: Double
    var reps: Int
    let loggedAt: Date
}

struct PendingSet: Codable, Equatable {
    var weight: Double
    var reps: Int
    // Flipped true by any user-driven mutation (stepper / tap-to-type). Gates
    // auto-commit on navigate / Finish. Untouched pendings are never persisted
    // as logged sets (no fabrication).
    var dirty: Bool
}
