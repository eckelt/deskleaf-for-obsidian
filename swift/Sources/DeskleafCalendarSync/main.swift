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

func fetchAndPrint(daysBack: Int, daysForward: Int) {
    let now  = Date()
    let cal  = Calendar.current
    let from = cal.date(byAdding: .day, value: -daysBack,   to: now)!
    let to   = cal.date(byAdding: .day, value: daysForward, to: now)!
    let pred = store.predicateForEvents(withStart: from, end: to, calendars: nil)
    let evs  = store.events(matching: pred).map { DeskleafEvent(from: $0) }
    guard let data = try? encoder.encode(evs) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([UInt8(ascii: "\n")]))
}

// MARK: - Entry point

let cmdArgs = CommandLine.arguments
guard cmdArgs.count > 1 else {
    fputs("Usage: deskleaf-calendar-sync <export|watch|create|cancel> [options]\n", stderr)
    exit(1)
}

let command     = cmdArgs[1]
let daysBack    = intArg("--days-back",    default: 90)
let daysForward = intArg("--days-forward", default: 365)

signal(SIGTERM) { _ in exit(0) }
signal(SIGINT)  { _ in exit(0) }

Task {
    guard await requestAccess() else {
        fputs("Calendar access denied\n", stderr)
        exit(1)
    }

    switch command {

    // ── Read ─────────────────────────────────────────────────────────

    case "export":
        fetchAndPrint(daysBack: daysBack, daysForward: daysForward)
        exit(0)

    case "watch":
        fetchAndPrint(daysBack: daysBack, daysForward: daysForward)
        NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged, object: store, queue: .main
        ) { _ in
            store.reset()
            fetchAndPrint(daysBack: daysBack, daysForward: daysForward)
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
