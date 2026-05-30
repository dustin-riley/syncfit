# iOS design-system v0.5 token cut-over — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SyncFit iOS's hand-mirrored `DesignTokens.swift` (`DS*` slice) with the canonical v0.5 `Tokens.swift` (`DR*` full surface), cut every call site over, and tokenize the two views still using raw system colors.

**Architecture:** Token-only adoption per design-system decision E-02 — no SwiftUI component layer, no custom fonts, no dark mode. Vendor the canonical token file verbatim so future re-vendors are a literal overwrite; sweep call sites `DS*`→`DR*`; the only non-mechanical step is mapping `DSColor.bg` → `DRColor.bgIos` (v0.5 split the creamy iOS background into its own paired token).

**Tech Stack:** Swift / SwiftUI, XcodeGen (`project.yml` → `.xcodeproj`), `xcodebuild test`.

**Spec:** `docs/superpowers/specs/2026-05-30-ios-design-system-v0.5-token-cutover-design.md`

**Note on TDD:** This is a pure visual-token migration. There is no new behavior to test, so the per-task verification is **compiles clean** + **zero `DS*`/`ds*` identifiers remain**, not a failing-then-passing unit test. The XCTest suite (`xcodebuild test`) is run as a regression guard, not as new coverage.

**Working directory:** all paths are relative to the worktree root `/Users/dustin/Development/workout-tracker/.claude/worktrees/toasty-weaving-spark`. Branch `ios-design-system-v0.5-token-cutover` is already checked out (the spec commit lives there).

---

## File Structure

- **Replace:** `ios/SyncFit/SyncFit/DesignTokens.swift` → `ios/SyncFit/SyncFit/Tokens.swift` (vendored canonical token file; sole owner of every `DR*` token).
- **Modify:** `ios/SyncFit/SyncFit/Views/HomeView.swift` — `DS*`→`DR*`, `bg`→`bgIos`.
- **Modify:** `ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift` — same sweep (incl. `#Preview`).
- **Modify:** `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift` — same sweep (incl. three `#Preview`s).
- **Modify:** `ios/SyncFit/SyncFit/Views/PairingView.swift` — tokenize raw system colors, keep native controls.
- **Modify:** `ios/SyncFit/SyncFit/Views/PermissionView.swift` — tokenize raw system colors, keep native controls.
- **Regenerated (not committed):** `ios/SyncFit/SyncFit.xcodeproj` — `project.yml` uses `sources: - path: SyncFit` (a directory glob), so the rename needs only `xcodegen generate`; **no `project.yml` edit**. The `.xcodeproj` is gitignored.

---

## Task 1: Vendor the canonical `Tokens.swift`

**Files:**
- Rename + replace: `ios/SyncFit/SyncFit/DesignTokens.swift` → `ios/SyncFit/SyncFit/Tokens.swift`

- [ ] **Step 1: Rename the file in git**

Run:
```bash
git mv ios/SyncFit/SyncFit/DesignTokens.swift ios/SyncFit/SyncFit/Tokens.swift
```

- [ ] **Step 2: Replace the file contents verbatim with the canonical token file**

Overwrite `ios/SyncFit/SyncFit/Tokens.swift` with exactly this content:

