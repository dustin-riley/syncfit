import XCTest
@testable import SyncFit

final class SyncCoordinatorTests: XCTestCase {

    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(StubURLProtocol.self)
        StubURLProtocol.handler = nil
        UserDefaults.standard.removeObject(forKey: "lastSyncedAt")
    }
    override func tearDown() {
        URLProtocol.unregisterClass(StubURLProtocol.self)
        UserDefaults.standard.removeObject(forKey: "lastSyncedAt")
        super.tearDown()
    }

    func testRunUploadsTodayAndYesterdayAndPersistsLastSyncedAt() async throws {
        let now = ISO8601DateFormatter().date(from: "2026-05-23T16:00:00Z")!
        let fake = FakeHealth(samples: [
            HealthSample(kind: .hrv, value: 42.5, start: now.addingTimeInterval(-7*3600), end: now.addingTimeInterval(-7*3600)),
            HealthSample(kind: .rhr, value: 58, start: now.addingTimeInterval(-8*3600), end: now.addingTimeInterval(-8*3600)),
        ])
        var captured: Data?
        StubURLProtocol.handler = { req in
            captured = req.httpBody ?? Data()
            let body = #"{"accepted":2,"updated":2}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, body)
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        let api = APIClient(baseURL: URL(string: "http://test.local")!,
                            token: "t", session: URLSession(configuration: config))
        let coord = SyncCoordinator(health: fake, api: api, appTz: TimeZone(identifier: "America/New_York")!)

        try await coord.run(now: now)

        XCTAssertNotNil(captured)
        let payload = try JSONSerialization.jsonObject(with: captured!) as! [String: Any]
        let uploads = payload["uploads"] as! [[String: Any]]
        XCTAssertGreaterThanOrEqual(uploads.count, 2)  // today's hrv + today's rhr at minimum

        XCTAssertNotNil(UserDefaults.standard.object(forKey: "lastSyncedAt"))
    }

    func testRunClearsKeychainOn401() async {
        let now = Date()
        let fake = FakeHealth(samples: [])
        StubURLProtocol.handler = { req in
            (HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        let api = APIClient(baseURL: URL(string: "http://test.local")!,
                            token: "t", session: URLSession(configuration: config))
        let kc = KeychainStore(service: "com.dustinriley.syncfit.tests.\(UUID().uuidString)")
        try? kc.save(token: "to-be-cleared")
        let coord = SyncCoordinator(health: fake, api: api,
                                    appTz: TimeZone(identifier: "America/New_York")!,
                                    keychain: kc)
        do {
            try await coord.run(now: now)
            XCTFail("expected throw")
        } catch APIClientError.unauthorized {
            XCTAssertNil(kc.load())
        } catch {
            XCTFail("expected .unauthorized, got \(error)")
        }
    }
}

// MARK: Fake

final class FakeHealth: HealthKitReading {
    let samples: [HealthSample]
    init(samples: [HealthSample]) { self.samples = samples }
    func fetchSamples(endingAt now: Date) async throws -> [HealthSample] { samples }
    func requestAuthorization() async throws -> Bool { true }
}
