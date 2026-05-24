// ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
import SwiftUI

struct PlanDetailCard: View {
    let day: ResolvedDay

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch day {
            case .session(let p):
                sessionBody(p)
            case .rest(_, let title, let notes):
                restBody(title: title, notes: notes)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.md)
                .fill(DSColor.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DSRadius.md)
                .stroke(DSColor.border, lineWidth: 1)
        )
        .dsShadow(.md)
    }

    @ViewBuilder
    private func sessionBody(_ p: PlanDay) -> some View {
        Text(p.title.isEmpty ? "Untitled session" : p.title)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(DSColor.text)
        let meta = [p.modality, p.notes].filter { !$0.isEmpty }.joined(separator: " · ")
        if !meta.isEmpty {
            Text(meta)
                .font(.system(size: 10))
                .foregroundStyle(DSColor.textMuted)
                .padding(.top, 3)
        }
        if p.exercises.isEmpty {
            Text("No exercises planned")
                .font(.system(size: 11).italic())
                .foregroundStyle(DSColor.textMuted)
                .padding(.top, 11)
        } else {
            VStack(spacing: 5) {
                ForEach(p.exercises) { ex in
                    HStack(alignment: .firstTextBaseline) {
                        Text(ex.name)
                            .font(.system(size: 11))
                            .foregroundStyle(DSColor.text)
                        Spacer(minLength: 4)
                        Text(Self.formatPrescription(ex))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(DSColor.textMuted)
                    }
                }
            }
            .padding(.top, 11)
        }
    }

    @ViewBuilder
    private func restBody(title: String?, notes: String?) -> some View {
        if let t = title, !t.isEmpty {
            Text(t)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(DSColor.text)
        } else {
            Text("Rest day")
                .font(.system(size: 16, weight: .medium).italic())
                .foregroundStyle(DSColor.textMuted)
        }
        if let n = notes, !n.isEmpty {
            Text(n)
                .font(.system(size: 10))
                .foregroundStyle(DSColor.textMuted)
                .padding(.top, 3)
        }
    }

    static func formatPrescription(_ ex: PlanExercise) -> String {
        // 4×5 · 185lb — trim ".0" on integer weights for cleaner display.
        let w: String
        if ex.targetWeight.truncatingRemainder(dividingBy: 1) == 0 {
            w = String(Int(ex.targetWeight))
        } else {
            w = String(format: "%.1f", ex.targetWeight)
        }
        return "\(ex.targetSets)×\(ex.targetReps) · \(w)lb"
    }
}

#Preview("Strength session") {
    PlanDetailCard(day: .session(.init(
        dayOfWeek: 3, title: "Heavy lifts", notes: "focus on back squat",
        modality: "strength",
        exercises: [
            .init(id: "1", name: "Back squat", targetSets: 4, targetReps: 5, targetWeight: 245),
            .init(id: "2", name: "Romanian deadlift", targetSets: 3, targetReps: 8, targetWeight: 185),
            .init(id: "3", name: "Walking lunge", targetSets: 3, targetReps: 12, targetWeight: 35),
        ]
    )))
    .padding()
    .background(DSColor.bg)
}

#Preview("Rest day, blank") {
    PlanDetailCard(day: .rest(dayOfWeek: 0, title: nil, notes: nil))
        .padding()
        .background(DSColor.bg)
}

#Preview("Endurance, no exercises") {
    PlanDetailCard(day: .session(.init(
        dayOfWeek: 4, title: "Long run", notes: "90 min easy",
        modality: "endurance", exercises: []
    )))
    .padding()
    .background(DSColor.bg)
}
