# iOS Companion — App Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the native Swift / SwiftUI iOS companion app under `ios/SyncFit/` per `docs/superpowers/specs/2026-05-23-ios-companion-app-design.md` §§6–10. The app reads HealthKit (HRV, RHR, sleep duration), applies the per-metric fallback ladder on device, and posts daily values to the backend endpoints shipped in Plan A.

**Architecture:** Standard SwiftUI App with `@main` entrypoint, environment-injected dependencies, protocol-backed HealthKit and networking clients, a pure `MetricPicker` module (the unit-test target), Keychain-backed token storage, and four views (Root, Permission, Pairing, Home). Project generated via XcodeGen so the source of truth is a small `project.yml` checked into git and the `.xcodeproj` is regenerated (gitignored).

**Tech Stack:** Swift 5.9+, SwiftUI, iOS 17+, HealthKit, URLSession. XcodeGen for project generation. XCTest for unit tests. No third-party Swift packages (intentional — keeps the build surface small).

**Bundle ID:** `com.dustinriley.syncfit`
**Apple Developer enrollment:** Deferred — Plan B builds and tests in the iOS Simulator only (no signing). TestFlight distribution becomes a follow-up once enrollment lands.

**Spec:** `docs/superpowers/specs/2026-05-23-ios-companion-app-design.md`
**Companion plan:** `docs/superpowers/plans/2026-05-23-ios-companion-backend.md` (Plan A — backend endpoints this app talks to).

---

## File Structure

```
ios/
├── .gitignore                          # gitignores generated .xcodeproj + DerivedData
├── README.md                           # how to generate the project + run tests
└── SyncFit/
    ├── project.yml                     # XcodeGen source of truth
    ├── SyncFit/                        # app target source
    │   ├── SyncFitApp.swift            # @main + environment wiring
    │   ├── Info.plist                  # HealthKit usage strings (referenced by project.yml)
    │   ├── Config.swift                # API base URL + APP_TZ build constant
    │   ├── Models/
    │   │   ├── HealthMetricUpload.swift
    │   │   └── PairResponse.swift
    │   ├── Health/
    │   │   ├── HealthKitReading.swift  # protocol
    │   │   ├── HealthKitClient.swift   # HKHealthStore-backed impl
    │   │   └── MetricPicker.swift      # pure fallback ladder
    │   ├── Net/
    │   │   ├── APIClient.swift         # bearer-auth POST /api/health/sync
    │   │   └── PairingClient.swift     # POST /api/devices/pair
    │   ├── Keychain/
    │   │   └── KeychainStore.swift
    │   ├── Coordinator/
    │   │   └── SyncCoordinator.swift
    │   └── Views/
    │       ├── RootView.swift
    │       ├── PermissionView.swift
    │       ├── PairingView.swift
    │       └── HomeView.swift
    └── SyncFitTests/                   # XCTest target
        ├── KeychainStoreTests.swift
        ├── MetricPickerTests.swift
        ├── APIClientTests.swift
        ├── PairingClientTests.swift
        ├── SyncCoordinatorTests.swift
        └── ModelsTests.swift
```

**Generated (gitignored):**

- `ios/SyncFit/SyncFit.xcodeproj/`
- `ios/SyncFit/DerivedData/`, `ios/SyncFit/build/`

---

## Task 1: Bootstrap Xcode project (XcodeGen, HealthKit cap, Info.plist)

**Files:**

- Create: `ios/.gitignore`
- Create: `ios/README.md`
- Create: `ios/SyncFit/project.yml`
- Create: `ios/SyncFit/SyncFit/Info.plist`
- Create: `ios/SyncFit/SyncFit/Config.swift`
- Create: `ios/SyncFit/SyncFit/SyncFitApp.swift` (minimal stub — fleshed out in Task 10)

- [ ] **Step 1: Ensure XcodeGen is available.**

  Run:

  ```bash
  command -v xcodegen >/dev/null 2>&1 || brew install xcodegen
  xcodegen --version
  ```

  Expected: version prints (e.g., `Version: 2.42.0`). If `brew install` is blocked or unavailable, report BLOCKED with the install command for the user to run via `!`.

- [ ] **Step 2: Create `ios/.gitignore`.**

  Write:

  ```
  # XcodeGen-generated project — regenerated from project.yml
  *.xcodeproj/
  *.xcworkspace/

  # Xcode build outputs
  DerivedData/
  build/
  *.xcuserdatad
  xcuserdata/

  # Swift Package Manager
  .build/
  Package.resolved

  # macOS noise
  .DS_Store
  ```

- [ ] **Step 3: Create `ios/README.md`.**

  Write:

  ````markdown
  # SyncFit iOS companion

  Native Swift / SwiftUI app that reads Apple Health data and uploads daily HRV /
  RHR / sleep values to the SyncFit backend. See
  `../docs/superpowers/specs/2026-05-23-ios-companion-app-design.md` for the
  authoritative scope.

  ## Build

  ```bash
  cd ios/SyncFit
  xcodegen generate                 # produces SyncFit.xcodeproj from project.yml
  open SyncFit.xcodeproj            # opens in Xcode, optional
  ```
  ````

  ## Tests

  ```bash
  cd ios/SyncFit
  xcodebuild test \
    -project SyncFit.xcodeproj \
    -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15'
  ```

  ## Configuration

  The API base URL is a Swift constant in `SyncFit/Config.swift`. Change it for
  local dev (e.g., a tunnel to `npm run dev`) or for the deployed Vercel URL.

  ```

  ```

