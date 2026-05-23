import XCTest
@testable import SyncFit

final class MetricPickerTests: XCTestCase {

    // 2026-05-23 12:00 ET. Reused as the reference `now` across cases.
    let now = ISO8601DateFormatter().date(from: "2026-05-23T16:00:00Z")!

    private func sample(_ kind: HealthSample.Kind, _ value: Double, end: String, durationSec: Double = 0) -> HealthSample {
        let endDate = ISO8601DateFormatter().date(from: end)!
        let startDate = kind == .asleep
            ? endDate.addingTimeInterval(-durationSec)
            : endDate
        return HealthSample(kind: kind, value: value, start: startDate, end: endDate)
    }

    // MARK: HRV

    func testHrvPrefersLastNightSleepWindowSample() {
        let samples: [HealthSample] = [
            // last night's sleep window roughly 22:00 prior day → 08:00 today
            sample(.hrv, 42.5, end: "2026-05-23T07:30:00Z"),
            sample(.hrv, 60.0, end: "2026-05-22T18:00:00Z"),  // earlier, ignored
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(picked.hrv?.value, 42.5)
        XCTAssertEqual(picked.hrv?.source, "primary")
        XCTAssertEqual(picked.hrv?.freshness, .fresh)
    }

    func testHrvFallsBackToMorningTodaySampleBeforeWorkout() {
        // No sample in the sleep window; one this morning during the day.
        let samples: [HealthSample] = [
            sample(.hrv, 38.0, end: "2026-05-23T13:30:00Z"),  // post-sleep window, before now
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(picked.hrv?.value, 38.0)
        XCTAssertEqual(picked.hrv?.source, "fallback_morning")
        XCTAssertEqual(picked.hrv?.freshness, .fresh)
    }

    func testHrvFallsBackToStale48h() {
        let samples: [HealthSample] = [
            // 40 hours ago — past today's sleep window, within 48h
            sample(.hrv, 45.0, end: "2026-05-22T00:00:00Z"),
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(picked.hrv?.value, 45.0)
        XCTAssertEqual(picked.hrv?.source, "fallback_48h")
        XCTAssertEqual(picked.hrv?.freshness, .stale48h)
    }

    func testHrvMissingWhenNoSampleWithin72h() {
        let samples: [HealthSample] = []
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertNil(picked.hrv)
    }

    // MARK: RHR

    func testRhrTodayPrimary() {
        let samples: [HealthSample] = [
            sample(.rhr, 58, end: "2026-05-23T08:00:00Z"),
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(picked.rhr?.value, 58)
        XCTAssertEqual(picked.rhr?.source, "primary")
        XCTAssertEqual(picked.rhr?.freshness, .fresh)
    }

    func testRhrFallsBackToYesterdayWithStale24h() {
        let samples: [HealthSample] = [
            sample(.rhr, 56, end: "2026-05-22T08:00:00Z"),
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(picked.rhr?.value, 56)
        XCTAssertEqual(picked.rhr?.source, "fallback_24h")
        XCTAssertEqual(picked.rhr?.freshness, .stale24h)
    }

    func testRhrMissingWhenNoneInWindow() {
        let samples: [HealthSample] = []
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertNil(picked.rhr)
    }

    // MARK: Sleep

    func testSleepUsesLastNightAsleepSegments() {
        // Two asleep segments overnight, totalling 6h 12m (22320s)
        let samples: [HealthSample] = [
            sample(.asleep, 14400, end: "2026-05-23T05:00:00Z", durationSec: 14400), // 4h
            sample(.asleep, 7920, end: "2026-05-23T07:30:00Z", durationSec: 7920),   // 2h 12m
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(picked.sleep?.value, 22320)
        XCTAssertEqual(picked.sleep?.source, "primary")
        XCTAssertEqual(picked.sleep?.freshness, .fresh)
    }

    func testSleepMissingWhenNoLastNightSegments() {
        let samples: [HealthSample] = [
            // old segment, two nights ago
            sample(.asleep, 28000, end: "2026-05-22T05:00:00Z", durationSec: 28000),
        ]
        let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertNil(picked.sleep)
    }

    // MARK: Date assignment

    func testMetricDateInAppTz() {
        let d = MetricPicker.dateString(for: now, in: Config.appTimeZone)
        XCTAssertEqual(d, "2026-05-23")
    }

    // MARK: Yesterday's RHR re-sync (per spec §7B point 2)

    func testYesterdayRhrIsReportedSeparatelyWhenPresent() {
        // RHR samples for both today and yesterday — both should be uploaded.
        let samples: [HealthSample] = [
            sample(.rhr, 58, end: "2026-05-23T08:00:00Z"),
            sample(.rhr, 56, end: "2026-05-22T08:00:00Z"),
        ]
        let yesterday = MetricPicker.pickYesterday(samples: samples, now: now, appTz: Config.appTimeZone)
        XCTAssertEqual(yesterday.rhr?.value, 56)
        XCTAssertEqual(yesterday.rhr?.freshness, .fresh)  // for yesterday's date, this IS the primary
    }
}
