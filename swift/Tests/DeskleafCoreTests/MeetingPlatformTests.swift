import Testing
@testable import DeskleafCore

@Suite("MeetingPlatform")
struct MeetingPlatformTests {

    @Test func detectsZoom() {
        #expect(detectMeetingPlatform("join at https://zoom.us/j/123") == "zoom")
    }

    @Test func detectsTeamsMicrosoft() {
        #expect(detectMeetingPlatform("https://teams.microsoft.com/l/meetup-join/...") == "teams")
    }

    @Test func detectsTeamsLive() {
        #expect(detectMeetingPlatform("join via teams.live.com") == "teams")
    }

    @Test func detectsGoogleMeet() {
        #expect(detectMeetingPlatform("meet.google.com/abc-defg-hij") == "meet")
    }

    @Test func detectsWebex() {
        #expect(detectMeetingPlatform("webex.com/meet/room") == "webex")
    }

    @Test func returnsNilForUnknownPlatform() {
        #expect(detectMeetingPlatform("Location: Building 3, Room 42") == nil)
    }

    @Test func returnsNilForEmptyString() {
        #expect(detectMeetingPlatform("") == nil)
    }

    @Test func zoomTakesPriorityOverLaterMatches() {
        // Zoom appears first in the if-chain
        #expect(detectMeetingPlatform("zoom.us and meet.google.com") == "zoom")
    }
}
