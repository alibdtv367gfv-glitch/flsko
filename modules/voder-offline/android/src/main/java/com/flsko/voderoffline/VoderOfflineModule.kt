package com.flsko.voderoffline

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

/**
 * React Native bridge for offline ONNX TTS.
 */
class VoderOfflineModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val manager = VoderOfflineManager(reactContext)
  private val downloader = VoderModelDownloader(reactContext)
  private val io = Executors.newSingleThreadExecutor()

  override fun getName(): String = "VoderOffline"

  @ReactMethod
  fun isModelPresent(fileName: String, promise: Promise) {
    try {
      promise.resolve(downloader.isModelPresent(fileName))
    } catch (t: Throwable) {
      promise.reject("E_MODEL_CHECK", t.message, t)
    }
  }

  @ReactMethod
  fun ensureModel(url: String, fileName: String, force: Boolean, promise: Promise) {
    io.execute {
      try {
        val file = downloader.ensureModel(url, fileName, force)
        promise.resolve(file.absolutePath)
      } catch (t: Throwable) {
        promise.reject("E_MODEL_DOWNLOAD", t.message, t)
      }
    }
  }

  @ReactMethod
  fun initialize(modelPath: String, sampleRateHz: Int, promise: Promise) {
    io.execute {
      try {
        val ok = manager.initialize(modelPath, sampleRateHz)
        promise.resolve(ok)
      } catch (t: Throwable) {
        promise.reject("E_INIT", t.message, t)
      }
    }
  }

  /**
   * Interim text→ids: map BMP chars to codes (not full espeak phonemizer).
   * Replace with Piper phoneme IDs when integrating a real phonemizer JNI.
   */
  @ReactMethod
  fun speakText(text: String, promise: Promise) {
    io.execute {
      try {
        if (!manager.isReady()) {
          promise.reject("E_NOT_READY", "Call initialize() after ensureModel() first")
          return@execute
        }
        val ids = text.take(200).map { ch -> (ch.code % 256).toLong() }.toLongArray()
        if (ids.isEmpty()) {
          promise.resolve(false)
          return@execute
        }
        val ok = manager.speakPhonemes(ids)
        promise.resolve(ok)
      } catch (t: Throwable) {
        promise.reject("E_SPEAK", t.message, t)
      }
    }
  }

  @ReactMethod
  fun release(promise: Promise) {
    try {
      manager.release()
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject("E_RELEASE", t.message, t)
    }
  }
}
