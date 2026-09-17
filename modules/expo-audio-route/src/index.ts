import {
  type EventSubscription,
  type NativeModule,
  requireOptionalNativeModule,
} from "expo-modules-core";

export type AudioRoute = "earpiece" | "speaker" | "headphones";

type AudioRouteChangedEvent = {
  route: AudioRoute;
};

type AudioRouteEvents = {
  onAudioRouteChanged: (event: AudioRouteChangedEvent) => void;
};

declare class ExpoAudioRouteModule extends NativeModule<AudioRouteEvents> {
  getCurrentRoute(): AudioRoute;
  setRoute(route: Exclude<AudioRoute, "headphones">): Promise<AudioRoute>;
  setProximityEnabled(enabled: boolean): Promise<void>;
}

const nativeModule =
  requireOptionalNativeModule<ExpoAudioRouteModule>("ExpoAudioRoute");

export const isAudioRouteAvailable = nativeModule !== null;

export function getCurrentAudioRoute(): AudioRoute {
  return nativeModule?.getCurrentRoute() ?? "speaker";
}

export async function setAudioRoute(
  route: Exclude<AudioRoute, "headphones">,
): Promise<AudioRoute> {
  if (!nativeModule) {
    throw new Error("The native audio-route module is not installed.");
  }

  return nativeModule.setRoute(route);
}

export async function disableProximityMonitoring(): Promise<void> {
  await nativeModule?.setProximityEnabled(false);
}

export function addAudioRouteListener(
  listener: AudioRouteEvents["onAudioRouteChanged"],
): EventSubscription | null {
  return nativeModule?.addListener("onAudioRouteChanged", listener) ?? null;
}
