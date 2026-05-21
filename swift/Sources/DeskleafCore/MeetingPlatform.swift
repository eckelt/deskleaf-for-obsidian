import Foundation

public func detectMeetingPlatform(_ haystack: String) -> String? {
    if      haystack.contains("zoom.us")               { return "zoom" }
    else if haystack.contains("teams.microsoft.com") ||
            haystack.contains("teams.live.com")        { return "teams" }
    else if haystack.contains("meet.google.com")       { return "meet" }
    else if haystack.contains("webex.com")             { return "webex" }
    return nil
}
