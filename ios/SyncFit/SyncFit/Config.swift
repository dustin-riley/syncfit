import Foundation

enum Config {
    // The SyncFit backend.
    //
    // Debug builds (Run from Xcode) point at the local dev server running
    // on the Mac that hosts the simulator. The simulator can reach the host
    // via `http://localhost:3000` — the matching ATS exception for the
    // `localhost` domain lives in Info.plist (DEV ONLY; prod uses HTTPS).
    //
    // Release builds point at the deployed Vercel URL.
    #if DEBUG
    static let apiBaseURL = URL(string: "http://localhost:3000")!
    #else
    static let apiBaseURL = URL(string: "https://syncfit.vercel.app")!
    #endif

    // Server's source-of-truth timezone. Matches the backend's APP_TZ
    // constant in src/lib/units.ts. iOS computes metricDate strings in
    // this zone before upload.
    static let appTimeZone = TimeZone(identifier: "America/New_York")!
}
