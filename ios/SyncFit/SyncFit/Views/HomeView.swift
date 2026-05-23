import SwiftUI

struct HomeView: View {
    @EnvironmentObject var session: AppSession
    @State private var syncing = false
    @State private var error: String?

    private var lastSyncedText: String {
        guard let d = session.lastSyncedAt else { return "Never" }
        return DateFormatter.localizedString(from: d, dateStyle: .short, timeStyle: .short)
    }

    var body: some View {
        VStack(spacing: 24) {
            Text("SyncFit").font(.largeTitle).bold()
            VStack(spacing: 4) {
                Text("Last synced").foregroundStyle(.secondary)
                Text(lastSyncedText).font(.title3.monospaced())
            }
            Button(syncing ? "Syncing…" : "Sync now") {
                Task {
                    syncing = true; defer { syncing = false }
                    error = nil
                    do { try await session.syncNow() }
                    catch { self.error = "Sync failed. Try again." }
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(syncing)
            if let error { Text(error).foregroundStyle(.red) }
            Spacer()
            Button("Unpair this device", role: .destructive) {
                session.unpair()
            }
            .padding(.bottom)
        }
        .padding()
    }
}
