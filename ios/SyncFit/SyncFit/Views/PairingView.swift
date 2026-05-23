import SwiftUI
import UIKit

struct PairingView: View {
    @EnvironmentObject var session: AppSession
    @State private var code = ""
    @State private var pairing = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Pair iOS app").font(.title2).bold()
            Text("Open Devices in the SyncFit web app and generate a pairing code.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(.title, design: .monospaced))
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .onChange(of: code) { _, new in
                    // Keep only digits, max 6
                    code = String(new.filter(\.isNumber).prefix(6))
                }
            Button(pairing ? "Pairing…" : "Pair") {
                Task {
                    pairing = true; defer { pairing = false }
                    error = nil
                    do {
                        let device = UIDevice.current.name
                        try await session.pair(code: code, deviceName: device)
                    } catch APIClientError.badRequest {
                        self.error = "That code didn't work. Generate a new one in the web app."
                    } catch {
                        self.error = "Couldn't pair. Try again."
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(code.count != 6 || pairing)
            if let error { Text(error).foregroundStyle(.red).multilineTextAlignment(.center) }
        }
        .padding()
    }
}
