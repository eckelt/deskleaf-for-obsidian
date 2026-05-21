import Testing
@testable import DeskleafCore

@Suite("ArgParser")
struct ArgParserTests {

    @Test func strArgReturnsValueAfterFlag() {
        let args = ["binary", "--title", "Team Weekly"]
        #expect(strArg("--title", args: args) == "Team Weekly")
    }

    @Test func strArgReturnsDefaultWhenFlagMissing() {
        let args = ["binary", "--start", "2026-05-04T10:00:00"]
        #expect(strArg("--title", args: args, default: "") == "")
    }

    @Test func strArgReturnsDefaultWhenFlagIsLastToken() {
        let args = ["binary", "--title"]
        #expect(strArg("--title", args: args, default: "fallback") == "fallback")
    }

    @Test func strArgPicksFirstOccurrence() {
        let args = ["binary", "--title", "First", "--title", "Second"]
        #expect(strArg("--title", args: args) == "First")
    }

    @Test func intArgParsesInteger() {
        let args = ["binary", "--days-back", "90"]
        #expect(intArg("--days-back", args: args, default: 0) == 90)
    }

    @Test func intArgReturnsDefaultForMissingFlag() {
        let args = ["binary"]
        #expect(intArg("--days-back", args: args, default: 42) == 42)
    }

    @Test func intArgReturnsDefaultForNonNumericValue() {
        let args = ["binary", "--days-back", "abc"]
        #expect(intArg("--days-back", args: args, default: 10) == 10)
    }

    @Test func intArgHandlesNegative() {
        let args = ["binary", "--offset", "-5"]
        #expect(intArg("--offset", args: args, default: 0) == -5)
    }
}
