import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: AppSession

    var body: some View {
        Group {
            if !session.healthAuthorized {
                PermissionView()
            } else if session.deviceToken == nil {
                PairingView()
            } else {
                signedIn
            }
        }
    }

    private var signedIn: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            LogView()
                .tabItem { Label("Log", systemImage: "plus.circle") }
        }
        .sheet(item: $session.liveDraft) { _ in
            LiveWorkoutView()
                .environmentObject(session)
                .interactiveDismissDisabled(false)
        }
        .onChange(of: session.liveDraft) { _, newValue in
            // Swipe-down dismiss nils the binding without calling our helper;
            // re-surface the in-progress draft as resumable so the Home banner
            // appears. Idempotent if Close/Finish/Discard already called it.
            if newValue == nil {
                session.dismissLiveWorkoutSheet()
            }
        }
    }
}
