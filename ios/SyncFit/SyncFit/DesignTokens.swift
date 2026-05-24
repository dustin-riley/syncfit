// ios/SyncFit/SyncFit/DesignTokens.swift
import SwiftUI

// Hand-mirrored from node_modules/@dustin-riley/design/src/tokens.css.
// Resync when the package version is bumped. Only tokens actually used
// in the plan home screen are mirrored — see spec §2.4.
enum DSColor {
    static let bg            = Color(red: 0.980, green: 0.965, blue: 0.941) // #faf6f0
    static let surface       = Color(red: 0.953, green: 0.925, blue: 0.878) // #f3ece0
    static let surfaceSunken = Color(red: 0.929, green: 0.894, blue: 0.827) // #ede4d3
    static let border        = Color(red: 0.878, green: 0.835, blue: 0.761) // #e0d5c2
    static let text          = Color(red: 0.122, green: 0.102, blue: 0.078) // #1f1a14
    static let textMuted     = Color(red: 0.420, green: 0.373, blue: 0.314) // #6b5f50
    static let primary       = Color(red: 0.722, green: 0.329, blue: 0.110) // #b8541c
    static let onPrimary     = Color.white
    static let accentTeal    = Color(red: 0.180, green: 0.490, blue: 0.478) // #2e7d7a
    static let accentOchre   = Color(red: 0.788, green: 0.573, blue: 0.169) // #c9922b
}

enum DSRadius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let pill: CGFloat = 999
}

struct DSShadow {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat

    static let sm = DSShadow(
        color: Color(red: 74/255, green: 52/255, blue: 28/255).opacity(0.06),
        radius: 2, x: 0, y: 1
    )
    static let md = DSShadow(
        color: Color(red: 74/255, green: 52/255, blue: 28/255).opacity(0.08),
        radius: 8, x: 0, y: 4
    )
}

extension View {
    func dsShadow(_ s: DSShadow) -> some View {
        self.shadow(color: s.color, radius: s.radius, x: s.x, y: s.y)
    }
}
