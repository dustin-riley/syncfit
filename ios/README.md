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
