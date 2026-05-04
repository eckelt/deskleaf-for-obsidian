// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FocalCal",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "FocalCal", path: "Sources/FocalCal")
    ]
)
