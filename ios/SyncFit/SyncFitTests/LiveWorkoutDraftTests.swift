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

    // MARK: current-exercise

    private func draft(_ exercises: [DraftExercise]) -> LiveWorkoutDraft {
        LiveWorkoutDraft(
            id: UUID(), startedAt: now, title: "t",
            exercises: exercises,
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }

    private func ex(target: Int?, logged: Int) -> DraftExercise {
        DraftExercise(
            id: UUID(), name: "Ex", targetSets: target,
            targetReps: 8, targetWeight: 100,
            loggedSets: (0..<logged).map { _ in
                LoggedSet(id: UUID(), weight: 100, reps: 8, loggedAt: now)
            },
            pendingSet: nil
        )
    }

    func testCurrentIsFirstExerciseWithNothingLogged() {
        let d = draft([ex(target: 4, logged: 0), ex(target: 4, logged: 0)])
        XCTAssertEqual(d.currentExerciseIndex, 0)
    }

    func testCurrentAdvancesPastFinishedExercise() {
        let d = draft([ex(target: 4, logged: 4), ex(target: 4, logged: 1)])
        XCTAssertEqual(d.currentExerciseIndex, 1)
    }

    func testUnplannedExerciseNeverAutoFinishes() {
        // target=nil means "no planned set count"; treated as infinite.
        let d = draft([ex(target: nil, logged: 99)])
        XCTAssertEqual(d.currentExerciseIndex, 0)
    }

    func testCurrentReturnsNilWhenAllPlannedDone() {
        let d = draft([ex(target: 4, logged: 4), ex(target: 3, logged: 3)])
        XCTAssertNil(d.currentExerciseIndex)
    }

    func testCurrentReturnsNilOnEmptyDraft() {
        XCTAssertNil(draft([]).currentExerciseIndex)
    }
}
