import XCTest
@testable import SyncFit

final class PostWorkoutCodableTests: XCTestCase {

    func testRequestEncodesAsServerExpects() throws {
        let req = PostWorkoutRequest(
            performedAt: Date(timeIntervalSince1970: 1_716_500_000),
            title: "Pull Day",
            sets: [
                PostWorkoutSet(exerciseName: "Pull-ups", weight: 0, reps: 10),
                PostWorkoutSet(exerciseName: "Barbell Row", weight: 135, reps: 8),
            ]
        )
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        let data = try enc.encode(req)
        let s = String(data: data, encoding: .utf8)!
        XCTAssertTrue(s.contains("\"performedAt\":\"2024-05-23T21:33:20Z\""))
        XCTAssertTrue(s.contains("\"title\":\"Pull Day\""))
        XCTAssertTrue(s.contains("\"exerciseName\":\"Pull-ups\""))
        XCTAssertTrue(s.contains("\"weight\":0"))
        XCTAssertTrue(s.contains("\"reps\":10"))
    }

    func testResponseDecodesHappyPath() throws {
        let json = #"{"ok":true,"added":1,"skipped":0}"#.data(using: .utf8)!
        let resp = try JSONDecoder().decode(PostWorkoutResponse.self, from: json)
        XCTAssertTrue(resp.ok)
        XCTAssertEqual(resp.added, 1)
        XCTAssertEqual(resp.skipped, 0)
        XCTAssertNil(resp.error)
    }

    func testResponseDecodesSkippedDuplicate() throws {
        let json = #"{"ok":true,"added":0,"skipped":1}"#.data(using: .utf8)!
        let resp = try JSONDecoder().decode(PostWorkoutResponse.self, from: json)
        XCTAssertEqual(resp.added, 0)
        XCTAssertEqual(resp.skipped, 1)
    }
}
