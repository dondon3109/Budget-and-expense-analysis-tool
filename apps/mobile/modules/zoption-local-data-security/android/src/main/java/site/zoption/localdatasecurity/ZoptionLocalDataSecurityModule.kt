package site.zoption.localdatasecurity

import android.content.pm.ApplicationInfo
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZoptionLocalDataSecurityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZoptionLocalDataSecurity")

    AsyncFunction("ensureSQLiteBackupExcludedAsync") {
      val context = appContext.reactContext
        ?: throw LocalDataSecurityException("The Android application context is unavailable.")
      val backupAllowed = context.applicationInfo.flags and ApplicationInfo.FLAG_ALLOW_BACKUP != 0
      if (backupAllowed) {
        throw LocalDataSecurityException("Android application backup must remain disabled.")
      }
      true
    }

    // Settings.Global.BOOT_COUNT increases by one each time Android boots. The
    // sign-in session is compared against it so a phone restart ends the session
    // and an app restart does not.
    AsyncFunction("readBootCountAsync") {
      val context = appContext.reactContext
        ?: throw LocalDataSecurityException("The Android application context is unavailable.")
      try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT)
      } catch (error: Exception) {
        throw LocalDataSecurityException(error.message ?: "Android did not report a boot count.")
      }
    }
  }
}

private class LocalDataSecurityException(message: String) : CodedException(message)
