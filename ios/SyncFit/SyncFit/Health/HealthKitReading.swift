import Foundation

// Minimal value-typed view of a HealthKit sample, decoupled from
// HealthKit's `HKSample` so MetricPicker stays testable without
// importing HealthKit in tests.
struct HealthSample: Equatable {
    enum Kind: Equatable {
        case hrv          // ms (SDNN)
        case rhr          // bpm
        case asleep       // a sleep "asleep*" segment; value = duration seconds
        case workout      // an HKWorkout; value unused; start/end are workout times
    }
    let kind: Kind
    let value: Double
    let start: Date
    let end: Date
    // Sleep segments use end; HRV/RHR use the sample's endDate too. Treat
    // `end` as the canonical timestamp for "when was this measured".
}

protocol HealthKitReading {
    // Fetches the trailing-72h window of relevant samples (HRV + RHR +
    // sleep segments + workouts). 72h (not 48h) is required so that the
    // picker's yesterday-anchored stale-48h fallback (per spec §7B-2)
    // sees the full [yesterday-48h, yesterday] range. Implementations
    // decide how to range-query each type internally.
    func fetchSamples(endingAt now: Date) async throws -> [HealthSample]

    // Requests read authorization. Idempotent — safe to call multiple
    // times. Returns true if all three types have been authorized.
    func requestAuthorization() async throws -> Bool
}
