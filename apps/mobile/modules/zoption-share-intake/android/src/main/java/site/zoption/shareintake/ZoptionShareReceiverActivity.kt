package site.zoption.shareintake

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle

/**
 * Receives an image shared from another app (a GCash or bank screenshot), keeps a private copy
 * for the receipt scanner, and brings Zoption forward. It never draws and never stays in recents.
 */
class ZoptionShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    sharedStream(intent)?.let { ZoptionSharedReceiptStore.accept(this, it) }
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      startActivity(launch)
    }
    finish()
  }

  private fun sharedStream(intent: Intent?): Uri? {
    if (intent?.action != Intent.ACTION_SEND) return null
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
  }
}
