import SwiftUI

struct FinishWorkoutSheet: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let initialTitle: String
    let exerciseCount: Int
    let setCount: Int
    let onSuccess: () -> Void

    @State private var title: String = ""
    @State private var submitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Workout") {
                    TextField("Title", text: $title)
                }
                Section {
                    HStack {
                        Text("Exercises").foregroundStyle(DSColor.textMuted)
                        Spacer()
                        Text("\(exerciseCount)")
                    }
                    HStack {
                        Text("Sets").foregroundStyle(DSColor.textMuted)
                        Spacer()
                        Text("\(setCount)")
                    }
                }
                if let m = errorMessage {
                    Section { Text(m).foregroundStyle(.red).font(.system(size: 13)) }
                }
            }
            .navigationTitle("Finish workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(submitting ? "Saving…" : "Submit") {
                        submit()
                    }
                    .disabled(submitting || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { title = initialTitle }
        }
    }

    private func submit() {
        guard !submitting else { return }
        submitting = true
        errorMessage = nil
        session.liveWorkoutStore.setTitle(title)
        Task {
            let result = await session.liveWorkoutStore.finish()
            submitting = false
            switch result {
            case .success:
                onSuccess()
                dismiss()
            case .unauthorized:
                session.clearAuthOnly()
                errorMessage = "Pairing expired — re-pair this device."
            case .transport(let m):
                errorMessage = "Couldn't sync workout (\(m)). Try again."
            case .server(let code):
                errorMessage = "Server error \(code). Try again."
            case .decoding(let m):
                errorMessage = "Couldn't read server response (\(m))."
            case .empty:
                errorMessage = "No sets to submit."
            }
        }
    }
}
