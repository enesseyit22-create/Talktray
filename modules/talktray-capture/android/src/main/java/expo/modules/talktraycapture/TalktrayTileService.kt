package expo.modules.talktraycapture

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService

class TalktrayTileService : TileService() {
  @SuppressLint("StartActivityAndCollapseDeprecated")
  override fun onClick() {
    val launch = Intent(Intent.ACTION_VIEW, Uri.parse("talktray://record?autostart=1")).apply {
      setPackage(packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    if (Build.VERSION.SDK_INT >= 34) {
      val pending = PendingIntent.getActivity(
        this,
        1,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launch)
    }
  }
}