```swift
// ============================================================
// Dustin Riley Design System — TOKENS (iOS sibling)
//
// Hand-mirrored from tokens.css. Per Consistency Audit Q-01,
// every PR that touches tokens.css touches THIS file too;
// validate.mjs (sibling) fails CI when a name appears in one
// file but not the other (allowlist below for platform-only
// names that legitimately exist on one side).
//
// Recipes (DRButton, DRCard, DRSheet, …) DO NOT live here.
// They live in ../ios/Components/ as SwiftUI views that
// consume these tokens. Same shape as ../web/components.css
// on the web side. See Q-02 (platform-additive recipe policy).
//
// v0.5 — May 2026
// ============================================================

import SwiftUI

// MARK: - Colors

public enum DRColor {

    // -------- Warm neutrals --------
    public static let bg            = Color(hex: 0xFAF6F0)
    /// iOS-tuned background companion. iPhone displays flatten the warmth
    /// of `bg`; `bgIos` nudges creamier (#F5ECD9) so the warm-neutral
    /// character reads on device. iOS recipes apply `bgIos` where web
    /// recipes apply `bg`. Paired tokens — both files declare both names.
    /// See Migration Review G-06 for the architectural decision.
    public static let bgIos         = Color(hex: 0xF5ECD9)
    public static let surface       = Color(hex: 0xF3ECE0)
    public static let surfaceSunken = Color(hex: 0xEDE4D3)
    public static let border        = Color(hex: 0xE0D5C2)
    public static let text          = Color(hex: 0x1F1A14)
    public static let textMuted     = Color(hex: 0x6B5F50)

    // -------- Primary (burnt orange) --------
    public static let primary        = Color(hex: 0xB8541C)
    public static let primaryHover   = Color(hex: 0x9E4615)
    public static let primaryPressed = Color(hex: 0x85390F)

    // -------- Accents --------
    public static let accentOchre = Color(hex: 0xC9922B)
    public static let accentTeal  = Color(hex: 0x2E7D7A)

    // -------- Link (darker burnt orange; clears AA on bg + surface) --------
    public static let link      = Color(hex: 0x9E4615)
    public static let linkHover = Color(hex: 0x85390F)

    // -------- Semantic --------
    public static let success = Color(hex: 0x5C7A3E)
    public static let warning = Color(hex: 0xC9922B)
    public static let error   = Color(hex: 0xA8392E)

    public static let onPrimary = Color.white
    public static let onAccent  = Color.white

    // -------- AI surface (plum-derived) --------
    public static let surfaceAi   = Color(hex: 0xF1E9EF)
    public static let onSurfaceAi = Color(hex: 0x6A4763)

    // -------- Structural ink (fitness overlay) --------
    public static let rule = Color(hex: 0x2D2620)

    /// Translucent hatch fill for the Increase Contrast disabled state
    /// (Differentiate Without Color). Paired with --rule-translucent-hatch
    /// on the web side; channels of `.rule` at 0.18 alpha. Keep in sync
    /// with `--rule` when that value changes.
    public static let ruleTranslucentHatch = Color(hex: 0x2D2620).opacity(0.18)

    // -------- Readiness (90+ → <50) --------
    public static let readinessRested   = Color(hex: 0x2E6A6A)
    public static let readinessPrimed   = Color(hex: 0x3F7C4F)
    public static let readinessStrained = Color(hex: 0xD4A017)
    public static let readinessDepleted = Color(hex: 0xA8392E)

    // -------- Zones (Z1 → Z5) --------
    public static let zone1 = Color(hex: 0x2E6A6A)
    public static let zone2 = Color(hex: 0x3F7C4F)
    public static let zone3 = Color(hex: 0xD4A017)
    public static let zone4 = Color(hex: 0xD8541A)
    public static let zone5 = Color(hex: 0xA8392E)

    // -------- PR + streak --------
    public static let pr    = Color(hex: 0xD4A017)
    public static let prInk = Color(hex: 0x1A1612)

    // -------- Categorical (muscle groups / types) --------
    public static let catPush      = Color(hex: 0xD8541A)
    public static let catPull      = Color(hex: 0x1F6F7C)
    public static let catLegs      = Color(hex: 0xD4A017)
    public static let catCore      = Color(hex: 0x6E3A5E)
    public static let catCardio    = Color(hex: 0x5C7A3E)
    public static let catAccessory = Color(hex: 0x2A4C8A)
    public static let catOther     = Color(hex: 0x1A1612)

    // -------- Heat ramp (cool → hot, 7 steps) --------
    public static let heat0 = Color(hex: 0xCFE0D8)
    public static let heat1 = Color(hex: 0x9FC4A8)
    public static let heat2 = Color(hex: 0xD4CF6A)
    public static let heat3 = Color(hex: 0xD4A017)
    public static let heat4 = Color(hex: 0xDF8423)
    public static let heat5 = Color(hex: 0xD8541A)
    public static let heat6 = Color(hex: 0x8B2A1C)
}

// MARK: - Type

/// Font family names. iOS uses Font.custom(_:size:relativeTo:) so the user’s
/// Dynamic Type setting still scales the result — see Dynamic Type spec §02.
public enum DRFont {
    public static let display = "Outfit"
    public static let body    = "DM Sans"
    public static let mono    = "JetBrains Mono"
}

/// Type scale, in points. 1rem = 16pt by design.
public enum DRFontSize {
    public static let display: CGFloat   = 48   // 3rem
    public static let h1: CGFloat        = 36   // 2.25rem
    public static let h2: CGFloat        = 28   // 1.75rem
    public static let h3: CGFloat        = 22   // 1.375rem
    public static let h4: CGFloat        = 18   // 1.125rem
    public static let h5: CGFloat        = 16   // 1rem
    public static let bodyLg: CGFloat    = 18   // 1.125rem
    public static let body: CGFloat      = 16   // 1rem
    public static let bodySm: CGFloat    = 14   // 0.875rem
    public static let caption: CGFloat   = 12   // 0.75rem

    // -------- Metric scale (measurements only) --------
    public static let metricSm: CGFloat  = 36   // 2.25rem
    public static let metricMd: CGFloat  = 64   // 4rem
    public static let metricLg: CGFloat  = 96   // 6rem
    public static let metricXl: CGFloat  = 144  // 9rem
}

/// Line-height multipliers (unitless on both platforms).
public enum DRLineHeight {
    public static let display: CGFloat = 1.1
    public static let h1: CGFloat      = 1.15
    public static let h2: CGFloat      = 1.2
    public static let h3: CGFloat      = 1.3
    public static let h4: CGFloat      = 1.35
    public static let h5: CGFloat      = 1.4
    public static let bodyLg: CGFloat  = 1.5
    public static let body: CGFloat    = 1.5
    public static let bodySm: CGFloat  = 1.45
    public static let caption: CGFloat = 1.4
}

// Tracking (CSS letter-spacing) is platform-applied via .kerning() in DRText.
// Not mirrored as a separate enum because the relevant value is a per-token
// kerning amount that DRText computes from the font size. Listed in the
// validator allowlist as web-only.

// MARK: - Spacing (4pt scale)

public enum DRSpace {
    public static let s0: CGFloat = 0
    public static let s1: CGFloat = 4
    public static let s2: CGFloat = 8
    public static let s3: CGFloat = 12
    public static let s4: CGFloat = 16
    public static let s5: CGFloat = 24
    public static let s6: CGFloat = 32
    public static let s7: CGFloat = 48
    public static let s8: CGFloat = 64
    public static let s9: CGFloat = 96
}

// MARK: - Radii

public enum DRRadius {
    public static let block: CGFloat = 0       // hard-edge action surfaces
    public static let chip: CGFloat  = 4
    public static let sm: CGFloat    = 8
    public static let md: CGFloat    = 16
    public static let pill: CGFloat  = 999
}

// MARK: - Shadows

public struct DRShadow {
    public let color: Color
    public let radius: CGFloat
    public let x: CGFloat
    public let y: CGFloat

    public static let sm = DRShadow(
        color: Color(hex: 0x4A341C).opacity(0.06),
        radius: 2, x: 0, y: 1
    )
    public static let md = DRShadow(
        color: Color(hex: 0x4A341C).opacity(0.08),
        radius: 8, x: 0, y: 4
    )
    public static let lg = DRShadow(
        color: Color(hex: 0x4A341C).opacity(0.12),
        radius: 32, x: 0, y: 16
    )

    /// Hard offset shadow used by canonical .btn / .card on web. On iOS this
    /// translates to a solid drop shadow at (2,2) or (4,4) with zero blur
    /// applied behind a Rectangle/RoundedRectangle stroke. See DRButton.
    public static let hard   = DRShadow(color: DRColor.rule, radius: 0, x: 4, y: 4)
    public static let hardSm = DRShadow(color: DRColor.rule, radius: 0, x: 2, y: 2)
}

/// Structural stroke width for hard-edge primitives.
public enum DRRule {
    public static let width: CGFloat = 1.5
}

extension View {
    /// Apply a `DRShadow` to a view in one call. The `dr` prefix
    /// namespaces this against SwiftUI's native `.shadow(color:radius:x:y:)`
    /// so the design-system call is unambiguous at the call site.
    public func drShadow(_ s: DRShadow) -> some View {
        self.shadow(color: s.color, radius: s.radius, x: s.x, y: s.y)
    }
}

// MARK: - Motion

public enum DRDuration {
    public static let fast: TimeInterval        = 0.120
    public static let base: TimeInterval        = 0.200
    public static let slow: TimeInterval        = 0.280
    public static let celebration: TimeInterval = 0.900
}

public enum DREase {
    /// Mirrors --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1).
    /// Use Animation.timingCurve(_:_:_:_:duration:) at call sites rather
    /// than .easeInOut so the curve matches the web exactly.
    public static let standard = (c1x: 0.2, c1y: 0.8, c2x: 0.2, c2y: 1.0)
}

// MARK: - Touch (HIG floor + comfortable target)

public enum DRTapTarget {
    public static let min: CGFloat         = 44   // HIG floor
    public static let comfortable: CGFloat = 48   // primary screen CTAs
}

// MARK: - Layout

public enum DRLayout {
    public static let margin: CGFloat       = 16
    public static let gutterMobile: CGFloat = 16
    // Column counts are documented on the web side as --cols-phone/-tablet/-desktop.
    // iOS uses size classes natively; values exist here for parity with the
    // grid spec but are rarely read directly in SwiftUI.
    public static let colsPhone: Int   = 4
    public static let colsTablet: Int  = 8
    public static let colsDesktop: Int = 12
}

// MARK: - Container

/// Page-level wrapper width cap. Pair with `.container` on the web side
/// (max-width + safe-area-aware horizontal padding). On iOS, apply via
/// `.frame(maxWidth:)` on the screen root — the platform handles safe-area
/// insets natively, so the container is just the width cap.
public enum DRContainer {
    public static let maxWidth: CGFloat = 1080
}

// ============================================================
// Color hex initializer (matches the existing DesignTokens.swift
// shape used by SyncFit; keeps cut-over to this file mechanical).
// ============================================================

extension Color {
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >>  8) & 0xFF) / 255
        let b = Double( hex        & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}
```

