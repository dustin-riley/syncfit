#!/usr/bin/env swift

// Generates a 1024×1024 placeholder app icon at the path passed as argv[1].
// Burnt-orange background (matches the design-system primary token
// `--ds-primary: #b8541c`) with a centered white "SF" monogram. Run from
// `ios/SyncFit/` whenever you want to regenerate, e.g.:
//
//   swift tools/generate-placeholder-icon.swift \
//     SyncFit/Assets.xcassets/AppIcon.appiconset/icon-1024.png
//
// Replace with real artwork before any non-internal TestFlight release.

import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write("usage: generate-placeholder-icon.swift <output.png>\n".data(using: .utf8)!)
    exit(2)
}
let outPath = CommandLine.arguments[1]

let size = 1024
let bytesPerRow = size * 4
let colorSpace = CGColorSpaceCreateDeviceRGB()
// noneSkipLast => RGB with an ignored byte; PNG encoder writes RGB (no alpha),
// which is what App Store Connect requires for the marketing icon.
let bitmapInfo = CGImageAlphaInfo.noneSkipLast.rawValue
guard let ctx = CGContext(
    data: nil, width: size, height: size,
    bitsPerComponent: 8, bytesPerRow: bytesPerRow,
    space: colorSpace, bitmapInfo: bitmapInfo
) else { exit(1) }

// Burnt orange #b8541c (sRGB)
ctx.setFillColor(CGColor(red: 184/255, green: 84/255, blue: 28/255, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))

// "SF" centered, white, bold. Use raw Core Text attribute keys — the
// NSAttributedString.Key.font / .foregroundColor properties live in AppKit
// and UIKit, not in Foundation-only CLI builds.
let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 520, nil)
let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)
let attrs: [CFString: Any] = [
    kCTFontAttributeName: font,
    kCTForegroundColorAttributeName: white,
]
let line = CTLineCreateWithAttributedString(
    CFAttributedStringCreate(nil, "SF" as CFString, attrs as CFDictionary)!
)
let bounds = CTLineGetImageBounds(line, ctx)
let x = (CGFloat(size) - bounds.width) / 2 - bounds.minX
let y = (CGFloat(size) - bounds.height) / 2 - bounds.minY
ctx.textPosition = CGPoint(x: x, y: y)
CTLineDraw(line, ctx)

guard let cg = ctx.makeImage() else { exit(1) }
let outURL = URL(fileURLWithPath: outPath)
try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(), withIntermediateDirectories: true)
guard let dest = CGImageDestinationCreateWithURL(
    outURL as CFURL, UTType.png.identifier as CFString, 1, nil
) else { exit(1) }
CGImageDestinationAddImage(dest, cg, nil)
guard CGImageDestinationFinalize(dest) else { exit(1) }
print("wrote \(outPath)")
