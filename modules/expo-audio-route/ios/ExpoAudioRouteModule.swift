import AVFAudio
import ExpoModulesCore
import UIKit

private let onAudioRouteChanged = "onAudioRouteChanged"

public final class ExpoAudioRouteModule: Module {
  private var preferredRoute = "speaker"

  public func definition() -> ModuleDefinition {
    Name("ExpoAudioRoute")

    Events(onAudioRouteChanged)

    OnStartObserving(onAudioRouteChanged) {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleRouteChange(_:)),
        name: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance()
      )
    }

    OnStopObserving(onAudioRouteChanged) {
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance()
      )
    }

    Function("getCurrentRoute") {
      return self.currentRoute()
    }

    AsyncFunction("setRoute") { (route: String) in
      guard route == "earpiece" || route == "speaker" else {
        throw InvalidAudioRouteException(route)
      }

      return try self.applyRoute(route)
    }.runOnQueue(.main)

    AsyncFunction("setProximityEnabled") { (enabled: Bool) in
      UIDevice.current.isProximityMonitoringEnabled = enabled
    }.runOnQueue(.main)
  }

  private func applyRoute(_ route: String) throws -> String {
    preferredRoute = route

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetoothHFP, .allowBluetoothA2DP]
    )
    try session.setActive(true)

    if hasExternalAudioRoute(session.currentRoute) {
      UIDevice.current.isProximityMonitoringEnabled = false
      sendRouteChanged("headphones")
      return "headphones"
    }

    try session.overrideOutputAudioPort(route == "speaker" ? .speaker : .none)
    UIDevice.current.isProximityMonitoringEnabled = route == "earpiece"
    sendRouteChanged(route)
    return route
  }

  private func currentRoute() -> String {
    let route = AVAudioSession.sharedInstance().currentRoute

    if hasExternalAudioRoute(route) {
      return "headphones"
    }

    if route.outputs.contains(where: { $0.portType == .builtInReceiver }) {
      return "earpiece"
    }

    return "speaker"
  }

  private func hasExternalAudioRoute(_ route: AVAudioSessionRouteDescription) -> Bool {
    return route.outputs.contains { output in
      switch output.portType {
      case .headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE,
           .airPlay, .carAudio, .lineOut, .usbAudio, .HDMI:
        return true
      default:
        return false
      }
    }
  }

  private func sendRouteChanged(_ route: String) {
    sendEvent(onAudioRouteChanged, ["route": route])
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    DispatchQueue.main.async {
      let session = AVAudioSession.sharedInstance()

      if self.hasExternalAudioRoute(session.currentRoute) {
        UIDevice.current.isProximityMonitoringEnabled = false
        self.sendRouteChanged("headphones")
        return
      }

      let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
      let reason = reasonValue.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))

      if reason == .oldDeviceUnavailable {
        do {
          _ = try self.applyRoute(self.preferredRoute)
        } catch {
          self.sendRouteChanged(self.currentRoute())
        }
        return
      }

      let route = self.currentRoute()
      UIDevice.current.isProximityMonitoringEnabled = route == "earpiece"
      self.sendRouteChanged(route)
    }
  }
}

private final class InvalidAudioRouteException: GenericException<String> {
  override var reason: String {
    "Unsupported audio route: \(param)"
  }
}