- [ ] **Step 3: Regenerate the Xcode project so it picks up the renamed file**

Run:
```bash
cd ios/SyncFit && xcodegen generate
```
Expected: `Created project at .../SyncFit.xcodeproj` (no error). Return to the worktree root afterward.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Tokens.swift
git commit -m "feat(ios): vendor canonical v0.5 Tokens.swift over DesignTokens.swift"
```

Note: `git mv` staged the deletion of `DesignTokens.swift`; `git add` of the new path completes the rename. The `.xcodeproj` is gitignored, so it is not part of the commit.

---

## Task 2: Cut over the three home views (`DS*`→`DR*`, `bg`→`bgIos`)

**Files:**
- Modify: `ios/SyncFit/SyncFit/Views/HomeView.swift`
- Modify: `ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift`
- Modify: `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift`

The order of replacements matters: do the `bg`→`bgIos` mapping **first** (while it still says `DSColor.bg`), then the blanket `DSColor.`→`DRColor.` sweep. Reversing the order would turn `DSColor.bg` into `DRColor.bg` (the wrong, web-only `#faf6f0` token).

- [ ] **Step 1: Map the iOS background token first (`DSColor.bg` → `DRColor.bgIos`)**

Run (from the worktree root):
```bash
sed -i '' 's/DSColor\.bg/DRColor.bgIos/g' \
  ios/SyncFit/SyncFit/Views/HomeView.swift \
  ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift \
  ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
```
This rewrites exactly four lines: `HomeView.swift:33` (`.background(DSColor.bg.ignoresSafeArea())`), `WeekStrip.swift:104` (`#Preview` `.background(DSColor.bg)`), and `PlanDetailCard.swift:106 & 112 & 121` (three `#Preview` `.background(DSColor.bg)`).

