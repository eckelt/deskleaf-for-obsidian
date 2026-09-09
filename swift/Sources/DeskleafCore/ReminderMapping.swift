import Foundation

/// Result of mapping an EKReminder's due date onto the calendar grid.
/// `excluded` covers: wrong list, completed, or no due date set at all.
public enum ReminderMapping: Equatable {
    case excluded
    case allDay(date: String)          // yyyy-MM-dd
    case timed(start: Date, end: Date) // end = start + 30 min
}

/// Pure due-date mapping for reminders, kept independent of EventKit so it is
/// unit-testable on any platform. `listTitle` must be exactly "EK" — no other
/// reminder list is surfaced (see reminders-overlay spec, AC1).
public func mapReminderDueDate(
    listTitle: String?,
    isCompleted: Bool,
    year: Int?, month: Int?, day: Int?, hour: Int?, minute: Int?,
    calendar: Calendar = .current
) -> ReminderMapping {
    guard listTitle == "EK", !isCompleted else { return .excluded }
    guard let y = year, let m = month, let d = day else { return .excluded }

    var comps = DateComponents()
    comps.year = y
    comps.month = m
    comps.day = d

    guard let h = hour else {
        guard let date = calendar.date(from: comps) else { return .excluded }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return .allDay(date: f.string(from: date))
    }

    comps.hour = h
    comps.minute = minute ?? 0
    guard let start = calendar.date(from: comps) else { return .excluded }
    let end = calendar.date(byAdding: .minute, value: 30, to: start) ?? start
    return .timed(start: start, end: end)
}
