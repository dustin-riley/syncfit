import Foundation

struct LiveWorkoutPersistence: Sendable {
    let directory: URL
    let maxAge: TimeInterval

    init(
        directory: URL = LiveWorkoutPersistence.defaultDirectory(),
        maxAge: TimeInterval = 6 * 60 * 60
    ) {
        self.directory = directory
        self.maxAge = maxAge
    }

    static func defaultDirectory() -> URL {
        // Documents/. Safe in app sandbox; survives launches; NOT in caches
        // (we never want the OS to evict an in-progress workout).
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    var fileURL: URL { directory.appendingPathComponent("live-workout.json") }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        // .deferredToDate encodes Date as timeIntervalSinceReferenceDate (a
        // Double). This preserves the exact value since the JSON number is
        // decoded back to the same Double bitwise — no truncation.
        e.dateEncodingStrategy = .deferredToDate
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .deferredToDate
        return d
    }()

    func load(now: Date = Date()) -> LiveWorkoutDraft? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        do {
            let data = try Data(contentsOf: fileURL)
            let draft = try Self.decoder.decode(LiveWorkoutDraft.self, from: data)
            if draft.schemaVersion != LiveWorkoutDraft.currentSchemaVersion {
                clear(); return nil
            }
            if now.timeIntervalSince(draft.startedAt) > maxAge {
                clear(); return nil
            }
            return draft
        } catch {
            // Corrupted JSON, key mismatch, etc. — discard and start fresh.
            clear()
            return nil
        }
    }

    func save(_ draft: LiveWorkoutDraft) {
        do {
            let data = try Self.encoder.encode(draft)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Write failure is non-fatal — in-memory state continues.
            // Next successful write recovers.
            print("LiveWorkoutPersistence.save failed: \(error)")
        }
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
