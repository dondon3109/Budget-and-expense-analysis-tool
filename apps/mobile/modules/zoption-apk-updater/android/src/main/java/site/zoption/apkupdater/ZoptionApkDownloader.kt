package site.zoption.apkupdater

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Streams one trusted, versioned APK without emitting progress events.
 *
 * React samples the destination file size at a bounded rate. Keeping the byte
 * loop native avoids the Expo progress bridge and preserves explicit
 * cancellation without delegating trust decisions to JavaScript.
 */
internal class ZoptionApkDownloader {
  private val client = OkHttpClient.Builder()
    .followRedirects(false)
    .followSslRedirects(false)
    .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    .readTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    .build()
  private val activeDownloads = ConcurrentHashMap<String, Call>()
  private val cancelledDownloads = ConcurrentHashMap.newKeySet<String>()

  suspend fun download(
    downloadId: String,
    downloadUrl: String,
    destination: File,
    expectedSize: Long,
  ): DownloadedApk = withContext(Dispatchers.IO) {
    validateDownloadId(downloadId)
    val uri = trustedDownloadUri(downloadUrl)
    if (expectedSize <= 0 || expectedSize > MAX_APK_BYTES) {
      throw IOException("The expected APK size is invalid.")
    }
    if (cancelledDownloads.remove(downloadId)) {
      throw IOException("The APK download was cancelled.")
    }

    val request = Request.Builder()
      .url(uri.toURL())
      .header("Accept", APK_MIME_TYPE)
      .header("Accept-Encoding", "identity")
      .get()
      .build()
    val call = client.newCall(request)

    if (activeDownloads.putIfAbsent(downloadId, call) != null) {
      call.cancel()
      throw IOException("The APK download identifier is already active.")
    }

    var completed = false
    try {
      ensureNotCancelled(downloadId)
      call.execute().use { response ->
        ensureNotCancelled(downloadId)
        if (response.code != 200) {
          throw IOException("The APK server returned HTTP ${response.code}.")
        }
        val body = response.body ?: throw IOException("The APK server returned no file body.")
        if (body.contentLength() != expectedSize) {
          throw IOException("The APK server returned an unexpected file size.")
        }

        val parent = destination.parentFile
          ?: throw IOException("The APK destination has no parent directory.")
        if (!parent.exists() && !parent.mkdirs()) {
          throw IOException("The APK destination directory could not be created.")
        }
        if (destination.exists() && !destination.delete()) {
          throw IOException("The previous APK download could not be replaced.")
        }

        var totalBytes = 0L
        body.byteStream().use { input ->
          FileOutputStream(destination, false).use { output ->
            val buffer = ByteArray(COPY_BUFFER_BYTES)
            while (true) {
              currentCoroutineContext().ensureActive()
              ensureNotCancelled(downloadId)
              val read = input.read(buffer)
              if (read < 0) break
              if (read == 0) continue
              totalBytes += read
              if (totalBytes > expectedSize) {
                throw IOException("The APK download exceeded its expected size.")
              }
              output.write(buffer, 0, read)
            }
          }
        }
        if (totalBytes != expectedSize) {
          throw IOException("The APK download ended before the expected size was reached.")
        }

        completed = true
        DownloadedApk(totalBytes)
      }
    } finally {
      activeDownloads.remove(downloadId, call)
      cancelledDownloads.remove(downloadId)
      call.cancel()
      if (!completed) {
        destination.delete()
      }
    }
  }

  fun cancel(downloadId: String) {
    validateDownloadId(downloadId)
    cancelledDownloads.add(downloadId)
    activeDownloads[downloadId]?.cancel()
  }

  private fun ensureNotCancelled(downloadId: String) {
    if (cancelledDownloads.contains(downloadId)) {
      throw IOException("The APK download was cancelled.")
    }
  }

  data class DownloadedApk(val size: Long)

  companion object {
    private const val TRUSTED_DOWNLOAD_HOST = "downloads.zoption.site"
    private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    private const val CONNECT_TIMEOUT_MS = 30_000L
    private const val READ_TIMEOUT_MS = 30_000L
    private const val COPY_BUFFER_BYTES = 256 * 1024
    private const val MAX_APK_BYTES = 1024L * 1024L * 1024L
    private val DOWNLOAD_ID = Regex("^[A-Za-z0-9-]{1,80}$")
    private val APK_PATH = Regex("^/android/[A-Za-z0-9._-]+\\.apk$")

    private fun validateDownloadId(downloadId: String) {
      if (!DOWNLOAD_ID.matches(downloadId)) {
        throw IOException("The APK download identifier is invalid.")
      }
    }

    private fun trustedDownloadUri(downloadUrl: String): URI {
      val uri = try {
        URI(downloadUrl)
      } catch (_: Exception) {
        throw IOException("The APK download URL is invalid.")
      }
      val trusted =
        uri.scheme == "https" &&
          uri.host == TRUSTED_DOWNLOAD_HOST &&
          (uri.port == -1 || uri.port == 443) &&
          uri.rawUserInfo == null &&
          uri.rawQuery == null &&
          uri.rawFragment == null &&
          APK_PATH.matches(uri.rawPath ?: "")
      if (!trusted) {
        throw IOException("The APK download URL is not trusted.")
      }
      return uri
    }
  }
}
