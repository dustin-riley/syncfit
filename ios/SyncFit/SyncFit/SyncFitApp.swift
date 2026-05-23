import SwiftUI

@main
struct SyncFitApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .task {
                    // On first launch, opportunistically check HealthKit
                    // authorization status by attempting an empty request.
                    try? await session.requestHealthAuthorization()
                }
        }
    }
}
