import Foundation

// Orchestrates HealthKit fetch → MetricPicker → APIClient upload, and
// persists lastSyncedAt to UserDefaults on success. On 401, clears the
// Keychain so the next launch routes to PairingView.
final class SyncCoordinator {
    private let health: HealthKitReading
    private let api: APIClient
    private let appTz: TimeZone
    private let keychain: KeychainStore
    private let defaults: UserDefaults

    init(
        health: HealthKitReading,
        api: APIClient,
        appTz: TimeZone,
        keychain: KeychainStore = KeychainStore(),
        defaults: UserDefaults = .standard
    ) {
        self.health = health
        self.api = api
        self.appTz = appTz
        self.keychain = keychain
        self.defaults = defaults
    }

    func run(now: Date = Date()) async throws {
        let samples = try await health.fetchSamples(endingAt: now)
        let todayDate = MetricPicker.dateString(for: now, in: appTz)
        let yesterdayDate: String = {
            var cal = Calendar(identifier: .gregorian); cal.timeZone = appTz
            let y = cal.date(byAdding: .day, value: -1, to: now)!
            return MetricPicker.dateString(for: y, in: appTz)
        }()

        let today = MetricPicker.pickToday(samples: samples, now: now, appTz: appTz)
        let yesterday = MetricPicker.pickYesterday(samples: samples, now: now, appTz: appTz)

        var uploads: [HealthMetricUpload] = []
        uploads.append(contentsOf: encode(picked: today, date: todayDate))
        uploads.append(contentsOf: encode(picked: yesterday, date: yesterdayDate))

        // Always call the server even when uploads is empty: a 401 means the
        // token was revoked and the Keychain must be cleared regardless of
        // whether there's data to ship.
        do {
            _ = try await api.healthSync(uploads: uploads)
            defaults.set(now, forKey: "lastSyncedAt")
        } catch APIClientError.unauthorized {
            keychain.clear()
            throw APIClientError.unauthorized
        }
    }

    private func encode(picked: MetricPicker.PickedDay, date: String) -> [HealthMetricUpload] {
        var out: [HealthMetricUpload] = []
        if let p = picked.hrv {
            out.append(.init(metricDate: date, type: .hrv, value: p.value,
                             source: p.source, freshness: p.freshness, recordedAt: p.recordedAt))
        }
        if let p = picked.rhr {
            out.append(.init(metricDate: date, type: .rhr, value: p.value,
                             source: p.source, freshness: p.freshness, recordedAt: p.recordedAt))
        }
        if let p = picked.sleep {
            out.append(.init(metricDate: date, type: .sleepDurationSeconds, value: p.value,
                             source: p.source, freshness: p.freshness, recordedAt: p.recordedAt))
        }
        return out
    }
}
