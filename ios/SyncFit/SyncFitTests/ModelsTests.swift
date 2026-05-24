import XCTest
@testable import SyncFit

final class ModelsTests: XCTestCase {

    func testHealthMetricUploadEncodesWireFormat() throws {
        let upload = HealthMetricUpload(
            metricDate: "2026-05-23",
            type: .hrv,
            value: 42.5,
            source: "primary",
            freshness: .fresh,
            recordedAt: ISO8601DateFormatter().date(from: "2026-05-23T06:14:00Z")!
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(upload)
        let json = String(data: data, encoding: .utf8)!
        XCTAssertTrue(json.contains("\"metricDate\":\"2026-05-23\""))
        XCTAssertTrue(json.contains("\"type\":\"hrv\""))
        XCTAssertTrue(json.contains("\"value\":42.5"))
        XCTAssertTrue(json.contains("\"source\":\"primary\""))
        XCTAssertTrue(json.contains("\"freshness\":\"fresh\""))
        XCTAssertTrue(json.contains("\"recordedAt\":\"2026-05-23T06:14:00"))
    }

    func testHealthMetricTypeRawValuesMatchBackend() {
        XCTAssertEqual(HealthMetricType.hrv.rawValue, "hrv")
        XCTAssertEqual(HealthMetricType.rhr.rawValue, "rhr")
        XCTAssertEqual(HealthMetricType.sleepDurationSeconds.rawValue, "sleep_duration_seconds")
    }

    func testFreshnessRawValuesMatchBackend() {
        XCTAssertEqual(Freshness.fresh.rawValue, "fresh")
        XCTAssertEqual(Freshness.stale24h.rawValue, "stale_24h")
        XCTAssertEqual(Freshness.stale48h.rawValue, "stale_48h")
    }

    func testPairResponseDecodes() throws {
        let json = #"{"token":"abc123XYZ_-"}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(PairResponse.self, from: json)
        XCTAssertEqual(decoded.token, "abc123XYZ_-")
    }
}