No word-boundary guard is needed (BSD `sed` lacks a reliable `\b`): `DSColor.bg` is an unambiguous substring — `DSColor.border` shares only the `DSColor.b` prefix (9th char `o` ≠ `g`), and no token named `DSColor.bg<something>` exists, so the match cannot over-reach.

- [ ] **Step 2: Verify no `DSColor.bg` remains and `bgIos` landed**

Run:
```bash
grep -rn "DSColor\.bg" ios/SyncFit/SyncFit/Views || echo "OK: no DSColor.bg left"
grep -rn "DRColor\.bgIos" ios/SyncFit/SyncFit/Views
```
Expected: first line prints `OK: no DSColor.bg left`; second prints the four rewritten lines.

- [ ] **Step 3: Blanket-sweep the remaining `DS*`/`ds*` identifiers to `DR*`/`dr*`**

Run (from the worktree root):
```bash
sed -i '' \
  -e 's/DSColor\./DRColor./g' \
  -e 's/DSRadius\./DRRadius./g' \
  -e 's/DSShadow/DRShadow/g' \
  -e 's/\.dsShadow(/.drShadow(/g' \
  ios/SyncFit/SyncFit/Views/HomeView.swift \
  ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift \
  ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
```
This covers every remaining site: the `DSColor.text` / `.textMuted` / `.primary` / `.onPrimary` / `.accentTeal` / `.accentOchre` / `.surface` / `.surfaceSunken` / `.border` / `.surfaceSunken` references, `DSRadius.sm` / `.md`, and `.dsShadow(.md)` in `PlanDetailCard.swift:26`. (`DSShadow` the type is not referenced in these three files; the rule is included for completeness and is a no-op here.)

