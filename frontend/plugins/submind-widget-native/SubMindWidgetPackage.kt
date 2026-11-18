package __PACKAGE__

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager

/**
 * Receives only redacted, already formatted widget display data from the app.
 * Never exposes or writes the private vault, e-mail addresses, credentials,
 * payment information or raw note content to widget preferences.
 */
class SubMindWidgetModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  override fun getName(): String = "SubMindWidget"

  @ReactMethod
  fun updateSnapshot(snapshot: ReadableMap, promise: Promise) {
    try {
      val keys = listOf(
        "expiring_count", "expiring_title", "expiring_when",
        "notes_count", "notes_title",
        "links_count", "links_title", "links_when"
      )
      val editor = context.getSharedPreferences(
        SubMindWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE
      ).edit()
      for (key in keys) {
        if (snapshot.hasKey(key) && !snapshot.isNull(key)) {
          editor.putString(key, snapshot.getString(key)?.take(140) ?: "")
        }
      }
      if (!editor.commit()) throw IllegalStateException("Widget preferences not saved")
      SubMindWidgetProvider.refresh(context)
      promise.resolve(true)
    } catch (ex: Exception) {
      promise.reject("SUBMIND_WIDGET_SAVE", ex)
    }
  }

  @ReactMethod
  fun requestPin(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(false)
        return
      }
      val manager = AppWidgetManager.getInstance(context)
      val provider = ComponentName(context, SubMindWidgetProvider::class.java)
      promise.resolve(
        if (manager.isRequestPinAppWidgetSupported) {
          // This only confirms the launcher accepted the REQUEST, not that
          // the person completed the installation.
          manager.requestPinAppWidget(provider, null, null)
        } else false
      )
    } catch (ex: Exception) {
      promise.reject("SUBMIND_WIDGET_PIN", ex)
    }
  }
}

class SubMindWidgetPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(SubMindWidgetModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
