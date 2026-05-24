# TestFlight setup — SyncFit iOS

End-to-end checklist for shipping the SyncFit iOS companion to TestFlight.
The repo-side infrastructure (XcodeGen config, signing xcconfig, app icon,
version-bump build settings) is already in place — you just need to do the
manual one-time Apple steps below.

TestFlight builds connect to **production** (`https://syncfit.vercel.app`).
Local dev builds connect to `http://localhost:3000` via the `#if DEBUG` split
in `SyncFit/Config.swift`. There is no risk of a TestFlight build accidentally
talking to localhost.

---

## One-time setup

### 1. Enroll in the Apple Developer Program

- $99 / year
- Sign in at <https://developer.apple.com/programs/> → Enroll
- Allow 24–48h for Apple to process (individual enrollment is usually within
  a day; business / D-U-N-S enrollment takes longer)

### 2. Set your Team ID locally

Once enrolled:

```bash
cd ios/SyncFit
cp Signing.xcconfig.example Signing.xcconfig
```

Edit `Signing.xcconfig` and replace `REPLACE_WITH_YOUR_TEAM_ID` with your
10-character Team ID. Find it at:

- <https://developer.apple.com/account> → Membership details → Team ID, or
- Xcode → Settings → Accounts → select your team → "Team ID" field

`Signing.xcconfig` is gitignored — your team ID never gets committed.

Regenerate the Xcode project so the new team ID is picked up:

```bash
xcodegen generate
```

### 3. Register the App ID in the Apple Developer portal

- <https://developer.apple.com/account/resources/identifiers/list>
- Click **+** → App IDs → App
- Bundle ID: `com.dustinriley.syncfit` (Explicit, not Wildcard)
- Capabilities: check **HealthKit** (and only HealthKit)
- Save

### 4. Create the App Store Connect record

- <https://appstoreconnect.apple.com/apps>
- **+** → New App
- Platform: iOS
- Name: `SyncFit`
- Primary language: English (U.S.)
- Bundle ID: pick `com.dustinriley.syncfit` from the dropdown (populated from
  step 3)
- SKU: anything memorable, e.g. `syncfit-ios`
- User Access: Full Access
- Save

You don't need to fill in pricing, screenshots, or descriptions to ship
internal TestFlight builds — those are only required for App Store review.

### 5. (Optional but recommended) Generate an App Store Connect API key

For unattended uploads via `xcrun altool` or `fastlane`:

- <https://appstoreconnect.apple.com/access/integrations/api>
- **Keys** tab → **+**
- Name: `SyncFit upload`
- Access: **Developer** is sufficient (TestFlight uploads only)
- Download the `.p8` private key (one-time download — save it somewhere safe)
- Note the **Key ID** and **Issuer ID**

Store the key outside the repo (e.g. `~/.private_keys/AuthKey_<KEY_ID>.p8`).

---

## Per-release: archive + upload

Bump the build number before each upload — TestFlight rejects duplicates.

Edit `ios/SyncFit/project.yml`:

```yaml
settings:
  base:
    MARKETING_VERSION: "0.1.0"      # bump major/minor for user-visible changes
    CURRENT_PROJECT_VERSION: "2"    # bump every upload, monotonically
```

Then regenerate + archive + upload from the Xcode GUI:

```bash
cd ios/SyncFit
xcodegen generate
open SyncFit.xcodeproj
```

In Xcode:

1. Top toolbar destination → **Any iOS Device (arm64)** (NOT a simulator)
2. **Product → Archive**
3. When the Organizer opens, select the new archive → **Distribute App**
4. **App Store Connect** → **Upload** → next, next, next
5. Wait for "Upload Successful"

Within ~10 minutes the build will appear in App Store Connect under your
app's **TestFlight** tab. It needs a quick automatic Apple processing pass
(usually 5–15 min); state moves from "Processing" → "Ready to Submit".

### CLI alternative (using App Store Connect API key from step 5)

Once the archive is built (`Product → Archive` in Xcode populates
`~/Library/Developer/Xcode/Archives/`), upload from the command line:

```bash
xcrun altool --upload-app \
  --type ios \
  --file /path/to/SyncFit.ipa \
  --apiKey <KEY_ID> \
  --apiIssuer <ISSUER_ID>
```

`altool` looks for `AuthKey_<KEY_ID>.p8` in `~/.appstoreconnect/private_keys/`,
`~/.private_keys/`, or the current directory.

---

## Add yourself as an internal tester

Once the build is "Ready to Submit":

1. App Store Connect → your app → **TestFlight** tab
2. Builds (left sidebar) → select the build → answer the export-compliance
   question (typically "No" — SyncFit doesn't use non-standard encryption)
3. **Internal Testing** (left sidebar) → create a group ("Self") if needed
4. Add testers (your Apple ID email) → save
5. On your iPhone: install TestFlight from the App Store → sign in with the
   same Apple ID → SyncFit appears in **Available** apps

Internal testers can install immediately. External testers (anyone outside
your dev team) require an additional beta-review step from Apple — out of
scope until you ship to non-developers.

---

## What's set up in the repo for you

| Concern | Where it lives | Status |
|---|---|---|
| Team ID (per-developer secret) | `ios/SyncFit/Signing.xcconfig` (gitignored) | Template at `Signing.xcconfig.example` |
| Code signing style | `project.yml` `CODE_SIGN_STYLE: Automatic` | Done — Xcode manages certs/profiles |
| Bundle ID | `project.yml` `PRODUCT_BUNDLE_IDENTIFIER: com.dustinriley.syncfit` | Done |
| HealthKit capability | `project.yml` `entitlements.properties` | Done |
| HealthKit usage string | `SyncFit/Info-Debug.plist` + `Info-Release.plist` `NSHealthShareUsageDescription` | Done — spec-verbatim wording (mirror both files) |
| Marketing version | `project.yml` `MARKETING_VERSION` (drives `CFBundleShortVersionString`) | Done — currently `0.1.0` |
| Build number | `project.yml` `CURRENT_PROJECT_VERSION` (drives `CFBundleVersion`) | Done — bump per upload |
| App icon | `SyncFit/Assets.xcassets/AppIcon.appiconset/icon-1024.png` | **Placeholder** — burnt-orange "SF" monogram, replace before public release |
| Prod API URL | `SyncFit/Config.swift` `#else` branch | Done — `https://syncfit.vercel.app` |
| ATS exception | `SyncFit/Info-Debug.plist` `NSExceptionDomains[localhost]` | Done — Debug-only; `Info-Release.plist` has no ATS exception |

## Open follow-ups (after first successful TestFlight)

- **Real app icon.** The placeholder is functional but obviously generated.
  Drop a 1024×1024 RGB-no-alpha PNG at the same path and rebuild.
- **fastlane lane for `beta`.** Wraps archive + upload + auto-bump
  `CURRENT_PROJECT_VERSION` based on App Store Connect's current build
  number. Deferred until the manual flow gets tedious.
- **GitHub Actions workflow** scoped to `paths: ios/**` so backend PRs
  don't burn macOS runner minutes. Trigger on tag push to upload to
  TestFlight automatically.
- **External testers / public beta** — requires submitting the build for
  beta review (≈24h turnaround). Internal testing is enough for personal use.
