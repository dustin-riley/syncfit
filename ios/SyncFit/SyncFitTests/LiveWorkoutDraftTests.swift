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

    // MARK: mutations — pending

    func testPreparePendingForUnplannedExerciseUsesZeros() {
        var d = draft([ex(target: nil, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
    }

    func testPreparePendingUsesPlanTargetOnFirstSet() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 100) // from ex() fixture
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 8)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
    }

    func testPreparePendingUsesLastLoggedSetOnSubsequentSets() {
        var e = ex(target: 4, logged: 0)
        e.loggedSets = [LoggedSet(id: UUID(), weight: 142.5, reps: 7, loggedAt: now)]
        var d = draft([e])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 142.5)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 7)
    }

    func testPreparePendingDoesNotOverwriteAnExistingPending() {
        var e = ex(target: 4, logged: 0)
        e.pendingSet = PendingSet(weight: 200, reps: 3, dirty: true)
        var d = draft([e])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 200)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 3)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, true)
    }

    func testSetPendingWeightFlipsDirty() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
        d.setPendingWeight(140, forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 140)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, true)
    }

    func testSetPendingRepsFlipsDirty() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        d.setPendingReps(7, forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 7)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, true)
    }

    func testPromotePendingAppendsLoggedAndResetsPending() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        d.setPendingWeight(135, forExerciseIndex: 0)
        d.setPendingReps(8, forExerciseIndex: 0)
        d.promotePending(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d.exercises[0].loggedSets.count, 1)
        XCTAssertEqual(d.exercises[0].loggedSets[0].weight, 135)
        XCTAssertEqual(d.exercises[0].loggedSets[0].reps, 8)
        // Pending was reset, pre-filled from the just-logged values, dirty=false.
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 135)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 8)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
    }

    func testAutoCommitDirtyOnlyFiresWhenDirtyAndValid() {
        // dirty + valid → committed
        var d1 = draft([ex(target: 4, logged: 0)])
        d1.preparePendingIfNeeded(forExerciseIndex: 0)
        d1.setPendingReps(8, forExerciseIndex: 0)
        d1.autoCommitDirty(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d1.exercises[0].loggedSets.count, 1)

        // dirty + invalid (reps == 0) → preserved on exercise, NOT logged
        var d2 = draft([ex(target: 4, logged: 0)])
        d2.exercises[0].pendingSet = PendingSet(weight: 135, reps: 0, dirty: true)
        d2.autoCommitDirty(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d2.exercises[0].loggedSets.count, 0)
        XCTAssertEqual(d2.exercises[0].pendingSet?.weight, 135) // preserved

        // not dirty → never committed (no fabrication)
        var d3 = draft([ex(target: 4, logged: 0)])
        d3.preparePendingIfNeeded(forExerciseIndex: 0)
        d3.autoCommitDirty(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d3.exercises[0].loggedSets.count, 0)
    }

    // MARK: mutations — structural

    func testAddExerciseAppendsAtTheBottom() {
        var d = draft([ex(target: 4, logged: 0)])
        d.addExercise(name: "Curl")
        XCTAssertEqual(d.exercises.count, 2)
        XCTAssertEqual(d.exercises[1].name, "Curl")
        XCTAssertNil(d.exercises[1].targetSets) // unplanned
        XCTAssertTrue(d.exercises[1].loggedSets.isEmpty)
    }

    func testRemoveExercise() {
        var d = draft([ex(target: 4, logged: 0), ex(target: 3, logged: 0)])
        d.removeExercise(at: 0)
        XCTAssertEqual(d.exercises.count, 1)
    }

    func testMoveExercise() {
        var d = draft([
            { var e = ex(target: 4, logged: 0); e.name = "A"; return e }(),
            { var e = ex(target: 4, logged: 0); e.name = "B"; return e }(),
        ])
        d.moveExercise(from: 0, to: 2) // SwiftUI move semantics: to = insertion index
        XCTAssertEqual(d.exercises.map(\.name), ["B", "A"])
    }

    func testRenameExercise() {
        var d = draft([ex(target: 4, logged: 0)])
        d.renameExercise(at: 0, to: "  Pull-ups  ")
        XCTAssertEqual(d.exercises[0].name, "Pull-ups")
    }

    func testEditLoggedSet() {
        var e = ex(target: 4, logged: 1)
        let setId = e.loggedSets[0].id
        var d = draft([e])
        d.editLoggedSet(exerciseIndex: 0, setId: setId, weight: 140, reps: 6)
        XCTAssertEqual(d.exercises[0].loggedSets[0].weight, 140)
        XCTAssertEqual(d.exercises[0].loggedSets[0].reps, 6)
    }

    // MARK: payload

    func testFlattenForPostIncludesAllLoggedSetsInOrder() {
        var e1 = ex(target: 4, logged: 0)
        e1.name = "Pull-ups"
        e1.loggedSets = [
            LoggedSet(id: UUID(), weight: 0, reps: 10, loggedAt: now),
            LoggedSet(id: UUID(), weight: 0, reps: 9, loggedAt: now),
        ]
        var e2 = ex(target: 4, logged: 0)
        e2.name = "Barbell Row"
        e2.loggedSets = [
            LoggedSet(id: UUID(), weight: 135, reps: 8, loggedAt: now),
        ]
        let d = draft([e1, e2])
        let (payload, _) = d.flattenForPost(now: now)
        XCTAssertEqual(payload.count, 3)
        XCTAssertEqual(payload[0].exerciseName, "Pull-ups")
        XCTAssertEqual(payload[0].reps, 10)
        XCTAssertEqual(payload[2].exerciseName, "Barbell Row")
    }

    func testFlattenForPostAutoCommitsDirtyValidPendings() {
        var d = draft([ex(target: 4, logged: 0)])
        d.exercises[0].pendingSet = PendingSet(weight: 135, reps: 8, dirty: true)
        let (payload, mutated) = d.flattenForPost(now: now)
        XCTAssertEqual(payload.count, 1)
        XCTAssertEqual(payload[0].weight, 135)
        // The returned mutated draft reflects the promotion (caller persists it).
        XCTAssertEqual(mutated.exercises[0].loggedSets.count, 1)
    }

    func testFlattenForPostSkipsDirtyButInvalidPendings() {
        var d = draft([ex(target: 4, logged: 0)])
        d.exercises[0].pendingSet = PendingSet(weight: 135, reps: 0, dirty: true)
        let (payload, mutated) = d.flattenForPost(now: now)
        XCTAssertTrue(payload.isEmpty)
        XCTAssertTrue(mutated.exercises[0].loggedSets.isEmpty)
        // Pending preserved so the user can fix on Resume.
        XCTAssertEqual(mutated.exercises[0].pendingSet?.weight, 135)
    }

    func testFlattenForPostSkipsUntouchedPendings() {
        var d = draft([ex(target: 4, logged: 0)])
        d.exercises[0].pendingSet = PendingSet(weight: 135, reps: 8, dirty: false)
        let (payload, _) = d.flattenForPost(now: now)
        XCTAssertTrue(payload.isEmpty)
    }

    func testFlattenForPostIsEmptyForEmptyDraft() {
        let (payload, _) = draft([]).flattenForPost(now: now)
        XCTAssertTrue(payload.isEmpty)
    }
}
