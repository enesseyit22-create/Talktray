import SwiftUI
import WidgetKit

@main
struct TalktrayWidgetBundle: WidgetBundle {
  var body: some Widget {
    TalktrayHomeWidget()
    if #available(iOSApplicationExtension 18.0, *) {
      TalktrayRecordControl()
    }
  }
}
