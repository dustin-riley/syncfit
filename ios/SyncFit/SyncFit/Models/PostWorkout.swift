import Foundation

struct PostWorkoutSet: Codable, Equatable, Sendable {
    let exerciseName: String
    let weight: Double
    let reps: Int
}

struct PostWorkoutRequest: Codable, Equatable, Sendable {
    let performedAt: Date
    let title: String
    let sets: [PostWorkoutSet]
}

struct PostWorkoutResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let added: Int
    let skipped: Int
    let error: String?
}
