// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DeskleafCalendarSync",
    platforms: [.macOS(.v14)],
    targets: [
        .target(
            name: "DeskleafCore",
            path: "Sources/DeskleafCore"
        ),
        .executableTarget(
            name: "DeskleafCalendarSync",
            dependencies: ["DeskleafCore"],
            path: "Sources/DeskleafCalendarSync"
        ),
        .testTarget(
            name: "DeskleafCoreTests",
            dependencies: ["DeskleafCore"],
            path: "Tests/DeskleafCoreTests",
            swiftSettings: [
                .unsafeFlags([
                    "-F", "/Library/Developer/CommandLineTools/Library/Developer/Frameworks",
                ]),
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-F", "/Library/Developer/CommandLineTools/Library/Developer/Frameworks",
                    "-framework", "Testing",
                    "-Xlinker", "-rpath",
                    "-Xlinker", "/Library/Developer/CommandLineTools/Library/Developer/Frameworks",
                    "-Xlinker", "-rpath",
                    "-Xlinker", "/Library/Developer/CommandLineTools/Library/Developer/usr/lib",
                ]),
            ]
        ),
    ]
)