- [ ] **Step 4: Create `ios/SyncFit/SyncFit/Info.plist`.**

  Write:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>NSHealthShareUsageDescription</key>
    <string>SyncFit reads your heart rate variability, resting heart rate, and sleep data to gauge your training readiness.</string>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UIApplicationSceneManifest</key>
    <dict>
      <key>UIApplicationSupportsMultipleScenes</key>
      <false/>
    </dict>
    <key>UISupportedInterfaceOrientations</key>
    <array>
      <string>UIInterfaceOrientationPortrait</string>
    </array>
  </dict>
  </plist>
  ```

- [ ] **Step 5: Create `ios/SyncFit/project.yml`.**

  Write:

  ```yaml
  name: SyncFit
  options:
    bundleIdPrefix: com.dustinriley
    deploymentTarget:
      iOS: "17.0"
    createIntermediateGroups: true
  settings:
    base:
      SWIFT_VERSION: "5.9"
      DEVELOPMENT_TEAM: ""
      CODE_SIGN_STYLE: Automatic
  targets:
    SyncFit:
      type: application
      platform: iOS
      sources:
        - path: SyncFit
      info:
        path: SyncFit/Info.plist
        # All Info.plist values are checked-in; project.yml does not override.
      settings:
        base:
          PRODUCT_BUNDLE_IDENTIFIER: com.dustinriley.syncfit
          INFOPLIST_FILE: SyncFit/Info.plist
          ENABLE_PREVIEWS: "YES"
          TARGETED_DEVICE_FAMILY: "1" # iPhone only in v1
      entitlements:
        path: SyncFit/SyncFit.entitlements
        properties:
          com.apple.developer.healthkit: true
          com.apple.developer.healthkit.access: []
    SyncFitTests:
      type: bundle.unit-test
      platform: iOS
      sources:
        - path: SyncFitTests
      dependencies:
        - target: SyncFit
      settings:
        base:
          PRODUCT_BUNDLE_IDENTIFIER: com.dustinriley.syncfit.tests
          BUNDLE_LOADER: $(TEST_HOST)
          TEST_HOST: $(BUILT_PRODUCTS_DIR)/SyncFit.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/SyncFit
  ```

  (XcodeGen will generate the `.entitlements` file automatically from the `entitlements.properties` block.)

- [ ] **Step 6: Create `ios/SyncFit/SyncFit/Config.swift`.**

  Write:

  ```swift
  import Foundation

  enum Config {
      // The SyncFit backend. Change for local dev (e.g., an ngrok tunnel to
      // `npm run dev`) or for the deployed Vercel URL.
      //
      // NOTE: when pointing at localhost, also add `NSAppTransportSecurity` /
      // `NSAllowsArbitraryLoads` to Info.plist, or use an https tunnel.
      static let apiBaseURL = URL(string: "https://syncfit.vercel.app")!

      // Server's source-of-truth timezone. Matches the backend's APP_TZ
      // constant in src/lib/units.ts. iOS computes metricDate strings in
      // this zone before upload.
      static let appTimeZone = TimeZone(identifier: "America/New_York")!
  }
  ```

- [ ] **Step 7: Create the minimal `ios/SyncFit/SyncFit/SyncFitApp.swift` stub.**

  This is just enough to make the project build; Task 10 expands it.

  ```swift
  import SwiftUI

  @main
  struct SyncFitApp: App {
      var body: some Scene {
          WindowGroup {
              Text("SyncFit")
                  .padding()
          }
      }
  }
  ```

- [ ] **Step 8: Generate the project and build.**

  ```bash
  cd ios/SyncFit
  xcodegen generate
  xcodebuild build \
    -project SyncFit.xcodeproj \
    -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -quiet
  ```

  Expected: build succeeds. If `iPhone 15` is not an available simulator on this Mac, use `xcrun simctl list devices | grep -E 'iPhone [0-9]+'` to find an available one and substitute. If no iOS Simulators are installed at all, report BLOCKED — the user mentioned an iOS Simulator download was in progress when this work started; confirm it completed.

- [ ] **Step 9: Commit.**

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/.gitignore ios/README.md \
          ios/SyncFit/project.yml \
          ios/SyncFit/SyncFit/Info.plist \
          ios/SyncFit/SyncFit/Config.swift \
          ios/SyncFit/SyncFit/SyncFitApp.swift
  git commit -m "feat(ios-app): bootstrap Xcode project + HealthKit capability

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

  Confirm `git status` shows no `*.xcodeproj/` files tracked (the `.gitignore` should keep them out).

---

## Task 2: Codable payload models

**Files:**

- Create: `ios/SyncFit/SyncFitTests/ModelsTests.swift`
- Create: `ios/SyncFit/SyncFit/Models/HealthMetricUpload.swift`
- Create: `ios/SyncFit/SyncFit/Models/PairResponse.swift`

TDD: failing test → run-fails → implement → run-passes → commit.

- [ ] **Step 1: Write the failing test first.**

  Create `ios/SyncFit/SyncFitTests/ModelsTests.swift`:

  ```swift
  import XCTest
  @testable import SyncFit

  final class ModelsTests: XCTestCase {

      func testHealthMetricUploadEncodesWireFormat() throws {
          let upload = HealthMetricUpload(
              metricDate: "2026-05-23",
              type: .hrv,
              value: 42.5,
              source: "primary",
              freshness: .fresh,
              recordedAt: ISO8601DateFormatter().date(from: "2026-05-23T06:14:00Z")!
          )
          let encoder = JSONEncoder()
          encoder.dateEncodingStrategy = .iso8601
          encoder.outputFormatting = [.sortedKeys]
          let data = try encoder.encode(upload)
          let json = String(data: data, encoding: .utf8)!
          XCTAssertTrue(json.contains("\"metricDate\":\"2026-05-23\""))
          XCTAssertTrue(json.contains("\"type\":\"hrv\""))
          XCTAssertTrue(json.contains("\"value\":42.5"))
          XCTAssertTrue(json.contains("\"source\":\"primary\""))
          XCTAssertTrue(json.contains("\"freshness\":\"fresh\""))
          XCTAssertTrue(json.contains("\"recordedAt\":\"2026-05-23T06:14:00Z\""))
      }

      func testHealthMetricTypeRawValuesMatchBackend() {
          XCTAssertEqual(HealthMetricType.hrv.rawValue, "hrv")
          XCTAssertEqual(HealthMetricType.rhr.rawValue, "rhr")
          XCTAssertEqual(HealthMetricType.sleepDurationSeconds.rawValue, "sleep_duration_seconds")
      }

      func testFreshnessRawValuesMatchBackend() {
          XCTAssertEqual(Freshness.fresh.rawValue, "fresh")
          XCTAssertEqual(Freshness.stale24h.rawValue, "stale_24h")
          XCTAssertEqual(Freshness.stale48h.rawValue, "stale_48h")
      }

      func testPairResponseDecodes() throws {
          let json = #"{"token":"abc123XYZ_-"}"#.data(using: .utf8)!
          let decoded = try JSONDecoder().decode(PairResponse.self, from: json)
          XCTAssertEqual(decoded.token, "abc123XYZ_-")
      }
  }
  ```

- [ ] **Step 2: Build the test target and confirm it fails.**

  ```bash
  cd ios/SyncFit
  xcodebuild test \
    -project SyncFit.xcodeproj \
    -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -only-testing:SyncFitTests/ModelsTests \
    -quiet 2>&1 | tail -20
  ```

  Expected: build fails with "cannot find HealthMetricUpload in scope" (or similar). If the project doesn't regenerate to include the new test file, run `xcodegen generate` first.

- [ ] **Step 3: Implement the models.**

  Create `ios/SyncFit/SyncFit/Models/HealthMetricUpload.swift`:

  ```swift
  import Foundation

  // Matches the backend zod schema in src/app/api/health/sync/route.ts.
  // Field names match the wire format exactly — JSONEncoder default key
  // encoding leaves them camelCase.

  enum HealthMetricType: String, Codable {
      case hrv
      case rhr
      case sleepDurationSeconds = "sleep_duration_seconds"
  }

  enum Freshness: String, Codable {
      case fresh
      case stale24h = "stale_24h"
      case stale48h = "stale_48h"
  }

  struct HealthMetricUpload: Codable, Equatable {
      let metricDate: String           // 'YYYY-MM-DD' in APP_TZ
      let type: HealthMetricType
      let value: Double
      let source: String               // free-form ladder step label
      let freshness: Freshness
      let recordedAt: Date             // ISO8601 on the wire
  }

  struct SyncRequest: Codable {
      let uploads: [HealthMetricUpload]
  }

  struct SyncResponse: Codable {
      let accepted: Int
      let updated: Int
  }
  ```

  Create `ios/SyncFit/SyncFit/Models/PairResponse.swift`:

  ```swift
  import Foundation

  struct PairRequest: Codable {
      let code: String
      let deviceName: String
  }

  struct PairResponse: Codable {
      let token: String
  }
  ```

- [ ] **Step 4: Regenerate the project so it picks up the new files, then run tests.**

  ```bash
  cd ios/SyncFit
  xcodegen generate
  xcodebuild test \
    -project SyncFit.xcodeproj \
    -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -only-testing:SyncFitTests/ModelsTests \
    -quiet
  ```

  Expected: 4 cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/SyncFit/SyncFit/Models/ ios/SyncFit/SyncFitTests/ModelsTests.swift
  git commit -m "feat(ios-app): Codable payload models matching backend wire format

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3: KeychainStore + XCTest round-trip (TDD)

**Files:**

- Create: `ios/SyncFit/SyncFitTests/KeychainStoreTests.swift`
- Create: `ios/SyncFit/SyncFit/Keychain/KeychainStore.swift`

- [ ] **Step 1: Failing test.**

  Create `ios/SyncFit/SyncFitTests/KeychainStoreTests.swift`:

  ```swift
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
  ```

- [ ] **Step 2: Confirm test fails.**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -only-testing:SyncFitTests/KeychainStoreTests -quiet 2>&1 | tail -10
  ```

  Expected: cannot find `KeychainStore`.

