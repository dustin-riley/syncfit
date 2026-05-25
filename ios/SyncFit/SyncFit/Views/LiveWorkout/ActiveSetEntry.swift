import SwiftUI

// Stepper block (set-entry B from the brainstorming session). Binds directly
// to the store's pending-set values; any change persists immediately (Section
// 5.4 of the spec). The Log set CTA is disabled when reps < 1.
//
// Token substitutions vs. plan:
//   DSColor.accentSand → DSColor.surfaceSunken  (warm sunken fill; closest warm-neutral step-button bg)
//   DSColor.divider    → DSColor.border          (outline on idle weight/rep fields)
struct ActiveSetEntry: View {
    let setNumber: Int
    let pendingWeight: Double
    let pendingReps: Int
    let onSetWeight: (Double) -> Void
    let onSetReps: (Int) -> Void
    let onLogSet: () -> Void

    @State private var weightEditMode: Bool = false
    @State private var weightText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("WEIGHT (lb)")
            HStack(spacing: 6) {
                stepButton("−5") { onSetWeight(max(0, pendingWeight - 5)) }
                stepButton("−2.5") { onSetWeight(max(0, pendingWeight - 2.5)) }
                weightField
                stepButton("+2.5") { onSetWeight(pendingWeight + 2.5) }
                stepButton("+5") { onSetWeight(pendingWeight + 5) }
            }

            label("REPS")
            HStack(spacing: 6) {
                stepButton("−1") { onSetReps(max(0, pendingReps - 1)) }
                Text("\(pendingReps)")
                    .font(.system(size: 18, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(Color.white))
                    .overlay(RoundedRectangle(cornerRadius: DSRadius.sm).stroke(DSColor.border))
                stepButton("+1") { onSetReps(pendingReps + 1) }
            }

            Button(action: onLogSet) {
                Text("Log set \(setNumber)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: DSRadius.pill).fill(DSColor.primary))
            }
            .disabled(pendingReps < 1)
            .opacity(pendingReps < 1 ? 0.5 : 1)
        }
    }

    private func label(_ s: String) -> some View {
        Text(s)
            .font(.system(size: 9, weight: .bold))
            .tracking(0.06 * 9)
            .foregroundStyle(DSColor.textMuted)
    }

    private func stepButton(_ s: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(s)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(DSColor.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(DSColor.surfaceSunken))
        }
    }

    @ViewBuilder
    private var weightField: some View {
        if weightEditMode {
            TextField("", text: $weightText)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 18, weight: .bold))
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(Color.white))
                .overlay(RoundedRectangle(cornerRadius: DSRadius.sm).stroke(DSColor.primary))
                .onSubmit {
                    if let v = Double(weightText), v >= 0 { onSetWeight(v) }
                    weightEditMode = false
                }
                .frame(maxWidth: .infinity)
        } else {
            Button {
                weightText = String(format: pendingWeight.truncatingRemainder(dividingBy: 1) == 0
                                    ? "%.0f" : "%.1f", pendingWeight)
                weightEditMode = true
            } label: {
                Text(formatWeight(pendingWeight))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(DSColor.text)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(Color.white))
                    .overlay(RoundedRectangle(cornerRadius: DSRadius.sm).stroke(DSColor.border))
            }
        }
    }

    private func formatWeight(_ w: Double) -> String {
        if w == 0 { return "BW" }
        if w.truncatingRemainder(dividingBy: 1) == 0 { return String(format: "%.0f", w) }
        return String(format: "%.1f", w)
    }
}
