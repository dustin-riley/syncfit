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
