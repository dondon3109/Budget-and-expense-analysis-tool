package site.zoption.localdatasecurity

import android.content.pm.ApplicationInfo
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
  }
}

private class LocalDataSecurityException(message: String) : CodedException(message)
