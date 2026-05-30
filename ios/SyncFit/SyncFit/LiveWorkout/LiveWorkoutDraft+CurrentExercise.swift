import Foundation

extension LiveWorkoutDraft {
    // The topmost exercise where loggedSets.count < (targetSets ?? Int.max).
    // Auto-advances when an exercise hits its planned set count. Tapping an
    // upcoming exercise overrides this — see LiveWorkoutStore for the override
    // path; this computed property is the default.
    var currentExerciseIndex: Int? {
        exercises.firstIndex { e in
            e.loggedSets.count < (e.targetSets ?? Int.max)
        }
    }
}
