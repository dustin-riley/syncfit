import Foundation

protocol UserDefaultsStore {
    func data(forKey key: String) -> Data?
    func object(forKey key: String) -> Any?
    func set(_ value: Any?, forKey key: String)
    func removeObject(forKey key: String)
}

extension UserDefaults: UserDefaultsStore {}

struct PlanCache {
    private let store: UserDefaultsStore
    private let weekKey = "plan.week.json"
    private let fetchedAtKey = "plan.week.fetchedAt"

    init(store: UserDefaultsStore = UserDefaults.standard) {
        self.store = store
    }

    func load() -> (week: PlanWeek, fetchedAt: Date)? {
        guard let data = store.data(forKey: weekKey),
              let fetchedAt = store.object(forKey: fetchedAtKey) as? Date
        else { return nil }
        do {
            let week = try JSONDecoder().decode(PlanWeek.self, from: data)
            return (week, fetchedAt)
        } catch {
            // Corrupt — clear and start fresh
            clear()
            return nil
        }
    }

    func save(_ week: PlanWeek, fetchedAt: Date) {
        do {
            let data = try JSONEncoder().encode(week)
            store.set(data, forKey: weekKey)
            store.set(fetchedAt, forKey: fetchedAtKey)
        } catch {
            // Encoding shouldn't fail for our Codable shapes; if it does, no-op.
        }
    }

    func clear() {
        store.removeObject(forKey: weekKey)
        store.removeObject(forKey: fetchedAtKey)
    }
}
