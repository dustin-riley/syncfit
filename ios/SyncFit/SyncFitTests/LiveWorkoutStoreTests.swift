import XCTest
@testable import SyncFit

@MainActor
final class LiveWorkoutStoreTests: XCTestCase {

    private var tmpDir: URL!
    private var persistence: LiveWorkoutPersistence!

    override func setUp() {
        super.setUp()
        tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("live-workout-store-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        persistence = LiveWorkoutPersistence(directory: tmpDir, maxAge: 6 * 60 * 60)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tmpDir)
        super.tearDown()
    }

    private func planDay(_ exs: [(String, Int, Int, Double)]) -> PlanDay {
        PlanDay(dayOfWeek: 1, title: "Pull Day", notes: "", modality: "strength",
            exercises: exs.map { (n, s, r, w) in
                PlanExercise(id: UUID().uuidString, name: n,
                             targetSets: s, targetReps: r, targetWeight: w)
            })
    }

    func testStartFromPlanPopulatesDraftAndPersists() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        XCTAssertNotNil(store.draft)
        XCTAssertEqual(store.draft?.exercises.count, 1)
        // Persisted on disk.
        XCTAssertNotNil(persistence.load(now: Date()))
    }

    func testStartBlankPopulatesEmptyDraft() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startBlank()
        XCTAssertEqual(store.draft?.exercises.count, 0)
    }

    func testStartWhileInProgressDoesNotOverwrite() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        let firstId = store.draft!.id
        // Attempting to start blank while in-progress is a no-op.
        store.startBlank()
        XCTAssertEqual(store.draft?.id, firstId)
    }

    func testNavigationAutoCommitsDirtyPending() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0), ("Row", 4, 8, 135)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        store.navigate(toExerciseIndex: 1)
        XCTAssertEqual(store.draft?.exercises[0].loggedSets.count, 1)
    }

    func testFinishSuccessClearsLocalState() async {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        let result = await store.finish()
        XCTAssertTrue(result.isSuccess)
        XCTAssertNil(store.draft)
        XCTAssertNil(persistence.load(now: Date()))
    }

    func testFinishSkippedTreatedAsSuccess() async {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 0, skipped: 1, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        let result = await store.finish()
        XCTAssertTrue(result.isSuccess)
        XCTAssertNil(store.draft)
    }

    func testFinishFailurePreservesLocalState() async {
        struct Boom: Error {}
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in throw Boom() })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        let result = await store.finish()
        XCTAssertFalse(result.isSuccess)
        XCTAssertNotNil(store.draft)
        XCTAssertNotNil(persistence.load(now: Date()))
    }

    func testDiscardClearsLocalState() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.discard()
        XCTAssertNil(store.draft)
        XCTAssertNil(persistence.load(now: Date()))
    }
}

private extension LiveWorkoutFinishResult {
    var isSuccess: Bool { if case .success = self { return true } else { return false } }
}
