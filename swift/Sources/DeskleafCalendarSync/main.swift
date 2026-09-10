import EventKit
import Foundation
import DeskleafCore

// MARK: - Date formatters

private let isoFull: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private let isoDate: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

// MARK: - Data model

struct DeskleafEvent: Encodable {
    let id: String
    let title: String
    let start: String
    let end: String
    let location: String?
    let attendees: [String]
    let body: String?
    let calendar: String
    let isRecurring: Bool
    let isCancelled: Bool
    let isAllDay: Bool
    let isOrganizer: Bool
    let meetingPlatform: String?
    let numAttendees: Int
    let organizer: String?
    let isReminder: Bool

    init(from ev: EKEvent) {
        // Recurring instances share the same eventIdentifier → append date for a unique per-occurrence id
        let baseId = ev.eventIdentifier ?? UUID().uuidString
        id = ev.hasRecurrenceRules
            ? "\(baseId)|\(isoDate.string(from: ev.startDate))"
            : baseId
        title    = ev.title ?? "(no title)"
        isAllDay = ev.isAllDay

        if ev.isAllDay {
            start = isoDate.string(from: ev.startDate)
            end   = isoDate.string(from: ev.endDate)
        } else {
            start = isoFull.string(from: ev.startDate)
            end   = isoFull.string(from: ev.endDate)
        }

        location = ev.location.flatMap { $0.isEmpty ? nil : $0 }
        body     = ev.notes.flatMap     { $0.isEmpty ? nil : $0 }
        calendar = ev.calendar?.title ?? ""

        let parts   = ev.attendees ?? []
        attendees    = parts.map { $0.name ?? "" }.filter { !$0.isEmpty }
        numAttendees = parts.count
        organizer    = ev.organizer?.name

        isRecurring = ev.hasRecurrenceRules
        isCancelled = ev.status == .canceled
        isOrganizer = ev.organizer == nil || (ev.organizer?.isCurrentUser ?? false)

        let haystack = [ev.notes, ev.url?.absoluteString, ev.location]
            .compactMap { $0 }.joined(separator: " ").lowercased()
        meetingPlatform = detectMeetingPlatform(haystack)
        isReminder = false
    }

    // Reminders come from a single fixed EventKit list ("Erinnerungen"); due-date-without-time
    // reminders render all-day, due-date-with-time reminders render as a 30-min block,
    // and completed/undated/other-list reminders are excluded entirely (mapReminderDueDate).
    init?(reminder: EKReminder) {
        let comps = reminder.dueDateComponents
        let mapping = mapReminderDueDate(
            listTitle: reminder.calendar?.title,
            isCompleted: reminder.isCompleted,
            year: comps?.year, month: comps?.month, day: comps?.day,
            hour: comps?.hour, minute: comps?.minute
        )

        switch mapping {
        case .excluded:
            return nil
        case .allDay(let date):
            start = date
            end = date
            isAllDay = true
        case .timed(let s, let e):
            start = isoFull.string(from: s)
            end = isoFull.string(from: e)
            isAllDay = false
        }

        id = "reminder:\(reminder.calendarItemIdentifier)"
        title = reminder.title ?? "(no title)"
        location = nil
        attendees = []
        body = reminder.notes.flatMap { $0.isEmpty ? nil : $0 }
        calendar = reminder.calendar?.title ?? ""
        isRecurring = false
        isCancelled = false
        isOrganizer = true
        meetingPlatform = nil
        numAttendees = 0
        organizer = nil
        isReminder = true
    }
}

// MARK: - Helpers

let store   = EKEventStore()
let encoder = JSONEncoder()

// Find a specific EKEvent by the plugin id (may be "baseId|YYYY-MM-DD" for recurring occurrences)
func findEvent(_ eid: String) -> EKEvent? {
    if eid.contains("|") {
        let parts = eid.split(separator: "|", maxSplits: 1)
        guard parts.count == 2, let date = isoDate.date(from: String(parts[1])) else { return nil }
        let baseId = String(parts[0])
        let cal = Calendar.current
        let from = cal.startOfDay(for: date)
        let to   = cal.date(byAdding: .day, value: 1, to: from)!
        let pred = store.predicateForEvents(withStart: from, end: to, calendars: nil)
        return store.events(matching: pred).first { $0.eventIdentifier == baseId }
    }
    return store.event(withIdentifier: eid)
}

let reminderListTitle = "Erinnerungen"

