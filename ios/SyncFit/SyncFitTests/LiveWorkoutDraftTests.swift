import XCTest
@testable import SyncFit

final class LiveWorkoutDraftTests: XCTestCase {

    private func plan(_ exercises: [(String, Int, Int, Double)]) -> PlanDay {
        PlanDay(
            dayOfWeek: 1,
            title: "Pull Day",
            notes: "",
            modality: "strength",
            exercises: exercises.map { (name, s, r, w) in
                PlanExercise(id: UUID().uuidString, name: name,
                             targetSets: s, targetReps: r, targetWeight: w)
            }
        )
    }

    private let now = Date(timeIntervalSince1970: 1_716_500_000)

    // MARK: builders

    func testStartFromPlanCopiesExercisesAndTitle() {
        let d = LiveWorkoutDraft.startFromPlan(
            planDay: plan([
                ("Pull-ups", 4, 8, 0),
                ("Barbell Row", 4, 8, 135),
            ]),
            now: now
        )
        XCTAssertEqual(d.title, "Pull Day")
        XCTAssertEqual(d.startedAt, now)
        XCTAssertEqual(d.schemaVersion, LiveWorkoutDraft.currentSchemaVersion)
        XCTAssertEqual(d.exercises.count, 2)
        XCTAssertEqual(d.exercises[0].name, "Pull-ups")
        XCTAssertEqual(d.exercises[0].targetSets, 4)
        XCTAssertEqual(d.exercises[0].targetReps, 8)
        XCTAssertEqual(d.exercises[0].targetWeight, 0)
        XCTAssertTrue(d.exercises[0].loggedSets.isEmpty)
        XCTAssertNil(d.exercises[0].pendingSet)
        XCTAssertEqual(d.exercises[1].targetWeight, 135)
    }

    func testStartFromPlanFallsBackToWorkoutTitleWhenPlanTitleIsEmpty() {
        let day = PlanDay(dayOfWeek: 0, title: "  ", notes: "", modality: "rest", exercises: [])
        let d = LiveWorkoutDraft.startFromPlan(planDay: day, now: now)
        XCTAssertEqual(d.title, "Workout")
        XCTAssertTrue(d.exercises.isEmpty)
    }

    func testStartBlankYieldsEmptyDraftWithDefaultTitle() {
        let d = LiveWorkoutDraft.startBlank(now: now)
        XCTAssertEqual(d.title, "Workout")
        XCTAssertEqual(d.startedAt, now)
        XCTAssertEqual(d.schemaVersion, LiveWorkoutDraft.currentSchemaVersion)
        XCTAssertTrue(d.exercises.isEmpty)
    }
}
