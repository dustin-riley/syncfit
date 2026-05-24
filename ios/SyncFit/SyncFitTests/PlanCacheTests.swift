import XCTest
@testable import SyncFit

final class PlanCacheTests: XCTestCase {

    private final class InMemoryStore: UserDefaultsStore {
        var dataMap: [String: Data] = [:]
        var objMap: [String: Any] = [:]
        func data(forKey key: String) -> Data? { dataMap[key] }
        func object(forKey key: String) -> Any? { objMap[key] ?? dataMap[key] }
        func set(_ value: Any?, forKey key: String) {
            if let d = value as? Data { dataMap[key] = d }
            else if let v = value { objMap[key] = v }
            else { dataMap.removeValue(forKey: key); objMap.removeValue(forKey: key) }
        }
        func removeObject(forKey key: String) {
            dataMap.removeValue(forKey: key)
            objMap.removeValue(forKey: key)
        }
    }

    private func sampleWeek() -> PlanWeek {
        PlanWeek(days: [
            PlanDay(dayOfWeek: 1, title: "Heavy lifts", notes: "", modality: "strength",
                exercises: [PlanExercise(id: "x", name: "Squat",
                    targetSets: 4, targetReps: 5, targetWeight: 245)])
        ])
    }

    func testSaveLoadRoundTrip() {
        let store = InMemoryStore()
        let cache = PlanCache(store: store)
        let week = sampleWeek()
        let at = Date(timeIntervalSince1970: 1_716_500_000)
        cache.save(week, fetchedAt: at)
        let loaded = cache.load()
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.week, week)
        XCTAssertEqual(loaded?.fetchedAt, at)
    }

    func testLoadReturnsNilWhenEmpty() {
        let cache = PlanCache(store: InMemoryStore())
        XCTAssertNil(cache.load())
    }

    func testLoadReturnsNilAndClearsOnCorruptData() {
        let store = InMemoryStore()
        store.dataMap["plan.week.json"] = Data("not json".utf8)
        store.objMap["plan.week.fetchedAt"] = Date()
        let cache = PlanCache(store: store)
        XCTAssertNil(cache.load())
        XCTAssertNil(store.dataMap["plan.week.json"])
        XCTAssertNil(store.objMap["plan.week.fetchedAt"])
    }

    func testClearRemovesBothKeys() {
        let store = InMemoryStore()
        let cache = PlanCache(store: store)
        cache.save(sampleWeek(), fetchedAt: Date())
        cache.clear()
        XCTAssertNil(store.dataMap["plan.week.json"])
        XCTAssertNil(store.objMap["plan.week.fetchedAt"])
    }
}