func requestAccess() async -> Bool {
    do {
        if #available(macOS 14, *) {
            return try await store.requestFullAccessToEvents()
        } else {
            return await withCheckedContinuation { c in
                store.requestAccess(to: .event) { ok, _ in c.resume(returning: ok) }
            }
        }
    } catch { return false }
}

// Reminder access is requested independently of event access — a denial here must
// not block the existing event export path (see reminders-overlay spec, risk table).
func requestReminderAccess() async -> Bool {
    do {
        if #available(macOS 14, *) {
            return try await store.requestFullAccessToReminders()
        } else {
            return await withCheckedContinuation { c in
                store.requestAccess(to: .reminder) { ok, _ in c.resume(returning: ok) }
            }
        }
    } catch { return false }
}

func fetchReminders() async -> [EKReminder] {
    guard let list = store.calendars(for: .reminder).first(where: { $0.title == reminderListTitle }) else {
        return []
    }
    let pred = store.predicateForReminders(in: [list])
    return await withCheckedContinuation { c in
        store.fetchReminders(matching: pred) { reminders in
            c.resume(returning: reminders ?? [])
        }
    }
}

func fetchAndPrint(daysBack: Int, daysForward: Int) async {
    let now  = Date()
    let cal  = Calendar.current
    let from = cal.date(byAdding: .day, value: -daysBack,   to: now)!
    let to   = cal.date(byAdding: .day, value: daysForward, to: now)!
    let pred = store.predicateForEvents(withStart: from, end: to, calendars: nil)
    var evs: [DeskleafEvent] = store.events(matching: pred).map { DeskleafEvent(from: $0) }
    evs += await fetchReminders().compactMap { DeskleafEvent(reminder: $0) }
    printEvents(evs)
}

// --reminders-only mode (ADR 3): emits exclusively EKReminder-derived objects, never
// touches store.events(matching:) or the .event EventKit scope, so a CalDAV user who
// runs this alongside their CalDAV event path is never asked for full Calendar access.
func fetchAndPrintReminders() async {
    let evs: [DeskleafEvent] = await fetchReminders().compactMap { DeskleafEvent(reminder: $0) }
    printEvents(evs)
}

func printEvents(_ evs: [DeskleafEvent]) {
    guard let data = try? encoder.encode(evs) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([UInt8(ascii: "\n")]))
}

// MARK: - Entry point

let cmdArgs = CommandLine.arguments
guard cmdArgs.count > 1 else {
    fputs("Usage: deskleaf-calendar-sync <export|watch|create|move|update|cancel> [options]\n", stderr)
    exit(1)
}

let command      = cmdArgs[1]
let daysBack     = intArg("--days-back",    default: 90)
let daysForward  = intArg("--days-forward", default: 365)
let remindersOnly = cmdArgs.contains("--reminders-only")

signal(SIGTERM) { _ in exit(0) }
signal(SIGINT)  { _ in exit(0) }

// ADR 3: --reminders-only skips requestAccess() (the .event scope) entirely — a
// CalDAV user's second, parallel process must only ever prompt for reminder access.
if remindersOnly {
    Task {
        guard await requestReminderAccess() else {
            fputs("Reminder access denied\n", stderr)
            exit(1)
        }
        switch command {
        case "export":
            await fetchAndPrintReminders()
            exit(0)
        case "watch":
            await fetchAndPrintReminders()
            NotificationCenter.default.addObserver(
                forName: .EKEventStoreChanged, object: store, queue: .main
            ) { _ in
                store.reset()
                Task { await fetchAndPrintReminders() }
            }
            // process kept alive by RunLoop.main.run() below
        default:
            fputs("--reminders-only only supports export/watch, got: \(command)\n", stderr)
            exit(1)
        }
    }
    RunLoop.main.run()
}

