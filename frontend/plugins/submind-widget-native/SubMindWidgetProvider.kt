package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/** Launcher widget. Contains cached, nonsensitive display strings only. */
class SubMindWidgetProvider : AppWidgetProvider() {
  companion object {
    const val PREFS_NAME = "submind_widget_v1"

    fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, SubMindWidgetProvider::class.java))
      for (id in ids) manager.updateAppWidget(id, render(context))
    }

    private fun render(context: Context): RemoteViews {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      fun value(key: String, fallback: String) =
        prefs.getString(key, fallback) ?: fallback
      val view = RemoteViews(context.packageName, R.layout.submind_home_widget)
      view.setTextViewText(R.id.submind_expiring_count, value("expiring_count", "0 expiring"))
      view.setTextViewText(R.id.submind_expiring_title, value("expiring_title", "Nothing expiring soon"))
      view.setTextViewText(R.id.submind_expiring_when, value("expiring_when", "Open SubMind to refresh"))
      view.setTextViewText(R.id.submind_notes_count, value("notes_count", "0 notes"))
      view.setTextViewText(R.id.submind_notes_title, value("notes_title", "Add your first note"))
      view.setTextViewText(R.id.submind_links_count, value("links_count", "0 reminder links"))
      view.setTextViewText(R.id.submind_links_title, value("links_title", "No links with reminders"))
      view.setTextViewText(R.id.submind_links_when, value("links_when", "Open SubMind to refresh"))

      // Explicit component makes the intent package-local and avoids external
      // apps intercepting the custom scheme.
      fun navigate(path: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
          action = Intent.ACTION_VIEW
          data = Uri.parse("submind:///" + path)
          addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(
          context, requestCode, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }
      view.setOnClickPendingIntent(R.id.submind_widget_header, navigate("", 5000))
      view.setOnClickPendingIntent(R.id.submind_widget_expiring, navigate("subscriptions", 5001))
      view.setOnClickPendingIntent(R.id.submind_widget_notes, navigate("notes", 5002))
      view.setOnClickPendingIntent(R.id.submind_widget_links, navigate("link-vault", 5003))
      return view
    }
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    super.onUpdate(context, manager, ids)
    refresh(context)
  }
}
