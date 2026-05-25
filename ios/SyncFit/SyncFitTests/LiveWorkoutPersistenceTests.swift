import XCTest
@testable import SyncFit

final class LiveWorkoutPersistenceTests: XCTestCase {

    private var tmpDir: URL!
    private var persistence: LiveWorkoutPersistence!

    override func setUp() {
        super.setUp()
        tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("live-workout-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        persistence = LiveWorkoutPersistence(directory: tmpDir, maxAge: 6 * 60 * 60)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tmpDir)
        super.tearDown()
    }

    private func sample(startedAt: Date = Date()) -> LiveWorkoutDraft {
        LiveWorkoutDraft(
            id: UUID(),
            startedAt: startedAt,
            title: "T",
            exercises: [],
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }

    func testLoadReturnsNilForMissingFile() {
        XCTAssertNil(persistence.load(now: Date()))
    }

    func testSaveLoadRoundTrip() {
        let d = sample()
        persistence.save(d)
        let loaded = persistence.load(now: Date())
        XCTAssertEqual(loaded, d)
    }

    func testLoadDeletesAndReturnsNilOnExpiredDraft() {
        let stale = sample(startedAt: Date(timeIntervalSinceNow: -7 * 60 * 60))
        persistence.save(stale)
        XCTAssertNil(persistence.load(now: Date()))
        // File was deleted.
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }

    func testLoadDeletesAndReturnsNilOnSchemaMismatch() {
        let weirdJSON = """
        {"id":"\(UUID().uuidString)","startedAt":\(Date().timeIntervalSinceReferenceDate),"title":"T","exercises":[],"schemaVersion":99}
        """.data(using: .utf8)!
        try! weirdJSON.write(to: persistence.fileURL)
        XCTAssertNil(persistence.load(now: Date()))
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }

    func testLoadDeletesAndReturnsNilOnCorruptedJSON() {
        try! Data("not-json".utf8).write(to: persistence.fileURL)
        XCTAssertNil(persistence.load(now: Date()))
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }

    func testClearRemovesTheFile() {
        persistence.save(sample())
        XCTAssertTrue(FileManager.default.fileExists(atPath: persistence.fileURL.path))
        persistence.clear()
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }
}
