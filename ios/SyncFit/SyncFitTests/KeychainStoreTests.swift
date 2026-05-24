import XCTest
@testable import SyncFit

final class KeychainStoreTests: XCTestCase {
    // Use a per-test service string so concurrent runs and prior runs
    // don't pollute each other.
    var store: KeychainStore!

    override func setUp() {
        let service = "com.dustinriley.syncfit.tests.\(UUID().uuidString)"
        store = KeychainStore(service: service)
        store.clear()
    }

    override func tearDown() {
        store.clear()
    }

    func testRoundTrip() throws {
        try store.save(token: "hello-world")
        XCTAssertEqual(store.load(), "hello-world")
    }

    func testOverwrite() throws {
        try store.save(token: "first")
        try store.save(token: "second")
        XCTAssertEqual(store.load(), "second")
    }

    func testClear() throws {
        try store.save(token: "value")
        store.clear()
        XCTAssertNil(store.load())
    }

    func testLoadReturnsNilWhenAbsent() {
        XCTAssertNil(store.load())
    }
}
