import SwiftUI

struct LiveWorkoutView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss

    @State private var addingExercise = false
    @State private var newExerciseName = ""
    @State private var showingFinish = false
    @State private var confirmingDiscard = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 8) {
                    if let draft = session.liveWorkoutStore.draft {
                        ForEach(Array(draft.exercises.enumerated()), id: \.element.id) { (i, ex) in
                            ExerciseCard(
                                exercise: ex,
                                state: cardState(forExerciseIndex: i, draft: draft),
                                onTap: { session.liveWorkoutStore.navigate(toExerciseIndex: i) },
                                onLogSet: { session.liveWorkoutStore.logPending(forExerciseIndex: i) },
                                onSetPendingWeight: { session.liveWorkoutStore.setPendingWeight($0, forExerciseIndex: i) },
                                onSetPendingReps: { session.liveWorkoutStore.setPendingReps($0, forExerciseIndex: i) },
                                onDelete: { session.liveWorkoutStore.removeExercise(at: i) },
                                onRename: { session.liveWorkoutStore.renameExercise(at: i, to: $0) }
                            )
                        }
                        Button {
                            newExerciseName = ""
                            addingExercise = true
                        } label: {
                            Label("Add exercise", systemImage: "plus.circle")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(DSColor.bg.ignoresSafeArea())
            .navigationTitle(session.liveWorkoutStore.draft?.title ?? "Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        session.dismissLiveWorkoutSheet()
                        dismiss()
                    } label: { Image(systemName: "chevron.down") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Discard workout", role: .destructive) { confirmingDiscard = true }
                    } label: { Image(systemName: "ellipsis") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Finish") { showingFinish = true }
                        .bold()
                        .disabled(!canFinish)
                }
            }
            .alert("Discard workout?", isPresented: $confirmingDiscard) {
                Button("Discard", role: .destructive) {
                    session.liveWorkoutStore.discard()
                    session.dismissLiveWorkoutSheet()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All logged sets will be lost.")
            }
            .sheet(isPresented: $addingExercise) {
                NavigationStack {
                    Form {
                        TextField("Exercise name", text: $newExerciseName)
                    }
                    .navigationTitle("Add exercise")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { addingExercise = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") {
                                session.liveWorkoutStore.addExercise(name: newExerciseName)
                                addingExercise = false
                            }
                            .disabled(newExerciseName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $showingFinish) {
                if let draft = session.liveWorkoutStore.draft {
                    let (payload, _) = draft.flattenForPost()
                    FinishWorkoutSheet(
                        initialTitle: draft.title,
                        exerciseCount: draft.exercises.count,
                        setCount: payload.count,
                        onSuccess: {
                            session.dismissLiveWorkoutSheet()
                            dismiss()
                        }
                    )
                    .environmentObject(session)
                }
            }
        }
    }

    private var canFinish: Bool {
        guard let draft = session.liveWorkoutStore.draft else { return false }
        let (payload, _) = draft.flattenForPost()
        return !payload.isEmpty
    }

    private func cardState(forExerciseIndex i: Int, draft: LiveWorkoutDraft) -> ExerciseCard.CardState {
        guard let current = draft.currentExerciseIndex else {
            // All planned exercises done; default the topmost unfinished
            // (which is none) to current → just mark everything done.
            return .done
        }
        if i < current { return .done }
        if i == current { return .current }
        return .upcoming
    }
}