- [ ] **Step 3: Implement.**

  Create `ios/SyncFit/SyncFit/Keychain/KeychainStore.swift`:

  ```swift
  import Foundation
  import Security

  // Typed Keychain wrapper. v1 stores only the bearer device token; the
  // single account name is hardcoded so the API is `save / load / clear`
  // rather than dictionary-style.
  struct KeychainStore {
      let service: String
      let account = "deviceToken"

      init(service: String = "com.dustinriley.syncfit") {
          self.service = service
      }

      func save(token: String) throws {
          let data = Data(token.utf8)
          // Try update first; if no existing item, fall back to add.
          let query: [String: Any] = [
              kSecClass as String: kSecClassGenericPassword,
              kSecAttrService as String: service,
              kSecAttrAccount as String: account,
          ]
          let updateStatus = SecItemUpdate(
              query as CFDictionary,
              [kSecValueData as String: data] as CFDictionary
          )
          if updateStatus == errSecItemNotFound {
              var add = query
              add[kSecValueData as String] = data
              let addStatus = SecItemAdd(add as CFDictionary, nil)
              guard addStatus == errSecSuccess else {
                  throw KeychainError.osStatus(addStatus)
              }
              return
          }
          guard updateStatus == errSecSuccess else {
              throw KeychainError.osStatus(updateStatus)
          }
      }

      func load() -> String? {
          let query: [String: Any] = [
              kSecClass as String: kSecClassGenericPassword,
              kSecAttrService as String: service,
              kSecAttrAccount as String: account,
              kSecReturnData as String: true,
              kSecMatchLimit as String: kSecMatchLimitOne,
          ]
          var item: AnyObject?
          let status = SecItemCopyMatching(query as CFDictionary, &item)
          guard status == errSecSuccess, let data = item as? Data else { return nil }
          return String(data: data, encoding: .utf8)
      }

      func clear() {
          let query: [String: Any] = [
              kSecClass as String: kSecClassGenericPassword,
              kSecAttrService as String: service,
              kSecAttrAccount as String: account,
          ]
          SecItemDelete(query as CFDictionary)
      }

      enum KeychainError: Error, Equatable {
          case osStatus(OSStatus)
      }
  }
  ```

