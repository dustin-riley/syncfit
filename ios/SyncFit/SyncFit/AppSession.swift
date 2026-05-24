// ios/SyncFit/SyncFit/AppSession.swift
import Foundation
import SwiftUI

// Owns the user-visible state for the app: HealthKit auth status,
// device token presence, last-synced timestamp, and the weekly plan.
// Wires the views to the underlying clients.
@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var healthAuthorized: Bool = false
    @Published private(set) var deviceToken: String?
    @Published private(set) var lastSyncedAt: Date?

    @Published private(set) var planWeek: PlanWeek?
    @Published private(set) var planFetchedAt: Date?
    @Published private(set) var planFetchStatus: PlanFetchStatus = .idle

    enum PlanFetchStatus: Equatable {
        case idle
        case loading
        case ok
        case stale(reason: String)
        case failed(reason: String)
    }

    private let keychain = KeychainStore()
    private let planCache: PlanCache
    private let health: HealthKitReading
    private let pairing: PairingClient
    private let appTz: TimeZone

    init(
        health: HealthKitReading = HKHealthKitClient(),
        pairing: PairingClient = PairingClient(baseURL: Config.apiBaseURL),
        planCache: PlanCache = PlanCache(),
        appTz: TimeZone = Config.appTimeZone
    ) {
        self.health = health
        self.pairing = pairing
        self.planCache = planCache
        self.appTz = appTz
        self.deviceToken = keychain.load()
        self.lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        // Synchronous cache load so the first paint of HomeView shows the
        // last-known plan with no flash.
        if let cached = planCache.load() {
            self.planWeek = cached.week
            self.planFetchedAt = cached.fetchedAt
        }
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
        planCache.clear()
        planWeek = nil
        planFetchedAt = nil
        planFetchStatus = .idle
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

    // Fetches the latest plan. Non-throwing — all errors are folded into
    // planFetchStatus. The exception: 401 also clears deviceToken so
    // RootView bounces back to PairingView (matches syncNow behavior).
    func fetchPlan() async {
        guard let token = deviceToken else { return }
        planFetchStatus = .loading
        let api = APIClient(baseURL: Config.apiBaseURL, token: token)
        do {
            let week = try await api.getPlanWeek()
            let at = Date()
            planWeek = week
            planFetchedAt = at
            planFetchStatus = .ok
            planCache.save(week, fetchedAt: at)
        } catch APIClientError.unauthorized {
            planCache.clear()
            planWeek = nil
            planFetchedAt = nil
            planFetchStatus = .idle
            deviceToken = nil
        } catch {
            let reason = Self.reasonString(from: error)
            if planWeek != nil {
                planFetchStatus = .stale(reason: reason)
            } else {
                planFetchStatus = .failed(reason: reason)
            }
        }
    }

    private static func reasonString(from error: Error) -> String {
        switch error {
        case APIClientError.transport(let m): return "no connection (\(m))"
        case APIClientError.decoding(let m):  return "couldn't read response (\(m))"
        case APIClientError.server(let code): return "server \(code)"
        case APIClientError.badRequest:        return "bad request"
        default: return String(describing: error)
        }
    }
}
