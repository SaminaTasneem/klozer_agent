package expo.modules.audioroute

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ON_AUDIO_ROUTE_CHANGED = "onAudioRouteChanged"

class ExpoAudioRouteModule : Module() {
  private var preferredRoute = "speaker"
  private var isDeviceCallbackRegistered = false
  private var proximityWakeLock: PowerManager.WakeLock? = null

  private val audioManager: AudioManager
    get() {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is unavailable")
      return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

  private val audioDeviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      refreshRoute()
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      refreshRoute()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoAudioRoute")

    Events(ON_AUDIO_ROUTE_CHANGED)

    OnStartObserving(ON_AUDIO_ROUTE_CHANGED) {
      registerAudioDeviceCallback()
    }

    OnStopObserving(ON_AUDIO_ROUTE_CHANGED) {
      unregisterAudioDeviceCallback()
    }

    OnDestroy {
      unregisterAudioDeviceCallback()
      setProximityEnabled(false)
    }

    Function("getCurrentRoute") {
      currentRoute()
    }

    AsyncFunction("setRoute") { route: String ->
      require(route == "earpiece" || route == "speaker") {
        "Unsupported audio route: $route"
      }

      applyRoute(route)
    }

    AsyncFunction("setProximityEnabled") { enabled: Boolean ->
      setProximityEnabled(enabled)
    }
  }

  private fun registerAudioDeviceCallback() {
    if (isDeviceCallbackRegistered) {
      return
    }

    audioManager.registerAudioDeviceCallback(
      audioDeviceCallback,
      Handler(Looper.getMainLooper())
    )
    isDeviceCallbackRegistered = true
  }

  private fun unregisterAudioDeviceCallback() {
    if (!isDeviceCallbackRegistered) {
      return
    }

    audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
    isDeviceCallbackRegistered = false
  }

  private fun refreshRoute() {
    try {
      applyRoute(preferredRoute)
    } catch (_: Exception) {
      sendRouteChanged(currentRoute())
    }
  }

  private fun applyRoute(route: String): String {
    preferredRoute = route
    val manager = audioManager
    manager.mode = AudioManager.MODE_IN_COMMUNICATION

    val selectedRoute = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      applyModernRoute(manager, route)
    } else {
      applyLegacyRoute(manager, route)
    }

    setProximityEnabled(selectedRoute == "earpiece")
    sendRouteChanged(selectedRoute)
    return selectedRoute
  }

  private fun currentRoute(): String {
    val manager = audioManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      manager.communicationDevice?.let { device ->
        return routeForDevice(device)
      }

      if (manager.availableCommunicationDevices.any(::isExternalDevice)) {
        return "headphones"
      }
    } else if (manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any(::isExternalDevice)) {
      return "headphones"
    }

    return if (manager.isSpeakerphoneOn) "speaker" else "earpiece"
  }

  private fun applyModernRoute(manager: AudioManager, route: String): String {
    val devices = manager.availableCommunicationDevices
    val externalDevice = devices.firstOrNull(::isExternalDevice)

    if (externalDevice != null) {
      manager.setCommunicationDevice(externalDevice)
      return "headphones"
    }

    val desiredType = if (route == "speaker") {
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
    } else {
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
    }
    val desiredDevice = devices.firstOrNull { it.type == desiredType }

    if (desiredDevice != null && manager.setCommunicationDevice(desiredDevice)) {
      return route
    }

    manager.clearCommunicationDevice()
    return currentRoute()
  }

  @Suppress("DEPRECATION")
  private fun applyLegacyRoute(manager: AudioManager, route: String): String {
    val externalDevice = manager
      .getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      .firstOrNull(::isExternalDevice)

    if (externalDevice != null) {
      manager.isSpeakerphoneOn = false
      if (externalDevice.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
        manager.startBluetoothSco()
        manager.isBluetoothScoOn = true
      }
      return "headphones"
    }

    if (manager.isBluetoothScoOn) {
      manager.stopBluetoothSco()
      manager.isBluetoothScoOn = false
    }
    manager.isSpeakerphoneOn = route == "speaker"
    return route
  }

  private fun routeForDevice(device: AudioDeviceInfo): String = when {
    isExternalDevice(device) -> "headphones"
    device.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
    else -> "speaker"
  }

  private fun isExternalDevice(device: AudioDeviceInfo): Boolean = when (device.type) {
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_DEVICE,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_HEARING_AID -> true
    else -> false
  }

  private fun sendRouteChanged(route: String) {
    sendEvent(ON_AUDIO_ROUTE_CHANGED, bundleOf("route" to route))
  }

  @Suppress("WakelockTimeout")
  private fun setProximityEnabled(enabled: Boolean) {
    if (!enabled) {
      proximityWakeLock?.let { wakeLock ->
        if (wakeLock.isHeld) {
          wakeLock.release()
        }
      }
      proximityWakeLock = null
      return
    }

    if (proximityWakeLock?.isHeld == true) {
      return
    }

    val context = appContext.reactContext ?: return
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    if (!powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
      return
    }

    proximityWakeLock = powerManager.newWakeLock(
      PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
      "KlozerAgent:AudioRouteProximity"
    ).apply {
      setReferenceCounted(false)
      acquire()
    }
  }
}
