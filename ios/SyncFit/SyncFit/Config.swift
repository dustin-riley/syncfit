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
