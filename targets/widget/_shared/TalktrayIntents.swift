import AppIntents
import WidgetKit

struct RecordTalktrayIntent: AppIntent {
  static var title: LocalizedStringResource = "Talktray ile kaydet"
  static var description = IntentDescription("Opens Talktray and starts a voice note.")
  static var openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    guard let url = URL(string: "talktray://record?autostart=1") else {
      return .result()
    }
    return .result(opensIntent: OpenURLIntent(url))
  }
}

struct TalktrayShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RecordTalktrayIntent(),
      phrases: [
        "Talktray ile kaydet",
        "\(.applicationName) ile kaydet",
        "Record a thought with \(.applicationName)",
      ],
      shortTitle: "Kaydet",
      systemImageName: "mic.fill"
    )
  }
}
