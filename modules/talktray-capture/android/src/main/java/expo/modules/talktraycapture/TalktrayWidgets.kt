package expo.modules.talktraycapture

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TalktrayCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalktrayCapture")

    Function("setSnapshot") { todayCount: Int, openTasks: Int ->
      val context = appContext.reactContext ?: return@Function
      context
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putInt(KEY_TODAY, todayCount)
        .putInt(KEY_TASKS, openTasks)
        .apply()
      TalktrayWidgets.refresh(context)
    }
  }

  companion object {
    const val PREFS = "talktray_widget"
    const val KEY_TODAY = "todayCount"
    const val KEY_TASKS = "openTasks"
  }
}

object TalktrayWidgets {
  fun refresh(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    update(context, manager, TalktrayWidgetSmall::class.java, R.layout.talktray_widget_small, false)
    update(context, manager, TalktrayWidgetMedium::class.java, R.layout.talktray_widget_medium, true)
  }

  private fun update(
    context: Context,
    manager: AppWidgetManager,
    clazz: Class<*>,
    layout: Int,
    showCount: Boolean,
  ) {
    val ids = manager.getAppWidgetIds(ComponentName(context, clazz))
    if (ids.isEmpty()) return
    val prefs = context.getSharedPreferences(TalktrayCaptureModule.PREFS, Context.MODE_PRIVATE)
    val views = RemoteViews(context.packageName, layout)
    views.setOnClickPendingIntent(R.id.widget_root, recordIntent(context))
    if (showCount) {
      views.setTextViewText(R.id.today_count, prefs.getInt(TalktrayCaptureModule.KEY_TODAY, 0).toString())
      views.setTextViewText(
        R.id.open_tasks,
        context.getString(R.string.talktray_open_tasks, prefs.getInt(TalktrayCaptureModule.KEY_TASKS, 0)),
      )
    }
    manager.updateAppWidget(ids, views)
  }

  fun recordIntent(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("talktray://record?autostart=1")).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}

class TalktrayWidgetSmall : android.appwidget.AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TalktrayWidgets.refresh(context)
  }
}

class TalktrayWidgetMedium : android.appwidget.AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TalktrayWidgets.refresh(context)
  }
}
