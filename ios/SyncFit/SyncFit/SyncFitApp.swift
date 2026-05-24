import SwiftUI

@main
struct SyncFitApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .task {
                    // Refresh HealthKit authorization on every scene launch.
                    // requestAuthorization is idempotent — Apple shows the
                    // system prompt only the first time; later calls return
                    // immediately and just update healthAuthorized.
                    try? await session.requestHealthAuthorization()
                }
        }
    }
}
