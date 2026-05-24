import SwiftUI
import UIKit

struct PairingView: View {
    @EnvironmentObject var session: AppSession
    @State private var code = ""
    @State private var pairing = false
    @State private var error: String?

    // Crockford-style alphabet (matches `PAIRING_CODE_ALPHABET` in
    // src/lib/health-pairing.ts). Excludes 0/O/1/I/L for unambiguous
    // hand-transcription. The /api/devices/pair route also accepts
    // lowercase + whitespace and normalizes server-side, but we filter
    // strictly here so the user sees invalid keystrokes ignored instantly.
    private static let alphabet: Set<Character> = Set("23456789ABCDEFGHJKMNPQRSTUVWXYZ")
    private static let codeLength = 6

    var body: some View {
        VStack(spacing: 16) {
            Text("Pair iOS app").font(.title2).bold()
            Text("Open Devices in the SyncFit web app and generate a pairing code.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            TextField("------", text: $code)
                .keyboardType(.asciiCapable)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled(true)
                .multilineTextAlignment(.center)
                .font(.system(.title, design: .monospaced))
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .onChange(of: code) { _, new in
                    // Uppercase, then keep only chars in the Crockford alphabet,
                    // capped at the configured length.
                    code = String(
                        new.uppercased()
                           .filter { Self.alphabet.contains($0) }
                           .prefix(Self.codeLength)
                    )
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
            .disabled(code.count != Self.codeLength || pairing)
            if let error { Text(error).foregroundStyle(.red).multilineTextAlignment(.center) }
        }
        .padding()
    }
}
