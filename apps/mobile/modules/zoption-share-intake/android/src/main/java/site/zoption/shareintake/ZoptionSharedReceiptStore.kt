package site.zoption.shareintake

import android.content.ContentResolver
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import org.json.JSONObject

/**
 * Holds at most one shared image until the app reads it. The pending record lives in
 * SharedPreferences so a share that cold-starts the app survives until JavaScript is ready.
 */
object ZoptionSharedReceiptStore {
  /** The receipt extract route's own cap. */
  private const val MAX_BYTES = 8L * 1024 * 1024
  private val ACCEPTED = mapOf("image/jpeg" to "jpg", "image/png" to "png", "image/webp" to "webp")
  private const val DIRECTORY = "zoption-shared-receipts"
  private const val PREFERENCES = "zoption_share_intake"
  private const val PENDING = "pending"

  fun accept(context: Context, uri: Uri): Boolean {
    // Only a content URI granted by the sharing app. A file:// URI, or one of Zoption's own
    // providers, could point a share at Zoption's private files and upload them.
    if (uri.scheme != ContentResolver.SCHEME_CONTENT) return false
    if (uri.authority?.startsWith(context.packageName) != false) return false
    val resolver = context.contentResolver
    val mimeType = resolver.getType(uri)?.substringBefore(';')?.trim()?.lowercase() ?: return false
    val extension = ACCEPTED[mimeType] ?: return false

    val directory = File(context.cacheDir, DIRECTORY).apply { mkdirs() }
    directory.listFiles()?.forEach { it.delete() }
    val target = File(directory, "shared-${System.currentTimeMillis()}.$extension")
    try {
      val input = resolver.openInputStream(uri) ?: return false
      input.use { source ->
        FileOutputStream(target).use { sink ->
          val buffer = ByteArray(64 * 1024)
          var total = 0L
          while (true) {
            val read = source.read(buffer)
            if (read < 0) break
            total += read
            if (total > MAX_BYTES) throw IOException("Shared image is over the receipt size cap.")
            sink.write(buffer, 0, read)
          }
        }
      }
    } catch (error: Exception) {
      target.delete()
      return false
    }
    preferences(context).edit()
      .putString(
        PENDING,
        JSONObject().put("path", target.absolutePath).put("mimeType", mimeType).toString(),
      )
      .apply()
    return true
  }

  /** Returns the pending image once, then forgets it. */
  fun consume(context: Context): Map<String, Any>? {
    val preferences = preferences(context)
    val pending = preferences.getString(PENDING, null) ?: return null
    preferences.edit().remove(PENDING).apply()
    val record = try {
      JSONObject(pending)
    } catch (error: Exception) {
      return null
    }
    val file = File(record.optString("path"))
    if (!file.isFile) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      file.delete()
      return null
    }
    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "fileName" to file.name,
      "mimeType" to record.optString("mimeType"),
      "width" to bounds.outWidth,
      "height" to bounds.outHeight,
    )
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
