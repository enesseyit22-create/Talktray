import AppIntents
import SwiftUI
import WidgetKit

struct TalktraySnapshot {
  let todayCount: Int
  let openTasks: Int

  static func load() -> TalktraySnapshot {
    let defaults = UserDefaults(suiteName: "group.com.talktray.app")
    return TalktraySnapshot(
      todayCount: defaults?.integer(forKey: "todayCount") ?? 0,
      openTasks: defaults?.integer(forKey: "openTasks") ?? 0
    )
  }
}

struct TalktrayEntry: TimelineEntry {
  let date: Date
  let snapshot: TalktraySnapshot
}

struct TalktrayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TalktrayEntry {
    TalktrayEntry(date: Date(), snapshot: TalktraySnapshot(todayCount: 3, openTasks: 5))
  }

  func getSnapshot(in context: Context, completion: @escaping (TalktrayEntry) -> Void) {
    completion(TalktrayEntry(date: Date(), snapshot: TalktraySnapshot.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TalktrayEntry>) -> Void) {
    let entry = TalktrayEntry(date: Date(), snapshot: TalktraySnapshot.load())
    let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

struct TalktrayHomeWidget: Widget {
  let kind = "com.talktray.app.home"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: TalktrayProvider()) { entry in
      TalktrayWidgetView(entry: entry)
        .containerBackground(for: .widget) {
          TalktrayGlassBackground()
        }
    }
    .configurationDisplayName("Talktray")
    .description("Bir dokunuşla kaydet.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
  }
}

struct TalktrayWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TalktrayEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      Image("TalktrayMark")
        .resizable()
        .scaledToFit()
        .padding(4)
        .widgetURL(URL(string: "talktray://record?autostart=1"))
    case .systemMedium:
      HStack(spacing: 16) {
        MicButton()
        VStack(alignment: .leading, spacing: 6) {
          Text("Talktray")
            .font(.headline)
            .foregroundStyle(Color(red: 0.36, green: 0.29, blue: 0.84))
          Text("\(entry.snapshot.todayCount)")
            .font(.system(size: 34, weight: .bold))
            .foregroundStyle(Color(red: 0.16, green: 0.14, blue: 0.32))
          Text("Bugün · \(entry.snapshot.openTasks) görev")
            .font(.subheadline)
            .foregroundStyle(Color(red: 0.45, green: 0.42, blue: 0.58))
        }
        Spacer()
      }
      .padding(4)
    default:
      VStack(spacing: 10) {
        MicButton()
        Text("Kaydet")
          .font(.headline)
          .foregroundStyle(Color(red: 0.16, green: 0.14, blue: 0.32))
        Text("\(entry.snapshot.todayCount) bugün")
          .font(.caption)
          .foregroundStyle(Color(red: 0.45, green: 0.42, blue: 0.58))
      }
    }
  }
}

struct MicButton: View {
  var body: some View {
    Button(intent: RecordTalktrayIntent()) {
      Image("TalktrayMark")
        .resizable()
        .scaledToFit()
        .frame(width: 76, height: 76)
    }
    .buttonStyle(.plain)
  }
}

struct TalktrayGlassBackground: View {
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          Color(red: 0.96, green: 0.93, blue: 1),
          Color(red: 1, green: 0.9, blue: 0.92),
          Color(red: 0.86, green: 0.94, blue: 1),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      Circle()
        .fill(Color(red: 0.78, green: 0.68, blue: 1).opacity(0.55))
        .blur(radius: 18)
        .offset(x: -40, y: -30)
      Circle()
        .fill(Color(red: 1, green: 0.75, blue: 0.7).opacity(0.45))
        .blur(radius: 16)
        .offset(x: 50, y: 40)
    }
  }
}

@available(iOS 18.0, *)
struct TalktrayRecordControl: ControlWidget {
  static let kind = "com.talktray.app.record.control"

  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: Self.kind) {
      ControlWidgetButton(action: RecordTalktrayIntent()) {
        Label("Kaydet", systemImage: "mic.fill")
      }
    }
    .displayName("Talktray")
    .description("Bir düşünce kaydet.")
  }
}
