import Testing
import Foundation
@testable import DeskleafCore

@Suite("DateParsing")
struct DateParsingTests {

    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    @Test func parseDateWithPositiveTimezone() throws {
        // 14:00+02:00 = 12:00 UTC
        let date = try #require(parseDate("2026-05-04T14:00:00+02:00"))
        #expect(utc.component(.hour, from: date) == 12)
        #expect(utc.component(.minute, from: date) == 0)
        #expect(utc.component(.day, from: date) == 4)
    }

    @Test func parseDateWithNegativeTimezone() throws {
        // 09:00-05:00 = 14:00 UTC
        let date = try #require(parseDate("2026-05-04T09:00:00-05:00"))
        #expect(utc.component(.hour, from: date) == 14)
    }

    @Test func parseDateWithUTCTimezone() throws {
        let date = try #require(parseDate("2026-05-04T08:30:00+00:00"))
        #expect(utc.component(.hour, from: date) == 8)
        #expect(utc.component(.minute, from: date) == 30)
    }

    @Test func parseDateWithoutTimezoneReturnsNonNil() {
        // Without timezone: treated as local time — just verify it parses
        #expect(parseDate("2026-05-04T14:00:00") != nil)
    }

    @Test func parseDateWithoutTimezoneHasCorrectLocalHour() throws {
        let date = try #require(parseDate("2026-05-04T14:00:00"))
        var local = Calendar(identifier: .gregorian)
        local.timeZone = TimeZone.current
        #expect(local.component(.hour, from: date) == 14)
        #expect(local.component(.minute, from: date) == 0)
    }

    @Test func parseDateReturnsNilForInvalidString() {
        #expect(parseDate("not-a-date") == nil)
    }

    @Test func parseDateReturnsNilForDateOnlyString() {
        // "2026-05-04" is date-only, not a datetime
        #expect(parseDate("2026-05-04") == nil)
    }

    @Test func parseDatePreservesYearMonthDay() throws {
        let date = try #require(parseDate("2026-12-31T23:00:00+00:00"))
        #expect(utc.component(.year, from: date) == 2026)
        #expect(utc.component(.month, from: date) == 12)
        #expect(utc.component(.day, from: date) == 31)
    }
}
