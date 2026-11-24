package site.zoption.playupdates

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Checks Google Play for an available update to the installed app via Play In-App Updates.
 * Non-Play installs (dev builds, sideloaded APKs, devices without Play Store) resolve safely
 * with `{ available: false }` instead of failing startup.
 */
class ZoptionPlayUpdatesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZoptionPlayUpdates")

    AsyncFunction("checkForUpdateAsync") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.resolve(mapOf("available" to false))
        return@AsyncFunction
      }

      val installedVersionCode = readInstalledVersionCode(context)

      try {
        val manager = AppUpdateManagerFactory.create(context)
        manager.appUpdateInfo
          .addOnSuccessListener { info ->
            val updateAvailable =
              info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
            val availableVersionCode = info.availableVersionCode()
            val isNewer =
              installedVersionCode == null || availableVersionCode.toLong() > installedVersionCode
            if (updateAvailable && availableVersionCode > 0 && isNewer) {
              promise.resolve(
                mapOf(
                  "available" to true,
                  "availableVersionCode" to availableVersionCode,
                ),
              )
            } else {
              promise.resolve(mapOf("available" to false))
            }
          }
          .addOnFailureListener {
            promise.resolve(mapOf("available" to false))
          }
      } catch (_: Exception) {
        promise.resolve(mapOf("available" to false))
      }
    }
  }

  private fun readInstalledVersionCode(context: Context): Long? {
    return try {
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(0),
        )
      } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode
      } else {
        @Suppress("DEPRECATION")
        info.versionCode.toLong()
      }
    } catch (_: Exception) {
      null
    }
  }
}
