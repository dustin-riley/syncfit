import Foundation

struct PlanWeek: Codable, Equatable, Sendable {
    let days: [PlanDay]
}

struct PlanDay: Codable, Equatable, Sendable, Identifiable {
    let dayOfWeek: Int
    let title: String
    let notes: String
    let modality: String
    let exercises: [PlanExercise]

    // Identifiable so SwiftUI ForEach can key on dayOfWeek (0..6 is unique
    // in a ResolvedWeek; the server response is also 1-row-per-dow).
    var id: Int { dayOfWeek }
}

struct PlanExercise: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let targetSets: Int
    let targetReps: Int
    let targetWeight: Double
}
