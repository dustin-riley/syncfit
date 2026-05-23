import Foundation
import os.log

// Pure: takes pre-fetched HealthKit samples and a reference `now`,
// returns the chosen value per metric per the spec §6 fallback ladder.
// No HealthKit imports; no I/O; fully unit-testable.
enum MetricPicker {

    struct Picked: Equatable {
        let value: Double
        let source: String
        let freshness: Freshness
        let recordedAt: Date
    }

    struct PickedDay: Equatable {
        var hrv: Picked?
        var rhr: Picked?
        var sleep: Picked?
    }

    // Future-clock-drift tolerance: accept samples whose `end` is within
    // 5 minutes of `now`; reject anything further in the future as
    // a clock-skew error. Per spec §9.
    private static let futureSkewTolerance: TimeInterval = 5 * 60

    private static func notFutureSkewed(_ sample: HealthSample, now: Date) -> Bool {
        sample.end <= now.addingTimeInterval(futureSkewTolerance)
    }

    // YYYY-MM-DD in APP_TZ.
    static func dateString(for date: Date, in tz: TimeZone) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", comps.year!, comps.month!, comps.day!)
    }

    // Sleep window: 22:00 prior day → end-of-last-asleep-segment (or 09:00
    // today if no sleep tracking). Returned in `now`'s timezone via APP_TZ.
    private static func sleepWindow(now: Date, samples: [HealthSample], tz: TimeZone) -> (Date, Date) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let todayComps = cal.dateComponents([.year, .month, .day], from: now)
        let today00 = cal.date(from: todayComps)!
        let priorDay22 = cal.date(byAdding: .hour, value: -2, to: today00)!  // yesterday 22:00
        let today09 = cal.date(byAdding: .hour, value: 9, to: today00)!

        let asleepInDay = samples
            .filter { $0.kind == .asleep && $0.end > priorDay22 && $0.end <= today09.addingTimeInterval(3 * 3600) && notFutureSkewed($0, now: now) }
        let windowEnd = asleepInDay.map(\.end).max() ?? today09
        return (priorDay22, windowEnd)
    }

    static func pickToday(samples: [HealthSample], now: Date, appTz tz: TimeZone) -> PickedDay {
        let skewed = samples.filter { $0.end > now.addingTimeInterval(futureSkewTolerance) }
        if !skewed.isEmpty {
            let logger = Logger(subsystem: "com.dustinriley.syncfit", category: "MetricPicker")
            logger.warning("Rejected \(skewed.count, privacy: .public) sample(s) for future clock-skew (>5m past now)")
        }

        var out = PickedDay()
        let (winStart, winEnd) = sleepWindow(now: now, samples: samples, tz: tz)

        // --- HRV ---
        let hrvSamples = samples.filter { $0.kind == .hrv && notFutureSkewed($0, now: now) }
        if let s = hrvSamples.filter({ $0.end > winStart && $0.end <= winEnd }).max(by: { $0.end < $1.end }) {
            out.hrv = .init(value: s.value, source: "primary", freshness: .fresh, recordedAt: s.end)
        } else {
            // Morning today, after the sleep window
            let morning = hrvSamples
                .filter { isSameAppDay($0.end, as: now, tz: tz) && $0.end > winEnd }
                .sorted(by: { $0.end < $1.end })
                .first
            if let s = morning {
                out.hrv = .init(value: s.value, source: "fallback_morning", freshness: .fresh, recordedAt: s.end)
            } else {
                // Trailing 48h
                let cutoff48 = now.addingTimeInterval(-48 * 3600)
                if let s = hrvSamples.filter({ $0.end >= cutoff48 }).max(by: { $0.end < $1.end }) {
                    out.hrv = .init(value: s.value, source: "fallback_48h", freshness: .stale48h, recordedAt: s.end)
                }
            }
        }

        // --- RHR ---
        let rhrSamples = samples.filter { $0.kind == .rhr && notFutureSkewed($0, now: now) }
        if let s = rhrSamples.filter({ isSameAppDay($0.end, as: now, tz: tz) }).max(by: { $0.end < $1.end }) {
            out.rhr = .init(value: s.value, source: "primary", freshness: .fresh, recordedAt: s.end)
        } else {
            let yesterday = makeCal(in: tz).date(byAdding: .day, value: -1, to: now)!
            if let s = rhrSamples.filter({ isSameAppDay($0.end, as: yesterday, tz: tz) }).max(by: { $0.end < $1.end }) {
                out.rhr = .init(value: s.value, source: "fallback_24h", freshness: .stale24h, recordedAt: s.end)
            }
        }

        // --- Sleep (sum of asleep* segments overlapping the sleep window) ---
        let sleepSegments = samples.filter {
            $0.kind == .asleep && $0.end > winStart && $0.end <= winEnd && notFutureSkewed($0, now: now)
        }
        if !sleepSegments.isEmpty {
            let total = sleepSegments.reduce(0.0) { $0 + max(0, $1.value) }
            let last = sleepSegments.max(by: { $0.end < $1.end })!
            out.sleep = .init(value: total, source: "primary", freshness: .fresh, recordedAt: last.end)
        }

        return out
    }

    // Same picker, but reference date shifted to yesterday in APP_TZ. Used
    // to resync RHR (Apple finalizes the daily RHR late, per spec §7B-2).
    static func pickYesterday(samples: [HealthSample], now: Date, appTz tz: TimeZone) -> PickedDay {
        let yesterday = makeCal(in: tz).date(byAdding: .day, value: -1, to: now)!
        // Use yesterday as the "now" anchor so today's window logic shifts back.
        return pickToday(samples: samples, now: yesterday, appTz: tz)
    }

    // MARK: helpers

    private static func makeCal(in tz: TimeZone) -> Calendar {
        var c = Calendar(identifier: .gregorian); c.timeZone = tz; return c
    }

    private static func isSameAppDay(_ a: Date, as b: Date, tz: TimeZone) -> Bool {
        dateString(for: a, in: tz) == dateString(for: b, in: tz)
    }
}
