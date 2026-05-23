import SwiftUI

struct PermissionView: View {
    @EnvironmentObject var session: AppSession
    @State private var requesting = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 24) {
            Text("SyncFit").font(.largeTitle).bold()
            Text("Share HRV, resting heart rate, and sleep with SyncFit to inform your readiness analysis.")
                .multilineTextAlignment(.center).padding(.horizontal)
            Button(requesting ? "Requesting…" : "Allow HealthKit access") {
                Task {
                    requesting = true; defer { requesting = false }
                    do { try await session.requestHealthAuthorization() }
                    catch { self.error = error.localizedDescription }
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(requesting)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .padding()
    }
}
