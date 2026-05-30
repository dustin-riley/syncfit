import SwiftUI

// Three variants (done / current / upcoming) per layout C in the spec.
struct ExerciseCard: View {
    // Named CardState to avoid shadowing SwiftUI's @State property wrapper.
    enum CardState { case done, current, upcoming }

    let exercise: DraftExercise
    let state: CardState
    let onTap: () -> Void                  // tap-to-make-current (upcoming or re-expand done)
    let onLogSet: () -> Void
    let onSetPendingWeight: (Double) -> Void
    let onSetPendingReps: (Int) -> Void
    let onDelete: () -> Void
    let onRename: (String) -> Void

    @State private var renaming = false
    @State private var renameText = ""

    var body: some View {
        switch state {
        case .done:    doneRow
        case .current: currentExpanded
        case .upcoming: upcomingPreview
        }
    }

    private var doneRow: some View {
        Button(action: onTap) {
            HStack {
                Text("✓ \(exercise.name)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DSColor.textMuted)
                Spacer()
                Text(doneSummary)
                    .font(.system(size: 10))
                    .foregroundStyle(DSColor.textMuted)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: DSRadius.md).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: DSRadius.md).stroke(DSColor.border))
            .opacity(0.7)
        }
        .buttonStyle(.plain)
    }

    // "✓ Name · N sets · top-set weight × reps" (per spec 5.3 Done card).
    private var doneSummary: String {
        let n = exercise.loggedSets.count
        guard let top = exercise.loggedSets.max(by: { $0.weight < $1.weight }) else {
            return "\(n) sets"
        }
        let w = top.weight == 0 ? "BW"
            : (top.weight.truncatingRemainder(dividingBy: 1) == 0
               ? String(format: "%.0f", top.weight)
               : String(format: "%.1f", top.weight))
        return "\(n) sets · \(w) × \(top.reps)"
    }

    private var upcomingPreview: some View {
        Button(action: onTap) {
            HStack {
                Text(exercise.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DSColor.text)
                Spacer()
                if let s = exercise.targetSets, let r = exercise.targetReps {
                    let w = exercise.targetWeight ?? 0
                    let weightStr = w == 0 ? "BW" : (w.truncatingRemainder(dividingBy: 1) == 0
                                                    ? String(format: "%.0f", w)
                                                    : String(format: "%.1f", w))
                    Text("\(s) × \(r) · \(weightStr)")
                        .font(.system(size: 10))
                        .foregroundStyle(DSColor.textMuted)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: DSRadius.md).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: DSRadius.md).stroke(DSColor.border))
        }
        .buttonStyle(.plain)
    }

    private var currentExpanded: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if renaming {
                    TextField(exercise.name, text: $renameText)
                        .font(.system(size: 14, weight: .bold))
                        .onSubmit {
                            onRename(renameText)
                            renaming = false
                        }
                } else {
                    Text(exercise.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(DSColor.text)
                        .onTapGesture {
                            renameText = exercise.name
                            renaming = true
                        }
                }
                Spacer()
                Menu {
                    Button("Rename") { renameText = exercise.name; renaming = true }
                    Button("Delete", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(DSColor.textMuted)
                }
            }
            if let s = exercise.targetSets, let r = exercise.targetReps {
                Text("Target: \(s) × \(r) · \(targetWeightStr)")
                    .font(.system(size: 10))
                    .foregroundStyle(DSColor.textMuted)
            }
            ForEach(Array(exercise.loggedSets.enumerated()), id: \.element.id) { (i, s) in
                loggedRow(setNumber: i + 1, set: s)
            }
            ActiveSetEntry(
                setNumber: exercise.loggedSets.count + 1,
                pendingWeight: exercise.pendingSet?.weight ?? exercise.targetWeight ?? 0,
                pendingReps: exercise.pendingSet?.reps ?? exercise.targetReps ?? 0,
                onSetWeight: onSetPendingWeight,
                onSetReps: onSetPendingReps,
                onLogSet: onLogSet
            )
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: DSRadius.md).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: DSRadius.md)
                    .stroke(DSColor.primary, lineWidth: 1.5))
    }

    private var targetWeightStr: String {
        let w = exercise.targetWeight ?? 0
        if w == 0 { return "BW" }
        return w.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f lb", w)
            : String(format: "%.1f lb", w)
    }

    private func loggedRow(setNumber: Int, set: LoggedSet) -> some View {
        HStack {
            Text("\(setNumber)")
                .font(.system(size: 11))
                .foregroundStyle(DSColor.textMuted)
                .frame(width: 18, alignment: .leading)
            Text(set.weight == 0 ? "BW" : String(format: "%.0f", set.weight))
                .font(.system(size: 11, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(set.reps)")
                .font(.system(size: 11, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "checkmark.square.fill")
                .font(.system(size: 12))
                .foregroundStyle(DSColor.accentTeal)
        }
        .padding(.vertical, 4)
    }
}
