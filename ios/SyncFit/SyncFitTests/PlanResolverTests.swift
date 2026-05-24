import XCTest
@testable import SyncFit

final class PlanResolverTests: XCTestCase {

    private let ny = TimeZone(identifier: "America/New_York")!

    // MARK: resolveWeek

    func testResolvesSevenDaysFromSparseInput() {
        let input = PlanWeek(days: [
            PlanDay(dayOfWeek: 1, title: "Heavy lifts", notes: "", modality: "strength",
                    exercises: [PlanExercise(id: "x", name: "Squat", targetSets: 4, targetReps: 5, targetWeight: 245)])
        ])
        let week = PlanResolver.resolveWeek(input, now: noon("2026-05-20"), tz: ny) // Wed
        XCTAssertEqual(week.days.count, 7)
        if case .session(let p) = week.days[1] {
            XCTAssertEqual(p.title, "Heavy lifts")
        } else {
            XCTFail("expected .session at dow=1")
        }
        for i in [0, 2, 3, 4, 5, 6] {
            if case .rest(let dow, let t, let n) = week.days[i] {
                XCTAssertEqual(dow, i)
                XCTAssertNil(t)
                XCTAssertNil(n)
            } else {
                XCTFail("expected .rest at dow=\(i)")
            }
        }
    }

    func testTodayDowIsWednesdayInNY() {
        // 2026-05-20 noon NY = Wednesday → dow=3
        let week = PlanResolver.resolveWeek(PlanWeek(days: []), now: noon("2026-05-20"), tz: ny)
        XCTAssertEqual(week.todayDow, 3)
    }

    func testTodayDowIsSundayZero() {
        // 2026-05-17 noon NY = Sunday → dow=0
        let week = PlanResolver.resolveWeek(PlanWeek(days: []), now: noon("2026-05-17"), tz: ny)
        XCTAssertEqual(week.todayDow, 0)
    }

    func testRowWithOnlyTitleStaysSession() {
        // Spec §4.1: row with any content emits .session; renderer handles
        // the no-exercises case (shows "No exercises planned" line).
        let input = PlanWeek(days: [
            PlanDay(dayOfWeek: 4, title: "Active recovery", notes: "", modality: "rest", exercises: [])
        ])
        let week = PlanResolver.resolveWeek(input, now: noon("2026-05-20"), tz: ny)
        if case .session(let p) = week.days[4] {
            XCTAssertEqual(p.title, "Active recovery")
            XCTAssertTrue(p.exercises.isEmpty)
        } else {
            XCTFail("expected .session (has title) at dow=4")
        }
    }

    func testEmptyRowFallsToRest() {
        let input = PlanWeek(days: [
            PlanDay(dayOfWeek: 5, title: "", notes: "", modality: "", exercises: [])
        ])
        let week = PlanResolver.resolveWeek(input, now: noon("2026-05-20"), tz: ny)
        if case .rest(let dow, let t, let n) = week.days[5] {
            XCTAssertEqual(dow, 5)
            XCTAssertNil(t)
            XCTAssertNil(n)
        } else {
            XCTFail("expected .rest")
        }
    }

    // MARK: modalityChip

    func testChipForStrength() {
        let day = ResolvedDay.session(.init(dayOfWeek: 1, title: "H", notes: "",
            modality: "strength", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("S"))
    }

    func testChipForEnduranceTrimsAndIgnoresCase() {
        let day = ResolvedDay.session(.init(dayOfWeek: 2, title: "T", notes: "",
            modality: " ENDURANCE ", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("E"))
    }

    func testChipForMixed() {
        let day = ResolvedDay.session(.init(dayOfWeek: 3, title: "C", notes: "",
            modality: "mixed", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("M"))
    }

    func testChipFallsBackToModalityFirstChar() {
        let day = ResolvedDay.session(.init(dayOfWeek: 3, title: "Walk", notes: "",
            modality: "walking", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("W"))
    }

    func testChipUsesTitleWhenModalityEmpty() {
        let day = ResolvedDay.session(.init(dayOfWeek: 3, title: "Yoga", notes: "",
            modality: "", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("Y"))
    }

    func testChipReturnsRestForRest() {
        XCTAssertEqual(
            PlanResolver.modalityChip(for: .rest(dayOfWeek: 0, title: nil, notes: nil)),
            .rest
        )
    }

    func testChipForSessionWithRestModalityIsRest() {
        // A user can mark a session "rest" (e.g. a row with notes but no
        // exercises, modality typed as "rest"). The chip should show the
        // rest dot, not the letter "R" via the default fallback.
        let day = ResolvedDay.session(.init(dayOfWeek: 0, title: "Off",
            notes: "active recovery walk", modality: "rest", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .rest)
    }

    // MARK: helpers

    private func noon(_ ymd: String) -> Date {
        let f = DateFormatter()
        f.timeZone = ny
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(ymd) 12:00")!
    }
}
