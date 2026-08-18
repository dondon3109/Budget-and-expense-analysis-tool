package site.zoption.apkupdater

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class ZoptionApkUpdaterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZoptionApkUpdater")

    AsyncFunction("getInstalledPackageInfoAsync") {
      val context = requireContext()
      val info = packageInfo(context.packageManager, context.packageName, 0)
        ?: throw ApkUpdaterException("The installed package could not be read.")
      mapOf(
        "packageName" to info.packageName,
        "versionName" to (info.versionName ?: ""),
        "versionCode" to versionCodeOf(info)
      )
    }

    AsyncFunction("digestFileSha256Async") { fileUri: String ->
      val file = resolveUpdaterFile(fileUri)
      sha256Hex(file)
    }

    AsyncFunction("inspectApkAsync") { fileUri: String ->
      val file = resolveUpdaterFile(fileUri)
      inspectApk(file).toMap()
    }

    AsyncFunction("verifyApkAsync") { fileUri: String, expectedVersionCode: Int ->
      val file = resolveUpdaterFile(fileUri)
      verifyTrustedApk(file, expectedVersionCode).toMap()
    }

    AsyncFunction("canInstallPackagesAsync") {
      val context = requireContext()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.packageManager.canRequestPackageInstalls()
      } else {
        @Suppress("DEPRECATION")
        Settings.Secure.getInt(
          context.contentResolver,
          Settings.Secure.INSTALL_NON_MARKET_APPS,
          0
        ) == 1
      }
    }

    AsyncFunction("openUnknownSourcesSettingsAsync") {
      val context = requireContext()
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
          data = Uri.parse("package:${context.packageName}")
        }
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      startExternally(intent)
    }

    AsyncFunction("installApkAsync") { fileUri: String, expectedVersionCode: Int ->
      val file = resolveUpdaterFile(fileUri)
      verifyTrustedApk(file, expectedVersionCode)

      val context = requireContext()
      val authority = "${context.packageName}.zoption.apkupdater"
      val contentUri = FileProvider.getUriForFile(context, authority, file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, APK_MIME_TYPE)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("apk", contentUri)
      }

      val resolvers = context.packageManager.queryIntentActivities(
        intent,
        PackageManager.MATCH_DEFAULT_ONLY
      )
      if (resolvers.isEmpty()) {
        throw ApkUpdaterException("Android could not open the package installer.")
      }
      for (resolve in resolvers) {
        context.grantUriPermission(
          resolve.activityInfo.packageName,
          contentUri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION
        )
      }
      startExternally(intent)
    }
  }

  private fun requireContext() =
    appContext.reactContext ?: throw ApkUpdaterException("The Android application context is unavailable.")

  private fun startExternally(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
      return
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    requireContext().startActivity(intent)
  }

  private fun resolveUpdaterFile(fileUri: String): File {
    val path = localFilePath(fileUri)
      ?: throw ApkUpdaterException("Only local updater files can be inspected.")
    val file = File(path)
    if (!file.isFile) {
      throw ApkUpdaterException("The update file is missing.")
    }
    val allowedRoot = File(requireContext().cacheDir, UPDATE_CACHE_DIRECTORY).canonicalFile
    val canonical = file.canonicalFile
    if (canonical != allowedRoot && !canonical.path.startsWith(allowedRoot.path + File.separator)) {
      throw ApkUpdaterException("The update file is outside the updater cache.")
    }
    if (!canonical.name.endsWith(".apk", ignoreCase = true)) {
      throw ApkUpdaterException("The update file is not an APK.")
    }
    return canonical
  }

  private fun verifyTrustedApk(file: File, expectedVersionCode: Int): ApkInspection {
    val context = requireContext()
    val installed = packageInfo(context.packageManager, context.packageName, 0)
      ?: throw ApkUpdaterException("The installed package could not be read.")
    val inspection = inspectApk(file)
    val rejection = ZoptionApkTrust.evaluate(
      runningPackageName = context.packageName,
      inspection = ZoptionApkTrust.Inspection(
        packageName = inspection.packageName,
        versionCode = inspection.versionCode,
        signerSha256 = inspection.signerSha256,
      ),
      expectedVersionCode = expectedVersionCode.toLong(),
      installedVersionCode = versionCodeOf(installed),
    )
    if (rejection != null) {
      throw ApkUpdaterException(rejection.toUserMessage())
    }
    return inspection
  }

  private fun inspectApk(file: File): ApkInspection {
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      PackageManager.GET_SIGNING_CERTIFICATES
    } else {
      @Suppress("DEPRECATION")
      PackageManager.GET_SIGNATURES
    }
    val info = packageArchiveInfo(requireContext().packageManager, file.absolutePath, flags)
      ?: throw ApkUpdaterException("The downloaded file is not a readable Android package.")
    info.applicationInfo?.apply {
      sourceDir = file.absolutePath
      publicSourceDir = file.absolutePath
    }
    val packageName = info.packageName
      ?: throw ApkUpdaterException("The downloaded package does not declare an identity.")
    val versionCode = versionCodeOf(info)
    if (versionCode <= 0) {
      throw ApkUpdaterException("The downloaded package does not declare a valid version.")
    }
    return ApkInspection(
      packageName = packageName,
      versionCode = versionCode,
      signerSha256 = signerFingerprints(info)
    )
  }

  private fun signerFingerprints(info: PackageInfo): List<String> {
    val certificates = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val signingInfo = info.signingInfo
        ?: throw ApkUpdaterException("The downloaded package does not include a signing certificate.")
      if (signingInfo.hasMultipleSigners() && signingInfo.apkContentsSigners.size > 1) {
        return signingInfo.apkContentsSigners.map { certificateSha256(it.toByteArray()) }.distinct()
      }
      val signers = signingInfo.apkContentsSigners
      if (signers == null || signers.isEmpty()) {
        throw ApkUpdaterException("The downloaded package does not include a signing certificate.")
      }
      signers.map { it.toByteArray() }
    } else {
      @Suppress("DEPRECATION")
      val signatures = info.signatures
      if (signatures == null || signatures.isEmpty()) {
        throw ApkUpdaterException("The downloaded package does not include a signing certificate.")
      }
      signatures.map { it.toByteArray() }
    }
    return certificates.map(::certificateSha256).distinct()
  }

  private data class ApkInspection(
    val packageName: String,
    val versionCode: Long,
    val signerSha256: List<String>
  ) {
    fun toMap(): Map<String, Any> = mapOf(
      "packageName" to packageName,
      "versionCode" to versionCode,
      "signerSha256" to signerSha256
    )
  }

  companion object {
    private const val UPDATE_CACHE_DIRECTORY = "apk-updates"
    private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
  }
}

