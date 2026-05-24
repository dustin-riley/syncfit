import XCTest
@testable import SyncFit

final class PairingClientTests: XCTestCase {

    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(StubURLProtocol.self)
        StubURLProtocol.handler = nil
    }
    override func tearDown() {
        URLProtocol.unregisterClass(StubURLProtocol.self)
        super.tearDown()
    }

    private func client() -> PairingClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return PairingClient(baseURL: URL(string: "http://test.local")!,
                             session: URLSession(configuration: config))
    }

    func testPairHappyPath() async throws {
        StubURLProtocol.handler = { req in
            XCTAssertEqual(req.url?.path, "/api/devices/pair")
            XCTAssertNil(req.value(forHTTPHeaderField: "Authorization"))
            let body = #"{"token":"abc123"}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, body)
        }
        let token = try await client().pair(code: "424242", deviceName: "iPhone")
        XCTAssertEqual(token, "abc123")
    }

    func testPair400Throws() async {
        StubURLProtocol.handler = { req in
            let body = #"{"error":"invalid_or_expired_code"}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: req.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!, body)
        }
        do {
            _ = try await client().pair(code: "999999", deviceName: "iPhone")
            XCTFail("expected throw")
        } catch APIClientError.badRequest {
            // ok
        } catch {
            XCTFail("expected .badRequest, got \(error)")
        }
    }
}
