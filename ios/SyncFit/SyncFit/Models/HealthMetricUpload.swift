import Foundation

// Matches the backend zod schema in src/app/api/health/sync/route.ts.
// Field names match the wire format exactly — JSONEncoder default key
// encoding leaves them camelCase.

enum HealthMetricType: String, Codable {
    case hrv
    case rhr
    case sleepDurationSeconds = "sleep_duration_seconds"
}

enum Freshness: String, Codable {
    case fresh
    case stale24h = "stale_24h"
    case stale48h = "stale_48h"
}

struct HealthMetricUpload: Codable, Equatable {
    let metricDate: String           // 'YYYY-MM-DD' in APP_TZ
    let type: HealthMetricType
    let value: Double
    let source: String               // free-form ladder step label
    let freshness: Freshness
    let recordedAt: Date             // ISO8601 on the wire
}

struct SyncRequest: Codable {
    let uploads: [HealthMetricUpload]
}

struct SyncResponse: Codable {
    let accepted: Int
    let updated: Int
}
