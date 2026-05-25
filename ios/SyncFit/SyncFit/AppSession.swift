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

    // Drives sheet presentation in RootView when non-nil.
    @Published var liveDraft: LiveWorkoutDraft?
    // Survives across launches; signals "Resume workout" banner on Home.
    @Published private(set) var liveDraftAvailable: LiveWorkoutDraft?
    let liveWorkoutStore: LiveWorkoutStore

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
        appTz: TimeZone = Config.appTimeZone,
        liveWorkoutStore: LiveWorkoutStore? = nil
    ) {
        self.health = health
        self.pairing = pairing
        self.planCache = planCache
        self.appTz = appTz
        // Load the token first into a local so we can capture it in the closure
        // below before self is fully initialized (Swift two-phase init).
        let loadedToken = keychain.load()
        self.deviceToken = loadedToken
        self.lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        if let cached = planCache.load() {
            self.planWeek = cached.week
            self.planFetchedAt = cached.fetchedAt
        }
        // Live workout store: a default instance wires to the live APIClient
        // lazily (per-call) so it can pick up a freshly-paired token. Tests
        // inject their own.
        self.liveWorkoutStore = liveWorkoutStore ?? LiveWorkoutStore(
            postWorkout: { req in
                // Read keychain fresh on every call: handles first-pair (token
                // didn't exist at init), re-pair (init-captured token is stale),
                // and unpair-then-pair within one session — all without an
                // [weak self] capture that would hit two-phase init issues.
                guard let t = KeychainStore().load() else {
                    throw APIClientError.unauthorized
                }
                let api = APIClient(baseURL: Config.apiBaseURL, token: t)
                return try await api.postWorkout(req)
            }
        )
        // Restore on launch: if an in-progress draft exists on disk (and isn't
        // aged-out), surface it as available-to-resume. Does NOT auto-present
        // the sheet — the user taps Resume on Home (or Log tab).
        self.liveDraftAvailable = self.liveWorkoutStore.restoreFromDisk()
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
        liveDraft = nil
        liveDraftAvailable = nil
        liveWorkoutStore.discard()
    }

    // Clears auth credentials only — does NOT discard the live-workout draft.
    // Used by the 401 path in FinishWorkoutSheet so the user can re-pair and
    // resume the in-progress workout. Spec §5.5 / §6: "401 → clear keychain,
    // preserve local state, alert 'Pairing expired — re-pair this device'."
    func clearAuthOnly() {
        keychain.clear()
        deviceToken = nil
        planCache.clear()
        planWeek = nil
        planFetchedAt = nil
        planFetchStatus = .idle
    }

    func resumeLiveWorkout() {
        guard let d = liveDraftAvailable else { return }
        liveWorkoutStore.resume(d)
        liveDraft = liveWorkoutStore.draft
        liveDraftAvailable = nil
    }

    // Called by views after Start CTA (Home or Log tab).
    func presentLiveWorkoutSheet() {
        liveDraft = liveWorkoutStore.draft
    }

    // Called by sheet-dismiss handlers (Close or Finish/Discard).
    func dismissLiveWorkoutSheet() {
        liveDraft = nil
        // After dismiss, expose the (still in-progress) draft as resumable
        // so the Home banner appears.
        liveDraftAvailable = liveWorkoutStore.draft
    }

    func syncNow() async throws {
        guard let token = deviceToken else { return }
        let api = APIClient(baseURL: Config.apiBaseURL, token: token)
        let coord = SyncCoordinator(health: health, api: api, appTz: appTz)
        do {
            try await coord.run()
            lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        } catch APIClientError.unauthorized {
            keychain.clear()
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
            keychain.clear()
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