Task {
    guard await requestAccess() else {
        fputs("Calendar access denied\n", stderr)
        exit(1)
    }
    _ = await requestReminderAccess() // best-effort: denial must not block event export

    switch command {

    // ── Read ─────────────────────────────────────────────────────────

    case "export":
        await fetchAndPrint(daysBack: daysBack, daysForward: daysForward)
        exit(0)

    case "watch":
        await fetchAndPrint(daysBack: daysBack, daysForward: daysForward)
        NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged, object: store, queue: .main
        ) { _ in
            store.reset()
            Task { await fetchAndPrint(daysBack: daysBack, daysForward: daysForward) }
        }
        // process kept alive by RunLoop.main.run() below

    // ── Write ────────────────────────────────────────────────────────

    case "create":
        let title    = strArg("--title")
        let startStr = strArg("--start")
        let endStr   = strArg("--end")
        guard !title.isEmpty, !startStr.isEmpty, !endStr.isEmpty else {
            fputs("create requires --title --start --end\n", stderr); exit(1)
        }
        guard let sd = parseDate(startStr), let ed = parseDate(endStr) else {
            fputs("Invalid ISO 8601 date\n", stderr); exit(1)
        }
        let calName = strArg("--calendar")
        let target  = store.calendars(for: .event).first { $0.title == calName }
            ?? store.defaultCalendarForNewEvents
        guard let targetCal = target else {
            fputs("No writable calendar available\n", stderr); exit(1)
        }
        let ev = EKEvent(eventStore: store)
        ev.title     = title
        ev.startDate = sd
        ev.endDate   = ed
        ev.calendar  = targetCal
        let notes = strArg("--notes");    if !notes.isEmpty { ev.notes    = notes }
        let loc   = strArg("--location"); if !loc.isEmpty   { ev.location = loc   }
        do {
            try store.save(ev, span: .thisEvent, commit: true)
            print(ev.eventIdentifier ?? "")
            exit(0)
        } catch {
            fputs("Failed to create event: \(error)\n", stderr); exit(1)
        }

    case "move":
        let eid      = strArg("--id")
        let startStr = strArg("--start")
        let endStr   = strArg("--end")
        guard !eid.isEmpty, !startStr.isEmpty, !endStr.isEmpty else {
            fputs("move requires --id --start --end\n", stderr); exit(1)
        }
        guard let ev = findEvent(eid) else {
            fputs("Event not found: \(eid)\n", stderr); exit(1)
        }
        guard let sd = parseDate(startStr), let ed = parseDate(endStr) else {
            fputs("Invalid ISO 8601 date\n", stderr); exit(1)
        }
        let moveSpan: EKSpan = strArg("--span") == "future" ? .futureEvents : .thisEvent
        ev.startDate = sd
        ev.endDate   = ed
        do {
            try store.save(ev, span: moveSpan, commit: true)
            exit(0)
        } catch {
            fputs("Failed to move event: \(error)\n", stderr); exit(1)
        }

    case "update":
        let eid      = strArg("--id")
        let title    = strArg("--title")
        let startStr = strArg("--start")
        let endStr   = strArg("--end")
        guard !eid.isEmpty, !title.isEmpty, !startStr.isEmpty, !endStr.isEmpty else {
            fputs("update requires --id --title --start --end\n", stderr); exit(1)
        }
        guard let ev = findEvent(eid) else {
            fputs("Event not found: \(eid)\n", stderr); exit(1)
        }
        guard let sd = parseDate(startStr), let ed = parseDate(endStr) else {
            fputs("Invalid ISO 8601 date\n", stderr); exit(1)
        }
        let span: EKSpan = strArg("--span") == "series" ? .futureEvents : .thisEvent
        ev.title = title
        ev.startDate = sd
        ev.endDate = ed
        let notes = strArg("--notes"); ev.notes = notes.isEmpty ? nil : notes
        let loc = strArg("--location"); ev.location = loc.isEmpty ? nil : loc
        let calName = strArg("--calendar")
        if !calName.isEmpty {
            guard let targetCal = store.calendars(for: .event).first(where: { $0.title == calName }) else {
                fputs("Calendar not found: \(calName)\n", stderr); exit(1)
            }
            ev.calendar = targetCal
        }
        do {
            try store.save(ev, span: span, commit: true)
            exit(0)
        } catch {
            fputs("Failed to update event: \(error)\n", stderr); exit(1)
        }

    case "cancel":
        let eid = strArg("--id")
        guard !eid.isEmpty else {
            fputs("cancel requires --id\n", stderr); exit(1)
        }
        guard let ev = findEvent(eid) else {
            fputs("Event not found: \(eid)\n", stderr); exit(1)
        }
        let span: EKSpan = strArg("--span") == "future" ? .futureEvents : .thisEvent
        do {
            try store.remove(ev, span: span, commit: true)
            exit(0)
        } catch {
            fputs("Failed to cancel event: \(error)\n", stderr); exit(1)
        }

    default:
        fputs("Unknown command: \(command)\n", stderr)
        exit(1)
    }
}

RunLoop.main.run()
