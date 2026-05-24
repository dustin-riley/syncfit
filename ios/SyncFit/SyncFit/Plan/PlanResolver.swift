import Foundation

enum ResolvedDay: Equatable {
    case session(PlanDay)
    case rest(dayOfWeek: Int, title: String?, notes: String?)
}

struct ResolvedWeek: Equatable {
    let todayDow: Int            // 0..6, Sun=0..Sat=6
    let days: [ResolvedDay]      // exactly 7, dow 0..6 in order
}

enum ChipGlyph: Equatable {
    case letter(String)          // "S" / "E" / "M" / first-char fallback
    case rest                    // renders as centered "·"
}

enum PlanResolver {

    /// Densifies a sparse `PlanWeek` (server-side rows for only the days
    /// the user saved) into a 7-entry, dow-ordered array. Per spec §4.1:
    /// any row with at least one of (exercises, title, notes) populated
    /// becomes `.session`; everything else becomes `.rest`.
    static func resolveWeek(_ response: PlanWeek, now: Date, tz: TimeZone) -> ResolvedWeek {
        let todayDow = currentDow(now: now, tz: tz)
        var byDow: [Int: PlanDay] = [:]
        for d in response.days { byDow[d.dayOfWeek] = d }

        var out: [ResolvedDay] = []
        out.reserveCapacity(7)
        for dow in 0..<7 {
            if let row = byDow[dow] {
                let hasContent = !row.exercises.isEmpty
                    || !row.title.isEmpty
                    || !row.notes.isEmpty
                out.append(hasContent
                    ? .session(row)
                    : .rest(dayOfWeek: dow, title: nil, notes: nil))
            } else {
                out.append(.rest(dayOfWeek: dow, title: nil, notes: nil))
            }
        }
        return ResolvedWeek(todayDow: todayDow, days: out)
    }

    static func modalityChip(for day: ResolvedDay) -> ChipGlyph {
        switch day {
        case .rest:
            return .rest
        case .session(let p):
            let m = p.modality.trimmingCharacters(in: .whitespaces).lowercased()
            switch m {
            case "strength":  return .letter("S")
            case "endurance": return .letter("E")
            case "mixed":     return .letter("M")
            case "":
                let t = p.title.trimmingCharacters(in: .whitespaces)
                if let c = t.first { return .letter(String(c).uppercased()) }
                return .letter("?")
            default:
                if let c = m.first { return .letter(String(c).uppercased()) }
                return .letter("?")
            }
        }
    }

    private static func currentDow(now: Date, tz: TimeZone) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        // Calendar.weekday: Sunday=1..Saturday=7; spec uses Sunday=0..Saturday=6
        return cal.component(.weekday, from: now) - 1
    }
}
