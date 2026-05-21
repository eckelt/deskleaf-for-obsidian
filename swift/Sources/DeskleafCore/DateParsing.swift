import Foundation

public func parseDate(_ s: String) -> Date? {
    // Try with timezone (e.g. 2026-05-04T14:00:00+02:00)
    let iso = ISO8601DateFormatter()
    if let d = iso.date(from: s) { return d }
    // Try without timezone — treat as local time (e.g. 2026-05-04T14:00:00)
    let local = DateFormatter()
    local.locale = Locale(identifier: "en_US_POSIX")
    local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return local.date(from: s)
}
