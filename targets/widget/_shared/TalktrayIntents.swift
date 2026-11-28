import AppIntents
import WidgetKit

@available(iOS 18.0, *)
struct RecordTalktrayIntent: AppIntent {
  static var title: LocalizedStringResource = "Talktray ile kaydet"
  static var description = IntentDescription("Opens Talktray and starts a voice note.")
  static var openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    let url = URL(string: "talktray://record?autostart=1") ?? URL(fileURLWithPath: "/")
    return .result(opensIntent: OpenURLIntent(url))
  }
}

@available(iOS 18.0, *)
struct TalktrayShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RecordTalktrayIntent(),
      phrases: [
        "\(.applicationName) ile kaydet",
        "Record a thought with \(.applicationName)",
      ],
      shortTitle: "Kaydet",
      systemImageName: "mic.fill"
    )
  }
}