- [ ] **Step 4: Verify the three files are fully cut over**

Run:
```bash
grep -rn "DSColor\|DSRadius\|DSShadow\|dsShadow" ios/SyncFit/SyncFit/Views/HomeView.swift ios/SyncFit/SyncFit/Views/Home/ || echo "OK: home views fully on DR*"
```
Expected: prints `OK: home views fully on DR*`.

Spot-check the load-bearing lines now read:
- `HomeView.swift:33` → `.background(DRColor.bgIos.ignoresSafeArea())`
- `PlanDetailCard.swift:26` → `.drShadow(.md)`
- `WeekStrip.swift:104` → `.background(DRColor.bgIos)`

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/HomeView.swift ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
git commit -m "refactor(ios): cut home views onto DR* tokens (bg -> bgIos)"
```

---

## Task 3: Tokenize `PairingView` and `PermissionView`

These two views use raw system colors. Re-point to `DR*` tokens; keep native controls (`.borderedProminent` / `.bordered` stay — a custom `DRButton` style is the deferred component layer). Apply with the Edit tool (these are not pure renames).

**Files:**
- Modify: `ios/SyncFit/SyncFit/Views/PairingView.swift`
- Modify: `ios/SyncFit/SyncFit/Views/PermissionView.swift`

- [ ] **Step 1: Tokenize `PairingView.swift`**

Replace the `var body` (lines 18–60) so it reads exactly:

```swift
    var body: some View {
        VStack(spacing: 16) {
            Text("Pair iOS app").font(.title2).bold()
                .foregroundStyle(DRColor.text)
            Text("Open Devices in the SyncFit web app and generate a pairing code.")
                .multilineTextAlignment(.center).foregroundStyle(DRColor.textMuted)
            TextField("------", text: $code)
                .keyboardType(.asciiCapable)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled(true)
                .multilineTextAlignment(.center)
                .font(.system(.title, design: .monospaced))
                .foregroundStyle(DRColor.text)
                .padding()
                .background(DRColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: DRRadius.sm))
                .onChange(of: code) { _, new in
                    // Uppercase, then keep only chars in the Crockford alphabet,
                    // capped at the configured length.
                    code = String(
                        new.uppercased()
                           .filter { Self.alphabet.contains($0) }
                           .prefix(Self.codeLength)
                    )
                }
            Button(pairing ? "Pairing…" : "Pair") {
                Task {
                    pairing = true; defer { pairing = false }
                    error = nil
                    do {
                        let device = UIDevice.current.name
                        try await session.pair(code: code, deviceName: device)
                    } catch APIClientError.badRequest {
                        self.error = "That code didn't work. Generate a new one in the web app."
                    } catch {
                        self.error = "Couldn't pair. Try again."
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(DRColor.primary)
            .disabled(code.count != Self.codeLength || pairing)
            if let error { Text(error).foregroundStyle(DRColor.error).multilineTextAlignment(.center) }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DRColor.bgIos.ignoresSafeArea())
    }
```

Changes vs. original: title gains `DRColor.text`; subtitle `.secondary`→`DRColor.textMuted`; field gains `.foregroundStyle(DRColor.text)`, `Color(.secondarySystemBackground)`→`DRColor.surface`, `cornerRadius: 12`→`DRRadius.sm`; button gains `.tint(DRColor.primary)`; error `.red`→`DRColor.error`; screen gains a `DRColor.bgIos` full-bleed background.

- [ ] **Step 2: Tokenize `PermissionView.swift`**

Replace the `var body` (lines 9–43) so it reads exactly:

```swift
    var body: some View {
        VStack(spacing: 24) {
            Text("SyncFit").font(.largeTitle).bold()
                .foregroundStyle(DRColor.text)
            Text("Share HRV, resting heart rate, and sleep with SyncFit to inform your readiness analysis.")
                .multilineTextAlignment(.center).padding(.horizontal)
                .foregroundStyle(DRColor.text)
            Button(requesting ? "Requesting…" : "Allow HealthKit access") {
                Task {
                    requesting = true; defer { requesting = false }
                    error = nil
                    do { try await session.requestHealthAuthorization() }
                    catch { self.error = error.localizedDescription }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(DRColor.primary)
            .disabled(requesting)

            if let error {
                VStack(spacing: 12) {
                    Text(error).foregroundStyle(DRColor.error).multilineTextAlignment(.center)
                    Text("If you tapped Don't Allow, open Settings → Health → Data Access & Devices → SyncFit and turn on the metrics there.")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(DRColor.textMuted)
                        .padding(.horizontal)
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.bordered)
                    .tint(DRColor.primary)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DRColor.bgIos.ignoresSafeArea())
    }
```

Changes vs. original: title + intro gain `DRColor.text`; error `.red`→`DRColor.error`; hint `.secondary`→`DRColor.textMuted`; both buttons gain `.tint(DRColor.primary)`; screen gains a `DRColor.bgIos` full-bleed background.

- [ ] **Step 3: Verify no raw system colors or `DS*` remain in these two views**

Run:
```bash
grep -rn "secondarySystemBackground\|foregroundStyle(.secondary)\|foregroundStyle(.red)\|DSColor\|DSRadius" ios/SyncFit/SyncFit/Views/PairingView.swift ios/SyncFit/SyncFit/Views/PermissionView.swift || echo "OK: both views tokenized"
```
Expected: prints `OK: both views tokenized`.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/PairingView.swift ios/SyncFit/SyncFit/Views/PermissionView.swift
git commit -m "feat(ios): tokenize PairingView and PermissionView onto DR* tokens"
```

---

## Task 4: Full-app verification

**Files:** none modified (verification + final regen only).

- [ ] **Step 1: Confirm zero `DS*`/`ds*` identifiers remain anywhere in the app target**

Run:
```bash
grep -rn "DSColor\|DSRadius\|DSShadow\|dsShadow\|DSSpace\|DSFont" ios/SyncFit/SyncFit || echo "OK: no DS* identifiers remain"
```
Expected: prints `OK: no DS* identifiers remain`. (If anything prints, it is a missed call site — fix it before continuing.)

- [ ] **Step 2: Confirm the token file rename is clean**

Run:
```bash
test ! -e ios/SyncFit/SyncFit/DesignTokens.swift && test -e ios/SyncFit/SyncFit/Tokens.swift && echo "OK: file renamed"
git status --porcelain
```
Expected: prints `OK: file renamed`; `git status` is clean (all three commits made).

- [ ] **Step 3: Regenerate and run the iOS build + test suite**

Use the `ios-build-checker` subagent (keeps multi-thousand-line `xcodebuild` output out of this session). It runs `cd ios/SyncFit && xcodegen generate` then `xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` and surfaces only build errors + failing test names.

Expected: build succeeds, all existing XCTests pass (the migration changes no behavior, so the suite is a regression guard). If the named simulator is unavailable, the subagent picks an installed iPhone simulator from `xcrun simctl list devices available`.

- [ ] **Step 4: (If the build surfaced fixes) re-verify and the branch is done**

If Step 3 was clean, the implementation is complete: three commits on `ios-design-system-v0.5-token-cutover`, build green, no `DS*` left. Hand off to the `superpowers:finishing-a-development-branch` skill to decide merge/PR.

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- Spec §1 "Vendor the canonical token file" → Task 1.
- Spec §2 "Mechanical call-site cut-over" incl. the `bg`→`bgIos` trap → Task 2 (Step 1 does the trap first, by design).
- Spec §3 "Tokenize the two raw views" → Task 3.
- Spec "Testing and verification" (grep-clean + `xcodebuild test`) → Task 4.
- Spec non-goals (component layer, fonts, dark mode) → honored: no `Components/`, no font wiring, no color-scheme work appears in any task.

**Placeholder scan** — no TBD/TODO/"handle edge cases"/"similar to Task N"; every code step shows complete code or an exact command.

**Type consistency** — token names used in Tasks 2–3 (`DRColor.bgIos`, `.text`, `.textMuted`, `.primary`, `.onPrimary`, `.accentTeal`, `.accentOchre`, `.surface`, `.surfaceSunken`, `.border`, `.error`; `DRRadius.sm`/`.md`; `.drShadow(.md)`) are all defined in the Task 1 file body. No name drift.
