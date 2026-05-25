import Foundation

struct PostWorkoutSet: Codable, Equatable, Sendable {
    let exerciseName: String
    let weight: Double
    let reps: Int
}
