import Foundation
import SwiftUI

// Owns the user-visible state for the app: HealthKit auth status,
// device token presence, last-synced timestamp. Wires the views to
// the underlying clients.
@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var healthAuthorized: Bool = false
    @Published private(set) var deviceToken: String?
    @Published private(set) var lastSyncedAt: Date?

    private let keychain = KeychainStore()
    private let health: HealthKitReading
    private let pairing: PairingClient
    private let appTz: TimeZone

    init(
        health: HealthKitReading = HKHealthKitClient(),
        pairing: PairingClient = PairingClient(baseURL: Config.apiBaseURL),
        appTz: TimeZone = Config.appTimeZone
    ) {
        self.health = health
        self.pairing = pairing
        self.appTz = appTz
        self.deviceToken = keychain.load()
        self.lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
    }

    func requestHealthAuthorization() async throws {
        healthAuthorized = try await health.requestAuthorization()
    }

    func pair(code: String, deviceName: String) async throws {
        let token = try await pairing.pair(code: code, deviceName: deviceName)
        try keychain.save(token: token)
        deviceToken = token
    }

    func unpair() {
        keychain.clear()
        deviceToken = nil
    }

    func syncNow() async throws {
        guard let token = deviceToken else { return }
        let api = APIClient(baseURL: Config.apiBaseURL, token: token)
        let coord = SyncCoordinator(health: health, api: api, appTz: appTz)
        do {
            try await coord.run()
            lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        } catch APIClientError.unauthorized {
            deviceToken = nil
            throw APIClientError.unauthorized
        }
    }
}
