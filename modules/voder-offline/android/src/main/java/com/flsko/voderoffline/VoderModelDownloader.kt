package com.flsko.voderoffline

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Ensures ONNX model files exist in the app internal directory.
 * Downloads once from HTTPS then reuses offline.
 */
class VoderModelDownloader(private val context: Context) {

  companion object {
    private const val TAG = "VoderModelDl"
    const val DEFAULT_MODEL_NAME = "voder_tts_int8.onnx"
  }

  data class Progress(val bytesRead: Long, val totalBytes: Long) {
    val percent: Int
      get() = if (totalBytes > 0) ((bytesRead * 100) / totalBytes).toInt().coerceIn(0, 100) else -1
  }

  fun modelsDir(): File {
    val dir = File(context.filesDir, "voder-models")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  fun localModelFile(fileName: String = DEFAULT_MODEL_NAME): File =
    File(modelsDir(), fileName)

  fun isModelPresent(fileName: String = DEFAULT_MODEL_NAME): Boolean {
    val f = localModelFile(fileName)
    return f.exists() && f.length() > 0
  }

  /**
   * Download [url] to internal storage if missing.
   * [onProgress] may be invoked from a background thread — post to main if updating UI.
   */
  fun ensureModel(
    url: String,
    fileName: String = DEFAULT_MODEL_NAME,
    force: Boolean = false,
    onProgress: ((Progress) -> Unit)? = null,
  ): File {
    val dest = localModelFile(fileName)
    if (!force && dest.exists() && dest.length() > 0) {
      Log.i(TAG, "Model already present: ${dest.absolutePath}")
      return dest
    }

    val tmp = File(dest.absolutePath + ".part")
    if (tmp.exists()) tmp.delete()

    var connection: HttpURLConnection? = null
    try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 30_000
        readTimeout = 120_000
        instanceFollowRedirects = true
        requestMethod = "GET"
        setRequestProperty("User-Agent", "Flsko-VoderOffline/1.0")
      }
      connection.connect()
      val code = connection.responseCode
      if (code !in 200..299) {
        throw IllegalStateException("HTTP $code while downloading model")
      }
      val total = connection.contentLengthLong
      connection.inputStream.use { input ->
        FileOutputStream(tmp).use { output ->
          val buf = ByteArray(64 * 1024)
          var readTotal = 0L
          while (true) {
            val n = input.read(buf)
            if (n <= 0) break
            output.write(buf, 0, n)
            readTotal += n
            onProgress?.invoke(Progress(readTotal, total))
          }
          output.flush()
        }
      }
      if (dest.exists()) dest.delete()
      if (!tmp.renameTo(dest)) {
        tmp.copyTo(dest, overwrite = true)
        tmp.delete()
      }
      Log.i(TAG, "Downloaded model → ${dest.absolutePath} (${dest.length()} bytes)")
      return dest
    } catch (t: Throwable) {
      Log.e(TAG, "ensureModel failed", t)
      tmp.delete()
      throw t
    } finally {
      connection?.disconnect()
    }
  }
}
