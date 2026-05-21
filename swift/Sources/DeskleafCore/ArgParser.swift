import Foundation

public func strArg(_ name: String, args: [String] = CommandLine.arguments, default def: String = "") -> String {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return def }
    return args[i + 1]
}

public func intArg(_ name: String, args: [String] = CommandLine.arguments, default def: Int) -> Int {
    Int(strArg(name, args: args, default: "\(def)")) ?? def
}
