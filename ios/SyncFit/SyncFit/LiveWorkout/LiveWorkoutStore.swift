import Foundation
import SwiftUI

enum LiveWorkoutFinishResult {
    case success
    case unauthorized
    case transport(String)
    case server(Int)
    case decoding(String)
    case empty           // nothing to submit (defensive — UI prevents this)
}

@MainActor
final class LiveWorkoutStore: ObservableObject {
    @Published private(set) var draft: LiveWorkoutDraft?
    // Set by navigate(toExerciseIndex:) so a tapped card stays expanded even
    // after its planned sets are done. Cleared by logPending (re-engage
    // auto-advance), discard, and all start/resume paths.
    @Published private(set) var manualCurrentIndex: Int?

    private let persistence: LiveWorkoutPersistence
    private let postWorkout: (PostWorkoutRequest) async throws -> PostWorkoutResponse

    init(
        persistence: LiveWorkoutPersistence = LiveWorkoutPersistence(),
        postWorkout: @escaping (PostWorkoutRequest) async throws -> PostWorkoutResponse
    ) {
        self.persistence = persistence
        self.postWorkout = postWorkout
    }

    // MARK: load on launch

    // Restores an in-progress draft from disk (or returns nil if missing /
    // expired / mismatched schema / corrupted). Does NOT auto-present the
    // sheet — the caller (AppSession) exposes a separate
    // `liveDraftAvailable` for the Home banner.
    func restoreFromDisk(now: Date = Date()) -> LiveWorkoutDraft? {
        return persistence.load(now: now)
    }

    // MARK: lifecycle

    func startFromPlan(_ planDay: PlanDay, now: Date = Date()) {
        guard draft == nil else { return }
        let d = LiveWorkoutDraft.startFromPlan(planDay: planDay, now: now)
        draft = d
        manualCurrentIndex = nil
        persistence.save(d)
    }

    func startBlank(now: Date = Date()) {
        guard draft == nil else { return }
        let d = LiveWorkoutDraft.startBlank(now: now)
        draft = d
        manualCurrentIndex = nil
        persistence.save(d)
    }

    // Re-attach an existing on-disk draft (the Resume path).
    func resume(_ d: LiveWorkoutDraft) {
        guard draft == nil else { return }
        draft = d
        manualCurrentIndex = nil
        persistence.save(d) // touch
    }

    func discard() {
        draft = nil
        manualCurrentIndex = nil
        persistence.clear()
    }

    // MARK: edits

    private func mutate(_ block: (inout LiveWorkoutDraft) -> Void) {
        guard var d = draft else { return }
        block(&d)
        draft = d
        persistence.save(d)
    }

    func setTitle(_ s: String) { mutate { $0.title = s } }

    func preparePending(forExerciseIndex i: Int) {
        mutate { $0.preparePendingIfNeeded(forExerciseIndex: i) }
    }
    func setPendingWeight(_ w: Double, forExerciseIndex i: Int) {
        mutate { $0.setPendingWeight(w, forExerciseIndex: i) }
    }
    func setPendingReps(_ r: Int, forExerciseIndex i: Int) {
        mutate { $0.setPendingReps(r, forExerciseIndex: i) }
    }
    func logPending(forExerciseIndex i: Int, now: Date = Date()) {
        mutate { $0.promotePending(forExerciseIndex: i, now: now) }
        // Re-engage auto-advance: if the user just logged the last planned set,
        // currentExerciseIndex goes nil and the last-exercise fallback kicks in.
        manualCurrentIndex = nil
    }
    func navigate(toExerciseIndex i: Int, now: Date = Date()) {
        // Auto-commit dirty pending on the currently-current exercise before
        // moving. We auto-commit on ALL exercises to be safe (idempotent on
        // not-dirty), since navigation can jump non-adjacently.
        mutate { d in
            for j in d.exercises.indices {
                d.autoCommitDirty(forExerciseIndex: j, now: now)
            }
            d.preparePendingIfNeeded(forExerciseIndex: i)
        }
        // Manual override wins over the computed auto-advance index so a tapped
        // .done or .upcoming card becomes .current (spec §5.3 / §5.4).
        manualCurrentIndex = i
    }
    func addExercise(name: String) { mutate { $0.addExercise(name: name) } }
    func removeExercise(at i: Int) { mutate { $0.removeExercise(at: i) } }
    func moveExercise(from src: Int, to dst: Int) { mutate { $0.moveExercise(from: src, to: dst) } }
    func renameExercise(at i: Int, to s: String) { mutate { $0.renameExercise(at: i, to: s) } }
    func editLoggedSet(exerciseIndex i: Int, setId: UUID, weight: Double, reps: Int) {
        mutate { $0.editLoggedSet(exerciseIndex: i, setId: setId, weight: weight, reps: reps) }
    }

    // MARK: finish

    // Persists the auto-committed payload to disk BEFORE the POST so a crash
    // mid-POST doesn't lose the pending sets we just promoted.
    func finish(now: Date = Date()) async -> LiveWorkoutFinishResult {
        guard let d = draft else { return .empty }
        let (payload, mutated) = d.flattenForPost(now: now)
        guard !payload.isEmpty else { return .empty }
        draft = mutated
        persistence.save(mutated)

        let req = PostWorkoutRequest(
            performedAt: mutated.startedAt,
            title: mutated.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "Workout"
                : mutated.title,
            sets: payload
        )
        do {
            let resp = try await postWorkout(req)
            if resp.ok && (resp.added >= 1 || resp.skipped >= 1) {
                draft = nil
                persistence.clear()
                return .success
            }
            return .server(0)
        } catch APIClientError.unauthorized {
            return .unauthorized
        } catch APIClientError.badRequest {
            return .server(400)
        } catch APIClientError.transport(let m) {
            return .transport(m)
        } catch APIClientError.server(let code) {
            return .server(code)
        } catch APIClientError.decoding(let m) {
            return .decoding(m)
        } catch {
            return .transport(String(describing: error))
        }
    }
}
