import XCTest
@testable import SyncFit

final class APIClientTests: XCTestCase {

    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(StubURLProtocol.self)
        StubURLProtocol.handler = nil
    }
    override func tearDown() {
        URLProtocol.unregisterClass(StubURLProtocol.self)
        super.tearDown()
    }

    private func client(token: String) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return APIClient(baseURL: URL(string: "http://test.local")!,
                         token: token,
                         session: URLSession(configuration: config))
    }

    func testSyncSendsBearerAndDecodesResponse() async throws {
        StubURLProtocol.handler = { req in
            XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer t0k3n")
            XCTAssertEqual(req.url?.path, "/api/health/sync")
            let body = #"{"accepted":1,"updated":1}"#.data(using: .utf8)!
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (resp, body)
        }
        let upload = HealthMetricUpload(
            metricDate: "2026-05-23", type: .hrv, value: 42.5,
            source: "primary", freshness: .fresh, recordedAt: Date()
        )
        let r = try await client(token: "t0k3n").healthSync(uploads: [upload])
        XCTAssertEqual(r.accepted, 1)
        XCTAssertEqual(r.updated, 1)
    }

    func testSync401ThrowsUnauthorized() async {
        StubURLProtocol.handler = { req in
            (HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }
        do {
            _ = try await client(token: "bad").healthSync(uploads: [])
            XCTFail("expected throw")
        } catch APIClientError.unauthorized {
            // ok
        } catch {
            XCTFail("expected .unauthorized, got \(error)")
        }
    }

    func testSync400ThrowsInvalidPayload() async {
        StubURLProtocol.handler = { req in
            let body = #"{"error":"invalid_payload"}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: req.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!, body)
        }
        do {
            _ = try await client(token: "ok").healthSync(uploads: [])
            XCTFail("expected throw")
        } catch APIClientError.badRequest {
            // ok
        } catch {
            XCTFail("expected .badRequest, got \(error)")
        }
    }

    // MARK: getPlanWeek

    func testGetPlanWeekSendsBearerAndDecodes() async throws {
        StubURLProtocol.handler = { req in
            XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer t0k3n")
            XCTAssertEqual(req.url?.path, "/api/plan/week")
            XCTAssertEqual(req.httpMethod, "GET")
            let body = #"""
            {"days":[{"dayOfWeek":1,"title":"Heavy lifts","notes":"","modality":"strength","exercises":[{"id":"x","name":"Squat","targetSets":4,"targetReps":5,"targetWeight":245}]}]}
            """#.data(using: .utf8)!
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (resp, body)
        }
        let week = try await client(token: "t0k3n").getPlanWeek()
        XCTAssertEqual(week.days.count, 1)
        XCTAssertEqual(week.days[0].title, "Heavy lifts")
        XCTAssertEqual(week.days[0].exercises[0].targetWeight, 245)
    }

    func testGetPlanWeek401ThrowsUnauthorized() async {
        StubURLProtocol.handler = { req in
            (HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }
        do {
            _ = try await client(token: "bad").getPlanWeek()
            XCTFail("expected throw")
        } catch APIClientError.unauthorized {
            // ok
        } catch {
            XCTFail("expected .unauthorized, got \(error)")
        }
    }

    func testGetPlanWeek500ThrowsServer() async {
        StubURLProtocol.handler = { req in
            (HTTPURLResponse(url: req.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data())
        }
        do {
            _ = try await client(token: "ok").getPlanWeek()
            XCTFail("expected throw")
        } catch APIClientError.server(let code) where code == 500 {
            // ok
        } catch {
            XCTFail("expected .server(500), got \(error)")
        }
    }
}

// MARK: URLProtocol stub (shared with PairingClientTests + SyncCoordinatorTests)

final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let h = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown)); return
        }
        // URLSession moves httpBody → httpBodyStream before executing the
        // request; drain the stream so handlers can read httpBody normally.
        var req = request
        if req.httpBody == nil, let stream = req.httpBodyStream {
            stream.open()
            var body = Data()
            let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
            defer { buf.deallocate() }
            while stream.hasBytesAvailable {
                let n = stream.read(buf, maxLength: 4096)
                if n > 0 { body.append(buf, count: n) } else { break }
            }
            stream.close()
            req.httpBody = body
        }
        let (resp, data) = h(req)
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
