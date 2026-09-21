package com.flsko.voderoffline

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.nio.FloatBuffer
import java.nio.LongBuffer

/**
 * On-device TTS inference via ONNX Runtime.
 * Load an INT8 (or FP32) VITS/VODER-exported graph and play the waveform with AudioTrack.
 */
class VoderOfflineManager(private val context: Context) {

  companion object {
    private const val TAG = "VoderOffline"
    private const val DEFAULT_SAMPLE_RATE = 22050
  }

  private var env: OrtEnvironment? = null
  private var session: OrtSession? = null
  private var sampleRate: Int = DEFAULT_SAMPLE_RATE
  private var ready: Boolean = false

  /**
   * Initialize ORT and open a session from an absolute path to a .onnx file
   * (typically under context.filesDir after download).
   */
  @Synchronized
  fun initialize(modelAbsolutePath: String, sampleRateHz: Int = DEFAULT_SAMPLE_RATE): Boolean {
    return try {
      release()
      val file = File(modelAbsolutePath)
      if (!file.exists() || !file.canRead()) {
        Log.e(TAG, "Model missing or unreadable: $modelAbsolutePath")
        return false
      }
      sampleRate = sampleRateHz
      env = OrtEnvironment.getEnvironment()
      val opts = OrtSession.SessionOptions().apply {
        setIntraOpNumThreads(2)
        setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
      }
      session = env!!.createSession(file.absolutePath, opts)
      ready = true
      Log.i(TAG, "Session ready: ${file.name} @ ${sampleRate}Hz")
      true
    } catch (t: Throwable) {
      Log.e(TAG, "initialize failed", t)
      ready = false
      release()
      false
    }
  }

  fun isReady(): Boolean = ready && session != null

  /**
   * Run TTS: phoneme id sequence → float PCM mono waveform in [-1, 1].
   * Caller is responsible for phonemization matching the training pipeline.
   */
  fun synthesize(phonemeIds: LongArray): FloatArray? {
    val ortSession = session ?: return null
    val ortEnv = env ?: return null
    if (phonemeIds.isEmpty()) return null

    return try {
      val ids = LongBuffer.wrap(phonemeIds)
      val shape = longArrayOf(1, phonemeIds.size.toLong())
      val lengths = longArrayOf(phonemeIds.size.toLong())

      OnnxTensor.createTensor(ortEnv, ids, shape).use { inputIds ->
        OnnxTensor.createTensor(ortEnv, LongBuffer.wrap(lengths), longArrayOf(1)).use { inputLen ->
          val inputs = mapOf(
            "phoneme_ids" to inputIds,
            "phoneme_lengths" to inputLen,
          )
          ortSession.run(inputs).use { results ->
            val out = results[0].value
            when (out) {
              is Array<*> -> {
                @Suppress("UNCHECKED_CAST")
                val batch = out as Array<FloatArray>
                batch.firstOrNull()
              }
              is FloatArray -> out
              else -> {
                Log.e(TAG, "Unexpected output type: ${out?.javaClass?.name}")
                null
              }
            }
          }
        }
      }
    } catch (t: Throwable) {
      Log.e(TAG, "synthesize failed", t)
      null
    }
  }

  /**
   * Play mono float PCM with AudioTrack (blocking until finished or error).
   */
  fun playFloatAudio(samples: FloatArray, sampleRateHz: Int = sampleRate): Boolean {
    if (samples.isEmpty()) return false
    return try {
      val channelConfig = AudioFormat.CHANNEL_OUT_MONO
      val encoding = AudioFormat.ENCODING_PCM_16BIT
      val minBuf = AudioTrack.getMinBufferSize(sampleRateHz, channelConfig, encoding)
      val pcm = ShortArray(samples.size) { i ->
        val v = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt()
        v.toShort()
      }
      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setSampleRate(sampleRateHz)
            .setEncoding(encoding)
            .setChannelMask(channelConfig)
            .build(),
        )
        .setBufferSizeInBytes(maxOf(minBuf, pcm.size * 2))
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()

      track.write(pcm, 0, pcm.size)
      track.play()
      // Wait roughly for duration
      val durationMs = (pcm.size * 1000L) / sampleRateHz
      Thread.sleep(durationMs.coerceAtMost(120_000L) + 50)
      track.stop()
      track.release()
      true
    } catch (t: Throwable) {
      Log.e(TAG, "playFloatAudio failed", t)
      false
    }
  }

  /** Convenience: synthesize + play. */
  fun speakPhonemes(phonemeIds: LongArray): Boolean {
    val audio = synthesize(phonemeIds) ?: return false
    return playFloatAudio(audio)
  }

  @Synchronized
  fun release() {
    try {
      session?.close()
    } catch (_: Throwable) {
    }
    session = null
    env = null
    ready = false
  }
}
