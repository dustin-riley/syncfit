import Foundation
import HealthKit

// Wraps HKHealthStore behind the HealthKitReading protocol. The
// wrapping layer is intentionally thin: it adapts HKSample arrays to
// [HealthSample] using only fields MetricPicker needs.
final class HKHealthKitClient: HealthKitReading, @unchecked Sendable {
    private let store = HKHealthStore()

    private var hrvType: HKQuantityType {
        HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!
    }
    private var rhrType: HKQuantityType {
        HKQuantityType.quantityType(forIdentifier: .restingHeartRate)!
    }
    private var sleepType: HKCategoryType {
        HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)!
    }

    func requestAuthorization() async throws -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let read: Set<HKObjectType> = [hrvType, rhrType, sleepType]
        try await store.requestAuthorization(toShare: [], read: read)
        // HealthKit deliberately does NOT report read authorization
        // status — Apple's privacy model. We treat the call returning
        // without throw as success and rely on empty fetches at runtime.
        return true
    }

    func fetchSamples(endingAt now: Date) async throws -> [HealthSample] {
        let start = now.addingTimeInterval(-48 * 3600)
        let predicate = HKQuery.predicateForSamples(
            withStart: start, end: now, options: .strictEndDate
        )
        async let hrv = quantitySamples(type: hrvType, predicate: predicate, unit: .secondUnit(with: .milli))
        async let rhr = quantitySamples(type: rhrType, predicate: predicate, unit: HKUnit.count().unitDivided(by: .minute()))
        async let sleep = sleepSegments(predicate: predicate)
        let combined = try await hrv + (try await rhr) + (try await sleep)
        return combined
    }

    private func quantitySamples(
        type: HKQuantityType, predicate: NSPredicate, unit: HKUnit
    ) async throws -> [HealthSample] {
        try await withCheckedThrowingContinuation { cont in
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, error in
                if let error = error { cont.resume(throwing: error); return }
                let mapped: [HealthSample] = (samples ?? []).compactMap { s in
                    guard let q = s as? HKQuantitySample else { return nil }
                    let kind: HealthSample.Kind = type == self.hrvType ? .hrv : .rhr
                    return HealthSample(
                        kind: kind,
                        value: q.quantity.doubleValue(for: unit),
                        start: q.startDate,
                        end: q.endDate
                    )
                }
                cont.resume(returning: mapped)
            }
            self.store.execute(query)
        }
    }

    private func sleepSegments(predicate: NSPredicate) async throws -> [HealthSample] {
        try await withCheckedThrowingContinuation { cont in
            let query = HKSampleQuery(
                sampleType: sleepType, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, error in
                if let error = error { cont.resume(throwing: error); return }
                // Filter to "asleep*" categories; ignore inBed.
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                ]
                let mapped: [HealthSample] = (samples ?? []).compactMap { s in
                    guard let c = s as? HKCategorySample else { return nil }
                    guard asleepValues.contains(c.value) else { return nil }
                    let durationSec = c.endDate.timeIntervalSince(c.startDate)
                    return HealthSample(
                        kind: .asleep, value: durationSec,
                        start: c.startDate, end: c.endDate
                    )
                }
                cont.resume(returning: mapped)
            }
            self.store.execute(query)
        }
    }
}
