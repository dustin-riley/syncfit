// ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift
import SwiftUI

struct WeekStrip: View {
    let days: [ResolvedDay]   // exactly 7, ordered Sun..Sat
    let todayDow: Int         // 0..6
    @Binding var selectedDow: Int

    private static let weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { dow in
                chip(for: dow)
                    .contentShape(Rectangle())
                    .onTapGesture { selectedDow = dow }
            }
        }
    }

    @ViewBuilder
    private func chip(for dow: Int) -> some View {
        let glyph = PlanResolver.modalityChip(for: days[dow])
        let isToday = dow == todayDow
        let isSelected = dow == selectedDow
        VStack(spacing: 2) {
            Text(Self.weekdayLabels[dow])
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(isToday ? DSColor.onPrimary : DSColor.textMuted)
            switch glyph {
            case .letter(let s):
                Text(s)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(glyphColor(for: days[dow], isToday: isToday))
            case .rest:
                Text("·")
                    .font(.system(size: 13))
                    .foregroundStyle(isToday ? DSColor.onPrimary : DSColor.textMuted)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1.0 / 1.15, contentMode: .fit)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.sm)
                .fill(bgColor(for: days[dow], isToday: isToday))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DSRadius.sm)
                .stroke(
                    isSelected && !isToday ? DSColor.primary.opacity(0.5) : .clear,
                    lineWidth: 1
                )
        )
    }

    private func bgColor(for d: ResolvedDay, isToday: Bool) -> Color {
        if isToday { return DSColor.primary }
        if case .session(let p) = d {
            switch p.modality.trimmingCharacters(in: .whitespaces).lowercased() {
            case "strength":  return DSColor.primary.opacity(0.08)
            case "endurance": return DSColor.accentTeal.opacity(0.10)
            case "mixed":     return DSColor.accentOchre.opacity(0.12)
            default:          return DSColor.surfaceSunken
            }
        }
        return DSColor.surfaceSunken
    }

    private func glyphColor(for d: ResolvedDay, isToday: Bool) -> Color {
        if isToday { return DSColor.onPrimary }
        if case .session(let p) = d {
            switch p.modality.trimmingCharacters(in: .whitespaces).lowercased() {
            case "strength":  return DSColor.primary
            case "endurance": return DSColor.accentTeal
            case "mixed":     return DSColor.accentOchre
            default:          return DSColor.text
            }
        }
        return DSColor.textMuted
    }
}

#Preview {
    @Previewable @State var selected = 3
    return WeekStrip(
        days: PlanResolver.resolveWeek(
            PlanWeek(days: [
                .init(dayOfWeek: 1, title: "Heavy lifts", notes: "", modality: "strength", exercises: []),
                .init(dayOfWeek: 2, title: "Tempo bike", notes: "", modality: "endurance", exercises: []),
                .init(dayOfWeek: 3, title: "Heavy lifts", notes: "", modality: "strength", exercises: []),
                .init(dayOfWeek: 4, title: "Long run",  notes: "", modality: "endurance", exercises: []),
                .init(dayOfWeek: 5, title: "Heavy lifts", notes: "", modality: "strength", exercises: []),
                .init(dayOfWeek: 6, title: "Long run",  notes: "", modality: "endurance", exercises: []),
            ]),
            now: Date(),
            tz: TimeZone(identifier: "America/New_York")!
        ).days,
        todayDow: 3,
        selectedDow: $selected
    )
    .padding()
    .background(DSColor.bg)
}