- [ ] **Step 4: Run tests, confirm 4 cases pass.**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -only-testing:SyncFitTests/KeychainStoreTests -quiet
  ```

- [ ] **Step 5: Commit.**

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/SyncFit/SyncFit/Keychain/ ios/SyncFit/SyncFitTests/KeychainStoreTests.swift
  git commit -m "feat(ios-app): KeychainStore for bearer device token

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4: HealthKitReading protocol + HKHealthKitClient impl

**Files:**

- Create: `ios/SyncFit/SyncFit/Health/HealthKitReading.swift`
- Create: `ios/SyncFit/SyncFit/Health/HealthKitClient.swift`

No XCTest in this task — `HKHealthStore` cannot be exercised in a simulator unit test without HealthKit permissions UI. The protocol exists specifically so `MetricPicker` (Task 5) and `SyncCoordinator` (Task 8) can be unit-tested against a fake.

- [ ] **Step 1: Define the protocol.**

  Create `ios/SyncFit/SyncFit/Health/HealthKitReading.swift`:

  ```swift
  import Foundation

  // Minimal value-typed view of a HealthKit sample, decoupled from
  // HealthKit's `HKSample` so MetricPicker stays testable without
  // importing HealthKit in tests.
  struct HealthSample: Equatable {
      enum Kind: Equatable {
          case hrv          // ms (SDNN)
          case rhr          // bpm
          case asleep       // a sleep "asleep*" segment; value = duration seconds
      }
      let kind: Kind
      let value: Double
      let start: Date
      let end: Date
      // Sleep segments use end; HRV/RHR use the sample's endDate too. Treat
      // `end` as the canonical timestamp for "when was this measured".
  }

  protocol HealthKitReading {
      // Fetches the trailing-48h window of relevant samples (HRV + RHR +
      // sleep segments). Implementations decide how to range-query each
      // type internally.
      func fetchSamples(endingAt now: Date) async throws -> [HealthSample]

      // Requests read authorization. Idempotent — safe to call multiple
      // times. Returns true if all three types have been authorized.
      func requestAuthorization() async throws -> Bool
  }
  ```

- [ ] **Step 2: Implement the real `HKHealthKitClient`.**

  Create `ios/SyncFit/SyncFit/Health/HealthKitClient.swift`:

  ```swift
  import Foundation
  import HealthKit

  // Wraps HKHealthStore behind the HealthKitReading protocol. The
  // wrapping layer is intentionally thin: it adapts HKSample arrays to
  // [HealthSample] using only fields MetricPicker needs.
  final class HKHealthKitClient: HealthKitReading {
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
  ```

- [ ] **Step 3: Regenerate + build (no test target this task).**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild build -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' -quiet
  ```

  Expected: build succeeds.

- [ ] **Step 4: Commit.**

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/SyncFit/SyncFit/Health/
  git commit -m "feat(ios-app): HealthKitReading protocol + HKHealthKitClient

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 5: MetricPicker (pure) + XCTest fallback-ladder coverage (TDD)

**Files:**

- Create: `ios/SyncFit/SyncFitTests/MetricPickerTests.swift`
- Create: `ios/SyncFit/SyncFit/Health/MetricPicker.swift`

This is the highest-value test target in the plan — the entire fallback ladder semantics live here.

- [ ] **Step 1: Failing test.**

  Create `ios/SyncFit/SyncFitTests/MetricPickerTests.swift`:

  ```swift
  import XCTest
  @testable import SyncFit

  final class MetricPickerTests: XCTestCase {

      // 2026-05-23 12:00 ET. Reused as the reference `now` across cases.
      let now = ISO8601DateFormatter().date(from: "2026-05-23T16:00:00Z")!

      private func sample(_ kind: HealthSample.Kind, _ value: Double, end: String, durationSec: Double = 0) -> HealthSample {
          let endDate = ISO8601DateFormatter().date(from: end)!
          let startDate = kind == .asleep
              ? endDate.addingTimeInterval(-durationSec)
              : endDate
          return HealthSample(kind: kind, value: value, start: startDate, end: endDate)
      }

      // MARK: HRV

      func testHrvPrefersLastNightSleepWindowSample() {
          let samples: [HealthSample] = [
              // last night's sleep window roughly 22:00 prior day → 08:00 today
              sample(.hrv, 42.5, end: "2026-05-23T07:30:00Z"),
              sample(.hrv, 60.0, end: "2026-05-22T18:00:00Z"),  // earlier, ignored
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(picked.hrv?.value, 42.5)
          XCTAssertEqual(picked.hrv?.source, "primary")
          XCTAssertEqual(picked.hrv?.freshness, .fresh)
      }

      func testHrvFallsBackToMorningTodaySampleBeforeWorkout() {
          // No sample in the sleep window; one this morning during the day.
          let samples: [HealthSample] = [
              sample(.hrv, 38.0, end: "2026-05-23T13:30:00Z"),  // post-sleep window, before now
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(picked.hrv?.value, 38.0)
          XCTAssertEqual(picked.hrv?.source, "fallback_morning")
          XCTAssertEqual(picked.hrv?.freshness, .fresh)
      }

      func testHrvFallsBackToStale48h() {
          let samples: [HealthSample] = [
              // 40 hours ago — past today's sleep window, within 48h
              sample(.hrv, 45.0, end: "2026-05-22T00:00:00Z"),
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(picked.hrv?.value, 45.0)
          XCTAssertEqual(picked.hrv?.source, "fallback_48h")
          XCTAssertEqual(picked.hrv?.freshness, .stale48h)
      }

      func testHrvMissingWhenNoSampleWithin72h() {
          let samples: [HealthSample] = []
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertNil(picked.hrv)
      }

      // MARK: RHR

      func testRhrTodayPrimary() {
          let samples: [HealthSample] = [
              sample(.rhr, 58, end: "2026-05-23T08:00:00Z"),
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(picked.rhr?.value, 58)
          XCTAssertEqual(picked.rhr?.source, "primary")
          XCTAssertEqual(picked.rhr?.freshness, .fresh)
      }

      func testRhrFallsBackToYesterdayWithStale24h() {
          let samples: [HealthSample] = [
              sample(.rhr, 56, end: "2026-05-22T08:00:00Z"),
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(picked.rhr?.value, 56)
          XCTAssertEqual(picked.rhr?.source, "fallback_24h")
          XCTAssertEqual(picked.rhr?.freshness, .stale24h)
      }

      func testRhrMissingWhenNoneInWindow() {
          let samples: [HealthSample] = []
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertNil(picked.rhr)
      }

      // MARK: Sleep

      func testSleepUsesLastNightAsleepSegments() {
          // Two asleep segments overnight, totalling 6h 12m (22320s)
          let samples: [HealthSample] = [
              sample(.asleep, 14400, end: "2026-05-23T05:00:00Z", durationSec: 14400), // 4h
              sample(.asleep, 7920, end: "2026-05-23T07:30:00Z", durationSec: 7920),   // 2h 12m
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(picked.sleep?.value, 22320)
          XCTAssertEqual(picked.sleep?.source, "primary")
          XCTAssertEqual(picked.sleep?.freshness, .fresh)
      }

      func testSleepMissingWhenNoLastNightSegments() {
          let samples: [HealthSample] = [
              // old segment, two nights ago
              sample(.asleep, 28000, end: "2026-05-22T05:00:00Z", durationSec: 28000),
          ]
          let picked = MetricPicker.pickToday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertNil(picked.sleep)
      }

      // MARK: Date assignment

      func testMetricDateInAppTz() {
          let d = MetricPicker.dateString(for: now, in: Config.appTimeZone)
          XCTAssertEqual(d, "2026-05-23")
      }

      // MARK: Yesterday's RHR re-sync (per spec §7B point 2)

      func testYesterdayRhrIsReportedSeparatelyWhenPresent() {
          // RHR samples for both today and yesterday — both should be uploaded.
          let samples: [HealthSample] = [
              sample(.rhr, 58, end: "2026-05-23T08:00:00Z"),
              sample(.rhr, 56, end: "2026-05-22T08:00:00Z"),
          ]
          let yesterday = MetricPicker.pickYesterday(samples: samples, now: now, appTz: Config.appTimeZone)
          XCTAssertEqual(yesterday.rhr?.value, 56)
          XCTAssertEqual(yesterday.rhr?.freshness, .fresh)  // for yesterday's date, this IS the primary
      }
  }
  ```

- [ ] **Step 2: Confirm tests fail.**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -only-testing:SyncFitTests/MetricPickerTests -quiet 2>&1 | tail -10
  ```

  Expected: cannot find `MetricPicker` in scope.

- [ ] **Step 3: Implement.**

  Create `ios/SyncFit/SyncFit/Health/MetricPicker.swift`:

  ```swift
  import Foundation

  // Pure: takes pre-fetched HealthKit samples and a reference `now`,
  // returns the chosen value per metric per the spec §6 fallback ladder.
  // No HealthKit imports; no I/O; fully unit-testable.
  enum MetricPicker {

      struct Picked: Equatable {
          let value: Double
          let source: String
          let freshness: Freshness
          let recordedAt: Date
      }

      struct PickedDay: Equatable {
          var hrv: Picked?
          var rhr: Picked?
          var sleep: Picked?
      }

      // YYYY-MM-DD in APP_TZ.
      static func dateString(for date: Date, in tz: TimeZone) -> String {
          var cal = Calendar(identifier: .gregorian)
          cal.timeZone = tz
          let comps = cal.dateComponents([.year, .month, .day], from: date)
          return String(format: "%04d-%02d-%02d", comps.year!, comps.month!, comps.day!)
      }

      // Sleep window: 22:00 prior day → end-of-last-asleep-segment (or 09:00
      // today if no sleep tracking). Returned in `now`'s timezone via APP_TZ.
      private static func sleepWindow(now: Date, samples: [HealthSample], tz: TimeZone) -> (Date, Date) {
          var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
          let todayComps = cal.dateComponents([.year, .month, .day], from: now)
          let today00 = cal.date(from: todayComps)!
          let priorDay22 = cal.date(byAdding: .hour, value: -2, to: today00)!  // yesterday 22:00
          let today09 = cal.date(byAdding: .hour, value: 9, to: today00)!

          let asleepInDay = samples
              .filter { $0.kind == .asleep && $0.end > priorDay22 && $0.end <= today09.addingTimeInterval(3*3600) }
          let windowEnd = asleepInDay.map(\.end).max() ?? today09
          return (priorDay22, windowEnd)
      }

      static func pickToday(samples: [HealthSample], now: Date, appTz tz: TimeZone) -> PickedDay {
          var out = PickedDay()
          let (winStart, winEnd) = sleepWindow(now: now, samples: samples, tz: tz)

          // --- HRV ---
          let hrvSamples = samples.filter { $0.kind == .hrv && $0.end <= now }
          if let s = hrvSamples.filter({ $0.end > winStart && $0.end <= winEnd }).max(by: { $0.end < $1.end }) {
              out.hrv = .init(value: s.value, source: "primary", freshness: .fresh, recordedAt: s.end)
          } else {
              // Morning today, before now
              let morning = hrvSamples
                  .filter { isSameAppDay($0.end, as: now, tz: tz) && $0.end > winEnd }
                  .sorted(by: { $0.end < $1.end })
                  .first
              if let s = morning {
                  out.hrv = .init(value: s.value, source: "fallback_morning", freshness: .fresh, recordedAt: s.end)
              } else {
                  // Trailing 48h
                  let cutoff48 = now.addingTimeInterval(-48 * 3600)
                  if let s = hrvSamples.filter({ $0.end >= cutoff48 }).max(by: { $0.end < $1.end }) {
                      out.hrv = .init(value: s.value, source: "fallback_48h", freshness: .stale48h, recordedAt: s.end)
                  }
              }
          }

          // --- RHR ---
          let rhrSamples = samples.filter { $0.kind == .rhr && $0.end <= now }
          if let s = rhrSamples.filter({ isSameAppDay($0.end, as: now, tz: tz) }).max(by: { $0.end < $1.end }) {
              out.rhr = .init(value: s.value, source: "primary", freshness: .fresh, recordedAt: s.end)
          } else {
              let yesterday = cal(in: tz).date(byAdding: .day, value: -1, to: now)!
              if let s = rhrSamples.filter({ isSameAppDay($0.end, as: yesterday, tz: tz) }).max(by: { $0.end < $1.end }) {
                  out.rhr = .init(value: s.value, source: "fallback_24h", freshness: .stale24h, recordedAt: s.end)
              }
          }

          // --- Sleep (sum of asleep* segments overlapping the sleep window) ---
          let sleepSegments = samples.filter {
              $0.kind == .asleep && $0.end > winStart && $0.end <= winEnd && $0.end > winStart
          }
          if !sleepSegments.isEmpty {
              let total = sleepSegments.reduce(0.0) { $0 + max(0, $1.value) }
              let last = sleepSegments.max(by: { $0.end < $1.end })!
              out.sleep = .init(value: total, source: "primary", freshness: .fresh, recordedAt: last.end)
          }

          return out
      }

      // Same picker, but reference date shifted to yesterday in APP_TZ. Used
      // to resync RHR (Apple finalizes the daily RHR late, per spec §7B-2).
      static func pickYesterday(samples: [HealthSample], now: Date, appTz tz: TimeZone) -> PickedDay {
          let yesterday = cal(in: tz).date(byAdding: .day, value: -1, to: now)!
          // Use the start of yesterday-evening as the "now" anchor so today's
          // window logic shifts back appropriately.
          return pickToday(samples: samples, now: yesterday, appTz: tz)
      }

      // MARK: helpers

      private static func cal(in tz: TimeZone) -> Calendar {
          var c = Calendar(identifier: .gregorian); c.timeZone = tz; return c
      }

      private static func isSameAppDay(_ a: Date, as b: Date, tz: TimeZone) -> Bool {
          dateString(for: a, in: tz) == dateString(for: b, in: tz)
      }
  }
  ```

- [ ] **Step 4: Run the tests, confirm all 11 cases pass.**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -only-testing:SyncFitTests/MetricPickerTests -quiet
  ```

  Some of these tests have subtle date-window expectations. If a case fails, do NOT loosen the assertion — re-read spec §6 and adjust the picker logic.

- [ ] **Step 5: Commit.**

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/SyncFit/SyncFit/Health/MetricPicker.swift \
          ios/SyncFit/SyncFitTests/MetricPickerTests.swift
  git commit -m "feat(ios-app): MetricPicker with fallback ladder + XCTest coverage

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 6: APIClient + XCTest

**Files:**

- Create: `ios/SyncFit/SyncFitTests/APIClientTests.swift`
- Create: `ios/SyncFit/SyncFit/Net/APIClient.swift`

Test via `URLProtocol` stub so no network is hit.

- [ ] **Step 1: Failing test.**

  Create `ios/SyncFit/SyncFitTests/APIClientTests.swift`:

  ```swift
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
  }

  // MARK: URLProtocol stub

  final class StubURLProtocol: URLProtocol {
      static var handler: ((URLRequest) -> (HTTPURLResponse, Data))?

      override class func canInit(with request: URLRequest) -> Bool { true }
      override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
      override func startLoading() {
          guard let h = Self.handler else {
              client?.urlProtocol(self, didFailWithError: URLError(.unknown)); return
          }
          let (resp, data) = h(request)
          client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
          client?.urlProtocol(self, didLoad: data)
          client?.urlProtocolDidFinishLoading(self)
      }
      override func stopLoading() {}
  }
  ```

- [ ] **Step 2: Confirm test fails (no `APIClient`).**

- [ ] **Step 3: Implement.**

  Create `ios/SyncFit/SyncFit/Net/APIClient.swift`:

  ```swift
  import Foundation

  enum APIClientError: Error, Equatable {
      case unauthorized
      case badRequest
      case server(Int)
      case decoding(String)
      case transport(String)
  }

  final class APIClient {
      let baseURL: URL
      private let token: String
      private let session: URLSession

      init(baseURL: URL, token: String, session: URLSession = .shared) {
          self.baseURL = baseURL
          self.token = token
          self.session = session
      }

      func healthSync(uploads: [HealthMetricUpload]) async throws -> SyncResponse {
          let url = baseURL.appendingPathComponent("/api/health/sync")
          var req = URLRequest(url: url)
          req.httpMethod = "POST"
          req.setValue("application/json", forHTTPHeaderField: "Content-Type")
          req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

          let encoder = JSONEncoder()
          encoder.dateEncodingStrategy = .iso8601
          req.httpBody = try encoder.encode(SyncRequest(uploads: uploads))

          let (data, resp): (Data, URLResponse)
          do {
              (data, resp) = try await session.data(for: req)
          } catch {
              throw APIClientError.transport(error.localizedDescription)
          }
          guard let http = resp as? HTTPURLResponse else {
              throw APIClientError.transport("non-HTTP response")
          }
          switch http.statusCode {
          case 200:
              do {
                  return try JSONDecoder().decode(SyncResponse.self, from: data)
              } catch {
                  throw APIClientError.decoding(error.localizedDescription)
              }
          case 401:
              throw APIClientError.unauthorized
          case 400:
              throw APIClientError.badRequest
          default:
              throw APIClientError.server(http.statusCode)
          }
      }
  }
  ```

- [ ] **Step 4: Run + confirm 3 cases pass.**

- [ ] **Step 5: Commit.**

  ```bash
  git add ios/SyncFit/SyncFit/Net/APIClient.swift ios/SyncFit/SyncFitTests/APIClientTests.swift
  git commit -m "feat(ios-app): APIClient for POST /api/health/sync + tests

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 7: PairingClient + XCTest

**Files:**

- Create: `ios/SyncFit/SyncFitTests/PairingClientTests.swift`
- Create: `ios/SyncFit/SyncFit/Net/PairingClient.swift`

- [ ] **Step 1: Failing test.**

  Reuse the `StubURLProtocol` from `APIClientTests.swift`. Create `ios/SyncFit/SyncFitTests/PairingClientTests.swift`:

  ```swift
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
  ```

- [ ] **Step 2: Confirm fails.**

- [ ] **Step 3: Implement.**

  Create `ios/SyncFit/SyncFit/Net/PairingClient.swift`:

  ```swift
  import Foundation

  final class PairingClient {
      let baseURL: URL
      private let session: URLSession

      init(baseURL: URL, session: URLSession = .shared) {
          self.baseURL = baseURL
          self.session = session
      }

      func pair(code: String, deviceName: String) async throws -> String {
          let url = baseURL.appendingPathComponent("/api/devices/pair")
          var req = URLRequest(url: url)
          req.httpMethod = "POST"
          req.setValue("application/json", forHTTPHeaderField: "Content-Type")
          req.httpBody = try JSONEncoder().encode(PairRequest(code: code, deviceName: deviceName))

          let (data, resp): (Data, URLResponse)
          do {
              (data, resp) = try await session.data(for: req)
          } catch {
              throw APIClientError.transport(error.localizedDescription)
          }
          guard let http = resp as? HTTPURLResponse else {
              throw APIClientError.transport("non-HTTP response")
          }
          switch http.statusCode {
          case 200:
              do {
                  return try JSONDecoder().decode(PairResponse.self, from: data).token
              } catch {
                  throw APIClientError.decoding(error.localizedDescription)
              }
          case 400:
              throw APIClientError.badRequest
          default:
              throw APIClientError.server(http.statusCode)
          }
      }
  }
  ```

- [ ] **Step 4: Run + commit.**

  ```bash
  git add ios/SyncFit/SyncFit/Net/PairingClient.swift \
          ios/SyncFit/SyncFitTests/PairingClientTests.swift
  git commit -m "feat(ios-app): PairingClient for POST /api/devices/pair + tests

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8: SyncCoordinator + XCTest

**Files:**

- Create: `ios/SyncFit/SyncFitTests/SyncCoordinatorTests.swift`
- Create: `ios/SyncFit/SyncFit/Coordinator/SyncCoordinator.swift`

Tests use fake `HealthKitReading` + a real `APIClient` with `StubURLProtocol`.

- [ ] **Step 1: Failing test.**

  Create `ios/SyncFit/SyncFitTests/SyncCoordinatorTests.swift`:

  ```swift
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
  ```

- [ ] **Step 2: Confirm fails.**

- [ ] **Step 3: Implement.**

  Create `ios/SyncFit/SyncFit/Coordinator/SyncCoordinator.swift`:

  ```swift
  import Foundation

  // Orchestrates HealthKit fetch → MetricPicker → APIClient upload, and
  // persists lastSyncedAt to UserDefaults on success. On 401, clears the
  // Keychain so the next launch routes to PairingView.
  final class SyncCoordinator {
      private let health: HealthKitReading
      private let api: APIClient
      private let appTz: TimeZone
      private let keychain: KeychainStore
      private let defaults: UserDefaults

      init(
          health: HealthKitReading,
          api: APIClient,
          appTz: TimeZone,
          keychain: KeychainStore = KeychainStore(),
          defaults: UserDefaults = .standard
      ) {
          self.health = health
          self.api = api
          self.appTz = appTz
          self.keychain = keychain
          self.defaults = defaults
      }

      func run(now: Date = Date()) async throws {
          let samples = try await health.fetchSamples(endingAt: now)
          let todayDate = MetricPicker.dateString(for: now, in: appTz)
          let yesterdayDate: String = {
              var cal = Calendar(identifier: .gregorian); cal.timeZone = appTz
              let y = cal.date(byAdding: .day, value: -1, to: now)!
              return MetricPicker.dateString(for: y, in: appTz)
          }()

          let today = MetricPicker.pickToday(samples: samples, now: now, appTz: appTz)
          let yesterday = MetricPicker.pickYesterday(samples: samples, now: now, appTz: appTz)

          var uploads: [HealthMetricUpload] = []
          uploads.append(contentsOf: encode(picked: today, date: todayDate))
          uploads.append(contentsOf: encode(picked: yesterday, date: yesterdayDate))

          if uploads.isEmpty {
              defaults.set(now, forKey: "lastSyncedAt")
              return
          }

          do {
              _ = try await api.healthSync(uploads: uploads)
              defaults.set(now, forKey: "lastSyncedAt")
          } catch APIClientError.unauthorized {
              keychain.clear()
              throw APIClientError.unauthorized
          }
      }

      private func encode(picked: MetricPicker.PickedDay, date: String) -> [HealthMetricUpload] {
          var out: [HealthMetricUpload] = []
          if let p = picked.hrv {
              out.append(.init(metricDate: date, type: .hrv, value: p.value,
                               source: p.source, freshness: p.freshness, recordedAt: p.recordedAt))
          }
          if let p = picked.rhr {
              out.append(.init(metricDate: date, type: .rhr, value: p.value,
                               source: p.source, freshness: p.freshness, recordedAt: p.recordedAt))
          }
          if let p = picked.sleep {
              out.append(.init(metricDate: date, type: .sleepDurationSeconds, value: p.value,
                               source: p.source, freshness: p.freshness, recordedAt: p.recordedAt))
          }
          return out
      }
  }
  ```

- [ ] **Step 4: Run + commit.**

  ```bash
  git add ios/SyncFit/SyncFit/Coordinator/ \
          ios/SyncFit/SyncFitTests/SyncCoordinatorTests.swift
  git commit -m "feat(ios-app): SyncCoordinator orchestrates picker + upload

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 9: SwiftUI views (Root, Permission, Pairing, Home)

**Files:**

- Create: `ios/SyncFit/SyncFit/Views/RootView.swift`
- Create: `ios/SyncFit/SyncFit/Views/PermissionView.swift`
- Create: `ios/SyncFit/SyncFit/Views/PairingView.swift`
- Create: `ios/SyncFit/SyncFit/Views/HomeView.swift`

No unit tests on views in v1 (covered by simulator smoke). Keep styling minimal and idiomatic SwiftUI — no design-system tokens needed (this app is separate from `@dustin-riley/design`).

- [ ] **Step 1: `RootView.swift`** — routes to Pairing or Home based on Keychain token presence; gates on HealthKit permission.

  ```swift
  import SwiftUI

  struct RootView: View {
      @EnvironmentObject var session: AppSession

      var body: some View {
          Group {
              if !session.healthAuthorized {
                  PermissionView()
              } else if session.deviceToken == nil {
                  PairingView()
              } else {
                  HomeView()
              }
          }
      }
  }
  ```

- [ ] **Step 2: `PermissionView.swift`** — first-launch HealthKit prompt.

  ```swift
  import SwiftUI

  struct PermissionView: View {
      @EnvironmentObject var session: AppSession
      @State private var requesting = false
      @State private var error: String?

      var body: some View {
          VStack(spacing: 24) {
              Text("SyncFit").font(.largeTitle).bold()
              Text("Share HRV, resting heart rate, and sleep with SyncFit to inform your readiness analysis.")
                  .multilineTextAlignment(.center).padding(.horizontal)
              Button(requesting ? "Requesting…" : "Allow HealthKit access") {
                  Task {
                      requesting = true; defer { requesting = false }
                      do { try await session.requestHealthAuthorization() }
                      catch { self.error = error.localizedDescription }
                  }
              }
              .buttonStyle(.borderedProminent)
              .disabled(requesting)
              if let error { Text(error).foregroundStyle(.red) }
          }
          .padding()
      }
  }
  ```

- [ ] **Step 3: `PairingView.swift`** — single 6-digit field; redeem.

  ```swift
  import SwiftUI
  import UIKit

  struct PairingView: View {
      @EnvironmentObject var session: AppSession
      @State private var code = ""
      @State private var pairing = false
      @State private var error: String?

      var body: some View {
          VStack(spacing: 16) {
              Text("Pair iOS app").font(.title2).bold()
              Text("Open Devices in the SyncFit web app and generate a pairing code.")
                  .multilineTextAlignment(.center).foregroundStyle(.secondary)
              TextField("000000", text: $code)
                  .keyboardType(.numberPad)
                  .multilineTextAlignment(.center)
                  .font(.system(.title, design: .monospaced))
                  .padding()
                  .background(Color(.secondarySystemBackground))
                  .clipShape(RoundedRectangle(cornerRadius: 12))
                  .onChange(of: code) { _, new in
                      // Keep only digits, max 6
                      code = String(new.filter(\.isNumber).prefix(6))
                  }
              Button(pairing ? "Pairing…" : "Pair") {
                  Task {
                      pairing = true; defer { pairing = false }
                      error = nil
                      do {
                          let device = await UIDevice.current.name
                          try await session.pair(code: code, deviceName: device)
                      } catch APIClientError.badRequest {
                          self.error = "That code didn't work. Generate a new one in the web app."
                      } catch {
                          self.error = "Couldn't pair. Try again."
                      }
                  }
              }
              .buttonStyle(.borderedProminent)
              .disabled(code.count != 6 || pairing)
              if let error { Text(error).foregroundStyle(.red).multilineTextAlignment(.center) }
          }
          .padding()
      }
  }
  ```

- [ ] **Step 4: `HomeView.swift`** — Sync now + last-synced + unpair.

  ```swift
  import SwiftUI

  struct HomeView: View {
      @EnvironmentObject var session: AppSession
      @State private var syncing = false
      @State private var error: String?

      private var lastSyncedText: String {
          guard let d = session.lastSyncedAt else { return "Never" }
          return DateFormatter.localizedString(from: d, dateStyle: .short, timeStyle: .short)
      }

      var body: some View {
          VStack(spacing: 24) {
              Text("SyncFit").font(.largeTitle).bold()
              VStack(spacing: 4) {
                  Text("Last synced").foregroundStyle(.secondary)
                  Text(lastSyncedText).font(.title3.monospaced())
              }
              Button(syncing ? "Syncing…" : "Sync now") {
                  Task {
                      syncing = true; defer { syncing = false }
                      error = nil
                      do { try await session.syncNow() }
                      catch { self.error = "Sync failed. Try again." }
                  }
              }
              .buttonStyle(.borderedProminent)
              .disabled(syncing)
              if let error { Text(error).foregroundStyle(.red) }
              Spacer()
              Button("Unpair this device", role: .destructive) {
                  session.unpair()
              }
              .padding(.bottom)
          }
          .padding()
      }
  }
  ```

- [ ] **Step 5: Regenerate, build (no test target for views), commit.**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild build -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' -quiet
  ```

  (Build will fail until Task 10 wires `AppSession`. That's expected — Tasks 9 and 10 land together. If you want intermediate-green, mark `AppSession` as a forward-declared `class AppSession: ObservableObject {}` stub here and finish in Task 10.)

  Commit:

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/SyncFit/SyncFit/Views/
  git commit -m "feat(ios-app): SwiftUI views (Root, Permission, Pairing, Home)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 10: SyncFitApp entrypoint + AppSession environment object

**Files:**

- Modify: `ios/SyncFit/SyncFit/SyncFitApp.swift` (replace the stub from Task 1)
- Create: `ios/SyncFit/SyncFit/AppSession.swift`

- [ ] **Step 1: Define `AppSession`.**

  Create `ios/SyncFit/SyncFit/AppSession.swift`:

  ```swift
  import Foundation
  import SwiftUI

  // Owns the user-visible state for the app: HealthKit auth status,
  // device token presence, last-synced timestamp. Wires the views to
  // the underlying clients.
  @MainActor
  final class AppSession: ObservableObject {
      @Published private(set) var healthAuthorized: Bool = false
      @Published private(set) var deviceToken: String?
      @Published private(set) var lastSyncedAt: Date?

      private let keychain = KeychainStore()
      private let health: HealthKitReading
      private let pairing: PairingClient
      private let appTz: TimeZone

      init(
          health: HealthKitReading = HKHealthKitClient(),
          pairing: PairingClient = PairingClient(baseURL: Config.apiBaseURL),
          appTz: TimeZone = Config.appTimeZone
      ) {
          self.health = health
          self.pairing = pairing
          self.appTz = appTz
          self.deviceToken = keychain.load()
          self.lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
      }

      func requestHealthAuthorization() async throws {
          healthAuthorized = try await health.requestAuthorization()
      }

      func pair(code: String, deviceName: String) async throws {
          let token = try await pairing.pair(code: code, deviceName: deviceName)
          try keychain.save(token: token)
          deviceToken = token
      }

      func unpair() {
          keychain.clear()
          deviceToken = nil
      }

      func syncNow() async throws {
          guard let token = deviceToken else { return }
          let api = APIClient(baseURL: Config.apiBaseURL, token: token)
          let coord = SyncCoordinator(health: health, api: api, appTz: appTz)
          do {
              try await coord.run()
              lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
          } catch APIClientError.unauthorized {
              deviceToken = nil
              throw APIClientError.unauthorized
          }
      }
  }
  ```

- [ ] **Step 2: Replace the stub `SyncFitApp.swift`.**

  Overwrite `ios/SyncFit/SyncFit/SyncFitApp.swift`:

  ```swift
  import SwiftUI

  @main
  struct SyncFitApp: App {
      @StateObject private var session = AppSession()

      var body: some Scene {
          WindowGroup {
              RootView()
                  .environmentObject(session)
                  .task {
                      // On first launch, opportunistically check HealthKit
                      // authorization status by attempting an empty request.
                      try? await session.requestHealthAuthorization()
                  }
          }
      }
  }
  ```

- [ ] **Step 3: Regenerate, build the WHOLE app, run ALL tests.**

  ```bash
  cd ios/SyncFit && xcodegen generate
  xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' -quiet
  ```

  Expected: build succeeds, all unit tests across all targets pass.

- [ ] **Step 4: Commit.**

  ```bash
  cd /Users/dustin/Development/workout-tracker
  git add ios/SyncFit/SyncFit/SyncFitApp.swift ios/SyncFit/SyncFit/AppSession.swift
  git commit -m "feat(ios-app): SyncFitApp entrypoint + AppSession environment

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 11: Simulator build + smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Clean build the app for simulator.**

  ```bash
  cd ios/SyncFit
  xcodebuild clean -project SyncFit.xcodeproj -scheme SyncFit -quiet
  xcodebuild build -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' -quiet
  ```

  Expected: clean.

- [ ] **Step 2: Run the full XCTest suite.**

  ```bash
  cd ios/SyncFit
  xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15'
  ```

  Expected: all suites green (Models, Keychain, MetricPicker, APIClient, PairingClient, SyncCoordinator).

- [ ] **Step 3: Boot the simulator + install the app.**

  ```bash
  xcrun simctl boot 'iPhone 15' 2>/dev/null || true
  open -a Simulator
  xcodebuild -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
    -destination 'platform=iOS Simulator,name=iPhone 15' \
    -derivedDataPath /tmp/SyncFit-derived install
  xcrun simctl install booted /tmp/SyncFit-derived/Build/Products/Debug-iphonesimulator/SyncFit.app
  xcrun simctl launch booted com.dustinriley.syncfit
  ```

  Expected: app launches in the simulator. The HealthKit permission sheet appears (simulator's HealthKit support is limited — it won't have real samples, but the permission flow works).

- [ ] **Step 4: Manual smoke (with a running backend).**

  In one terminal, the user runs `npm run dev`.

  In the simulator:
  1. Tap "Allow HealthKit access" → grant.
  2. Visit `http://localhost:3000/settings/devices` in a browser, generate a pairing code.
  3. Enter the code in the iOS app's PairingView.
  4. Confirm the app transitions to HomeView.
  5. Tap "Sync now" — even with no HealthKit data in the simulator, the call should succeed with 0 metrics uploaded.
  6. Inspect the web `/settings/devices` page — the device should appear in the paired devices list.

  Notes:
  - Pointing iOS at `localhost:3000` from the simulator works as `http://localhost:3000` BUT only if the app is built with App Transport Security exceptions for cleartext localhost OR you use an https tunnel. For v1 simplicity, the user should temporarily update `Info.plist` to allow ATS exceptions, or use an `https://` ngrok tunnel.

  If this smoke succeeds, the iOS app is functional end-to-end against the local backend.

- [ ] **Step 5: No commit needed.** Report ALL_CLEAR.

---

## Open items deferred from this plan

- **Apple Developer Program enrollment + TestFlight upload** — handled separately once the user enrolls. Requires generating signing certs, a provisioning profile, and an App Store Connect record. Bundle ID is already `com.dustinriley.syncfit`.
- **Background sync** (`HKObserverQuery` + `BGAppRefreshTask`) — spec v2 item, deferred.
- **APP_TZ configurable per device** — spec v3 item, deferred. The current `Config.appTimeZone` is a hard-coded `America/New_York` constant matching the backend.
- **Localhost / ATS handling for dev** — addressed manually in Task 11's smoke step. Not a code-level concern in v1.