private class ApkUpdaterException(message: String) : CodedException(message)

private fun localFilePath(fileUri: String): String? {
  if (fileUri.startsWith("/")) return fileUri
  val uri = Uri.parse(fileUri)
  if (uri.scheme != "file") return null
  return uri.path
}

private fun sha256Hex(file: File): String {
  val digest = MessageDigest.getInstance("SHA-256")
  FileInputStream(file).use { input ->
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      digest.update(buffer, 0, read)
    }
  }
  return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

private fun certificateSha256(certificate: ByteArray): String {
  val digest = MessageDigest.getInstance("SHA-256").digest(certificate)
  return digest.joinToString(":") { byte -> "%02X".format(byte) }
}

private fun ZoptionApkTrust.Rejection.toUserMessage(): String {
  return when (this) {
    ZoptionApkTrust.Rejection.WRONG_RUNNING_PACKAGE ->
      "In-place updates are only available in the official Zoption Beta."
    ZoptionApkTrust.Rejection.WRONG_PACKAGE ->
      "The downloaded package identity does not match Zoption."
    ZoptionApkTrust.Rejection.INVALID_EXPECTED_VERSION,
    ZoptionApkTrust.Rejection.VERSION_MISMATCH ->
      "The downloaded package version does not match the update metadata."
    ZoptionApkTrust.Rejection.DOWNGRADE ->
      "The downloaded package is not newer than the installed version."
    ZoptionApkTrust.Rejection.MISSING_SIGNER,
    ZoptionApkTrust.Rejection.MULTIPLE_SIGNERS,
    ZoptionApkTrust.Rejection.WRONG_SIGNER ->
      "The downloaded package is not signed by the Zoption certificate."
  }
}

private fun versionCodeOf(info: PackageInfo): Long {
  return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
    info.longVersionCode
  } else {
    @Suppress("DEPRECATION")
    info.versionCode.toLong()
  }
}

private fun packageInfo(packageManager: PackageManager, packageName: String, flags: Int): PackageInfo? {
  return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
  } else {
    @Suppress("DEPRECATION")
    packageManager.getPackageInfo(packageName, flags)
  }
}

private fun packageArchiveInfo(packageManager: PackageManager, path: String, flags: Int): PackageInfo? {
  return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    packageManager.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(flags.toLong()))
  } else {
    @Suppress("DEPRECATION")
    packageManager.getPackageArchiveInfo(path, flags)
  }
}
