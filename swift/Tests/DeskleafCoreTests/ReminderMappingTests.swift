import Testing
import Foundation
@testable import DeskleafCore

@Suite("ReminderMapping")
struct ReminderMappingTests {

    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    // AC2: due date without a time → all-day, on the due date.
    @Test func dueDateWithoutTimeMapsToAllDay() {
        let result = mapReminderDueDate(
            listTitle: "Erinnerungen", isCompleted: false,
            year: 2026, month: 9, day: 10, hour: nil, minute: nil,
            calendar: utc
        )
        #expect(result == .allDay(date: "2026-09-10"))
    }

    // AC2: due date with a time → a 30-minute block starting at that time.
    @Test func dueDateWithTimeMapsToThirtyMinuteBlock() {
        let result = mapReminderDueDate(
            listTitle: "Erinnerungen", isCompleted: false,
            year: 2026, month: 9, day: 10, hour: 14, minute: 0,
            calendar: utc
        )
        guard case let .timed(start, end) = result else {
            Issue.record("expected .timed, got \(result)")
            return
        }
        #expect(utc.component(.hour, from: start) == 14)
        #expect(utc.component(.minute, from: start) == 0)
        #expect(end.timeIntervalSince(start) == 30 * 60)
    }

    // AC3: no due date at all (neither date nor time) → excluded.
    @Test func noDueDateIsExcluded() {
        let result = mapReminderDueDate(
            listTitle: "Erinnerungen", isCompleted: false,
            year: nil, month: nil, day: nil, hour: nil, minute: nil,
            calendar: utc
        )
        #expect(result == .excluded)
    }

    // AC4: a completed reminder is excluded even with a valid due date.
    @Test func completedReminderIsExcluded() {
        let result = mapReminderDueDate(
            listTitle: "Erinnerungen", isCompleted: true,
            year: 2026, month: 9, day: 10, hour: nil, minute: nil,
            calendar: utc
        )
        #expect(result == .excluded)
    }

    // AC1: reminders from a list other than "Erinnerungen" are excluded.
    @Test func reminderFromOtherListIsExcluded() {
        let result = mapReminderDueDate(
            listTitle: "Einkauf", isCompleted: false,
            year: 2026, month: 9, day: 10, hour: nil, minute: nil,
            calendar: utc
        )
        #expect(result == .excluded)
    }

    // AC1: a missing list title (no calendar) is excluded.
    @Test func reminderWithoutListIsExcluded() {
        let result = mapReminderDueDate(
            listTitle: nil, isCompleted: false,
            year: 2026, month: 9, day: 10, hour: nil, minute: nil,
            calendar: utc
        )
        #expect(result == .excluded)
    }

    // Defaulted minute: an hour without an explicit minute rounds to :00.
    @Test func dueTimeWithoutMinuteDefaultsToZero() {
        let result = mapReminderDueDate(
            listTitle: "Erinnerungen", isCompleted: false,
            year: 2026, month: 9, day: 10, hour: 9, minute: nil,
            calendar: utc
        )
        guard case let .timed(start, _) = result else {
            Issue.record("expected .timed, got \(result)")
            return
        }
        #expect(utc.component(.minute, from: start) == 0)
    }
}
