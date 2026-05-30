# iOS design-system v0.5 token cut-over — design

**Date:** 2026-05-30
**Status:** approved (design); implementation pending
**Surface:** iOS companion only (`ios/SyncFit/`). No web/Next, DB, or API changes.

## Context

The Dustin Riley Design System shipped **v0.5** (May 2026). The handoff bundle
(`syncfit-design-system/`) was reviewed for changes relevant to the iOS app. The
finding: v0.5 ships **token-only on iOS** by explicit decision — finding **E-02**
in the v0.5 Readiness Audit, and reiterated in `ios/README.md` and the chat
transcripts (esp. `chat21.md`). `ios/Components/` is empty *by design*; the
SwiftUI primitives (`DRButton`, `DRCard`, `DRSegmented`, `DRText`, …) are scoped
to a later release when a real iOS surface demands them.

The one ready-to-adopt iOS change is the **token cut-over**: replace SyncFit's
hand-mirrored `DesignTokens.swift` (a 10-color / 3-radius `DSColor` / `DSRadius`
/ `DSShadow` slice mirrored from the old `@dustin-riley/design@0.5.0` package)
with the canonical `Tokens.swift` (full `DRColor` / `DRRadius` / `DRShadow`
surface). The `Color(hex:)` initializer in `Tokens.swift` was deliberately shaped
to match the existing file so the swap is mechanical.

## Scope and non-goals

In scope:

1. Vendor the canonical `Tokens.swift` into the iOS app, replacing
   `DesignTokens.swift`.
2. Cut every call site off `DS*` / `ds*` onto `DR*` / `dr*`.
3. Tokenize the two views that still use raw system colors (`PairingView`,
   `PermissionView`).

Explicit non-goals — deferred by the design system, not oversights:

- The SwiftUI component layer (`DRButton` / `DRCard` / `DRSheet` / `DRText`).
  E-02 keeps `ios/Components/` empty at v0.5. Views keep **native** SwiftUI
  controls; we only re-point colors / radii / shadows at the canonical tokens.
- Custom fonts (Outfit / DM Sans / JetBrains Mono). No font files are bundled,
  and `DRText` + Dynamic Type is a deferred recipe. `DRFont` family-name strings
  come along in the vendored file but are not wired into any view.
- Dark mode (the system reserves v1.0 for it).

## Design

### 1. Vendor the canonical token file

- `git mv ios/SyncFit/SyncFit/DesignTokens.swift` →
  `ios/SyncFit/SyncFit/Tokens.swift`, then replace its contents **verbatim**
  with the bundle's `syncfit-design-system/project/tokens/Tokens.swift`.
- That brings the full token surface: `DRColor` (warm neutrals incl. `bgIos`,
  primary, accents, link, semantic, AI surface, structural ink + translucent
  hatch, readiness ramp, intensity zones, PR/streak, categorical, heat ramp),
  `DRFont`, `DRFontSize`, `DRLineHeight`, `DRSpace`, `DRRadius`, `DRShadow`
  (incl. `hard` / `hardSm`), `DRRule`, `DRDuration`, `DREase`, `DRTapTarget`,
  `DRLayout`, `DRContainer`, the `Color(hex:)` initializer, and the `drShadow`
  `View` extension.
- `project.yml` uses `sources: - path: SyncFit` (a directory glob), so the
  rename needs only `cd ios/SyncFit && xcodegen generate` — **no `project.yml`
  edit**.
- Keeping the vendored file a literal copy means future re-vendors are a straight
  overwrite (same discipline as the vendored web files under
  `src/styles/design/`).

### 2. Mechanical call-site cut-over (visual output preserved)

Files: `Views/HomeView.swift`, `Views/Home/WeekStrip.swift`,
`Views/Home/PlanDetailCard.swift`.

- `DSColor.*` → `DRColor.*`
- `DSRadius.*` → `DRRadius.*`
- `.dsShadow(.md)` / `.dsShadow(.sm)` → `.drShadow(.md)` / `.drShadow(.sm)`

**The one trap — `bg` → `bgIos`.** Every `DSColor.bg` maps to **`DRColor.bgIos`**,
*not* `DRColor.bg`. The old `DSColor.bg` was the creamy iOS-tuned `#f5ecd9`; v0.5
models that as a separate paired token `bgIos`, and `bg` now carries the true web
value `#faf6f0` (Migration Review G-06). Mapping to `bgIos` keeps the screens
pixel-identical on device. (All other `DSColor` names map 1:1 to the same
`DRColor` name with identical hex.)

### 3. Tokenize the two raw views

Files: `Views/PairingView.swift`, `Views/PermissionView.swift`. Keep native
controls; re-point colors only.

- `Color(.secondarySystemBackground)` → `DRColor.surface`.
- Add a `DRColor.bgIos` screen background (consistent with `HomeView`).
- `.foregroundStyle(.secondary)` → `DRColor.textMuted`.
- Default body / title text → `DRColor.text`.
- `.foregroundStyle(.red)` → `DRColor.error`.
- `.buttonStyle(.borderedProminent)` buttons get `.tint(DRColor.primary)`.
- The pairing code field corner radius `12` → `DRRadius.sm` (8).

Custom button *styles* (a `DRButton` recipe) stay out — that is the deferred
component layer, not a token.

## Testing and verification

No unit-testable logic changes; this is a pure visual-token migration (the LLM,
DB, parsers, and sync paths are untouched). Verification gate:

- `cd ios/SyncFit && xcodegen generate`
- `xcodebuild test` via the `ios-build-checker` subagent — must compile clean.
- Done-check: `grep -rn "DSColor\|DSRadius\|DSShadow\|dsShadow" ios/SyncFit/SyncFit/`
  returns empty (no `DS*` / `ds*` identifiers remain).

No web gate items (`npm test`, `tsc`, `lint`, `format:check`, `build`) are
triggered because no TypeScript/CSS files change.

## Risks

Low. The only behavioral subtlety is the `bg` → `bgIos` mapping; getting it wrong
would shift the background warmth but nothing functional. The `Color(hex:)`
initializer is identical in shape to the current one, so the swap cannot change
color math.
