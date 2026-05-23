import SwiftUI
import UIKit

struct PermissionView: View {
    @EnvironmentObject var session: AppSession
    @State private var requesting = false
    @State private var error: String?
    @State private var openedSettings = false

    var body: some View {
        VStack(spacing: 24) {
            Text("SyncFit").font(.largeTitle).bold()
            Text("Share HRV, resting heart rate, and sleep with SyncFit to inform your readiness analysis.")
                .multilineTextAlignment(.center).padding(.horizontal)
            Button(requesting ? "Requesting…" : "Allow HealthKit access") {
                Task {
                    requesting = true; defer { requesting = false }
                    error = nil
                    do { try await session.requestHealthAuthorization() }
                    catch { self.error = error.localizedDescription }
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(requesting)

            if let error {
                VStack(spacing: 12) {
                    Text(error).foregroundStyle(.red).multilineTextAlignment(.center)
                    Text("If you tapped Don't Allow, open Settings → Health → Data Access & Devices → SyncFit and turn on the metrics there.")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding()
    }
}
