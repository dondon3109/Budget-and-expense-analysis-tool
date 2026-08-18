package site.zoption.apkupdater

/**
 * Immutable production identity for in-place APK updates.
 *
 * These values are the native trust anchor. JavaScript cannot supply, replace,
 * or override them. Only the public package name and certificate fingerprint
 * are embedded — never the private signing key.
 */
internal object ZoptionApkTrust {
  const val TRUSTED_PACKAGE_ID = "site.zoption.android"
  const val TRUSTED_SIGNER_SHA256 =
    "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D"

  enum class Rejection {
    WRONG_RUNNING_PACKAGE,
    WRONG_PACKAGE,
    INVALID_EXPECTED_VERSION,
    VERSION_MISMATCH,
    DOWNGRADE,
    MISSING_SIGNER,
    MULTIPLE_SIGNERS,
    WRONG_SIGNER,
  }

  data class Inspection(
    val packageName: String,
    val versionCode: Long,
    val signerSha256: List<String>,
  )

  fun evaluate(
    runningPackageName: String,
    inspection: Inspection,
    expectedVersionCode: Long,
    installedVersionCode: Long,
  ): Rejection? {
    if (runningPackageName != TRUSTED_PACKAGE_ID) {
      return Rejection.WRONG_RUNNING_PACKAGE
    }
    if (inspection.packageName != TRUSTED_PACKAGE_ID) {
      return Rejection.WRONG_PACKAGE
    }
    if (expectedVersionCode <= 0) {
      return Rejection.INVALID_EXPECTED_VERSION
    }
    if (inspection.versionCode != expectedVersionCode) {
      return Rejection.VERSION_MISMATCH
    }
    if (inspection.versionCode <= installedVersionCode) {
      return Rejection.DOWNGRADE
    }

    val signers = inspection.signerSha256
      .mapNotNull(::normalizeCertificateSha256)
      .distinct()
    if (signers.isEmpty()) {
      return Rejection.MISSING_SIGNER
    }
    if (signers.size != 1) {
      return Rejection.MULTIPLE_SIGNERS
    }
    if (signers.first() != TRUSTED_SIGNER_SHA256) {
      return Rejection.WRONG_SIGNER
    }
    return null
  }
}

internal fun normalizeCertificateSha256(value: String): String? {
  val trimmed = value.trim()
  val hex = if (trimmed.contains(":")) {
    trimmed.replace(":", "")
  } else {
    trimmed
  }
  if (!hex.matches(Regex("^[0-9a-fA-F]{64}$"))) return null
  return hex.chunked(2).joinToString(":") { it.uppercase() }
}
