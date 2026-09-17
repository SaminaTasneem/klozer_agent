import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/build/react-navigation/native";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import {
  addAudioRouteListener,
  disableProximityMonitoring,
  getCurrentAudioRoute,
  isAudioRouteAvailable,
  setAudioRoute,
  type AudioRoute,
} from "../../modules/expo-audio-route/src";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type DialerLoadError = "checking" | "network" | "wrongNumber" | null;

const INTERNET_CHECK_URL = "https://klozer.app";
const INTERNET_CHECK_TIMEOUT_MS = 6000;

export default function DialerScreen() {
  const { number } = useLocalSearchParams<{ number?: string }>();
  const [webViewKey, setWebViewKey] = useState(0);
  const [loadError, setLoadError] = useState<DialerLoadError>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [audioRoute, setCurrentAudioRoute] =
    useState<AudioRoute>("speaker");
  const [isChangingAudioRoute, setIsChangingAudioRoute] = useState(false);
  // const [isAgentLoggedOut, setIsAgentLoggedOut] = useState(false);
  type AgentSessionState = "unknown" | "loggedIn" | "loggedOut";
  const [agentSessionState, setAgentSessionState] =
    useState<AgentSessionState>("loggedOut");
  const DIALER_STORAGE_KEY = "remembered-dialer-number";
  const agentLoginNotificationId = useRef<string | null>(null);
  const errorCheckId = useRef(0);

  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios" || !isAudioRouteAvailable) {
      return;
    }

    setCurrentAudioRoute(getCurrentAudioRoute());
    const subscription = addAudioRouteListener(({ route }) => {
      setCurrentAudioRoute(route);
    });

    return () => {
      subscription?.remove();
      void disableProximityMonitoring();
    };
  }, []);

  // const currentAppState = useRef<AppStateStatus>(AppState.currentState);
  // const reminderNotificationId = useRef<string | null>(null);

  useEffect(() => {
    const updateAgentNotification = async () => {
      if (agentSessionState === "loggedIn") {
        const existingId = agentLoginNotificationId.current;

        if (existingId) {
          await Notifications.cancelScheduledNotificationAsync(
            existingId,
          ).catch(() => {});
          await Notifications.dismissNotificationAsync(existingId).catch(
            () => {},
          );
        }

        agentLoginNotificationId.current =
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Agent logged in",
              body: "You are currently logged in to the dialer.",
              sound: "default",
            },
            trigger: null,
          });

        return;
      }

      if (agentSessionState === "loggedOut") {
        const id = agentLoginNotificationId.current;

        if (!id) {
          return;
        }

        await Notifications.cancelScheduledNotificationAsync(id).catch(
          () => {},
        );
        await Notifications.dismissNotificationAsync(id).catch(() => {});

        agentLoginNotificationId.current = null;
      }
    };

    void updateAgentNotification();
  }, [agentSessionState]);

  usePreventRemove(agentSessionState !== "loggedOut", () => {
    if (agentSessionState === "loggedIn") {
      Alert.alert(
        "Agent is still logged in",
        "Please use the red logout button to log out as the agent first.",
      );
      return;
    }

    Alert.alert(
      "Checking agent status",
      "The website has not confirmed the agent logout status yet.",
    );
  });

  const handleLogout = async () => {
    if (agentSessionState === "loggedIn") {
      Alert.alert(
        "Agent is still logged in",
        "Please use the red logout button to log out as the agent first.",
      );
      return;
    }

    // if (agentSessionState === "unknown") {
    //   Alert.alert(
    //     "Checking agent status",
    //     "The website has not confirmed the agent logout status yet.",
    //   );
    //   return;
    // }

    try {
      await AsyncStorage.removeItem(DIALER_STORAGE_KEY);
      router.replace("/");
    } catch {
      Alert.alert("Logout failed", "Unable to clear the saved dialer number.");
    }
  };

  const toggleAudioRoute = async () => {
    if (!isAudioRouteAvailable) {
      Alert.alert(
        "Audio controls unavailable",
        "Rebuild the iOS app to install the audio-route controls.",
      );
      return;
    }

    if (audioRoute === "headphones") {
      Alert.alert(
        "Headphones connected",
        "Disconnect your headphones to choose between the earpiece and speaker.",
      );
      return;
    }

    setIsChangingAudioRoute(true);

    try {
      const nextRoute = audioRoute === "speaker" ? "earpiece" : "speaker";
      setCurrentAudioRoute(await setAudioRoute(nextRoute));
    } catch {
      Alert.alert(
        "Could not change audio output",
        "Make sure a call is active, then try again.",
      );
    } finally {
      setIsChangingAudioRoute(false);
    }
  };

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (
        message.type === "AGENT_SESSION_STATE" &&
        typeof message.loggedIn === "boolean"
      ) {
        setAgentSessionState(message.loggedIn ? "loggedIn" : "loggedOut");
      }
    } catch {
      // Ignore unrelated or invalid messages.
    }
  };

  const dialerNumber =
    typeof number === "string" ? number.replace(/\D/g, "") : "";
  const dialerUrl = `https://dialer${dialerNumber}.klozer.app/agent/dialer.php`;
  // const visibleUrl = (currentUrl || dialerUrl).replace(/^https?:\/\//, "");
  const visibleUrl = `Dialer ${dialerNumber}`;

  const checkInternetConnection = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      INTERNET_CHECK_TIMEOUT_MS,
    );

    try {
      await fetch(INTERNET_CHECK_URL, {
        cache: "no-store",
        method: "HEAD",
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleWebViewError = async () => {
    const checkId = errorCheckId.current + 1;
    errorCheckId.current = checkId;
    setLoadError("checking");

    const hasInternet = await checkInternetConnection();

    if (errorCheckId.current !== checkId) {
      return;
    }

    setLoadError(hasInternet ? "wrongNumber" : "network");
  };

  const retryDialer = () => {
    errorCheckId.current += 1;
    setLoadError(null);
    setWebViewKey((key) => key + 1);
  };

  const changeDialerNumber = async () => {
    const savedNumber = await AsyncStorage.getItem(DIALER_STORAGE_KEY).catch(
      () => null,
    );

    if (savedNumber === dialerNumber) {
      await AsyncStorage.removeItem(DIALER_STORAGE_KEY).catch(() => {});
    }

    router.replace("/");
  };

  if (!dialerNumber) {
    return (
      <View style={styles.messageContainer}>
        <Text style={styles.messageTitle}>Dialer number missing</Text>
        <Text style={styles.messageText}>
          Go back and enter a valid dialer site number.
        </Text>
      </View>
    );
  }

  if (loadError) {
    const isChecking = loadError === "checking";
    const isWrongNumber = loadError === "wrongNumber";

    return (
      <View style={styles.messageContainer}>
        {isChecking ? (
          <ActivityIndicator color="#08d7ae" size="large" />
        ) : (
          <SymbolView
            name={
              isWrongNumber
                ? "exclamationmark.triangle"
                : "wifi.exclamationmark"
            }
            tintColor="#08d7ae"
            size={42}
          />
        )}
        <Text style={styles.messageTitle}>
          {isChecking
            ? "Checking connection"
            : isWrongNumber
              ? "Wrong dialer number"
              : "Internet connection is unstable"}
        </Text>
        <Text style={styles.messageText}>
          {isChecking
            ? "Please wait while we check your internet connection."
            : isWrongNumber
              ? `Dialer ${dialerNumber} could not be found. Check the number and try again.`
              : "Check your internet connection, then try again."}
        </Text>
        {!isChecking ? (
          <Pressable
            onPress={isWrongNumber ? changeDialerNumber : retryDialer}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>
              {isWrongNumber ? "CHANGE NUMBER" : "TRY AGAIN"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.browserBar}>
        <View style={styles.addressBlock}>
          <SymbolView name="lock.fill" tintColor="#8f969a" size={14} />
          <Text numberOfLines={1} style={styles.addressText}>
            {visibleUrl}
          </Text>
        </View>
        {Platform.OS === "ios" ? (
          <Pressable
            accessibilityLabel={`Audio output: ${audioRoute}`}
            accessibilityRole="button"
            disabled={isChangingAudioRoute}
            hitSlop={8}
            onPress={() => void toggleAudioRoute()}
            style={({ pressed }) => [
              styles.audioRouteButton,
              pressed && styles.headerButtonPressed,
              isChangingAudioRoute && styles.headerButtonDisabled,
            ]}
          >
            <SymbolView
              name={
                audioRoute === "headphones"
                  ? "headphones"
                  : audioRoute === "earpiece"
                    ? "ear"
                    : "speaker.wave.2.fill"
              }
              tintColor="#08d7ae"
              size={27}
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Log out"
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.headerButtonPressed,
          ]}
        >
          <SymbolView
            name="rectangle.portrait.and.arrow.right"
            tintColor="#08d7ae"
            size={30}
          />
        </Pressable>
      </View>

      <View style={styles.webViewContainer}>
        <WebView
          key={webViewKey}
          ignoreSilentHardwareSwitch
          mediaCapturePermissionGrantType="prompt"
          allowsInlineMediaPlayback
          domStorageEnabled
          incognito
          javaScriptEnabled
          webviewDebuggingEnabled
          mediaPlaybackRequiresUserAction={false}
          onError={() => void handleWebViewError()}
          onNavigationStateChange={(state) => setCurrentUrl(state.url)}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#08d7ae" size="large" />
            </View>
          )}
          source={{ uri: dialerUrl }}
          startInLoadingState
          onMessage={handleWebViewMessage}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#050505",
    flex: 1,
  },
  browserBar: {
    alignItems: "center",
    backgroundColor: "#050505",
    borderBottomColor: "#151b1e",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 76,
    paddingLeft: 20,
    paddingRight: 16,
  },
  addressBlock: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    marginRight: 14,
    minWidth: 0,
  },
  addressText: {
    color: "#d9dcde",
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    marginLeft: 9,
  },
  logoutButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  audioRouteButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    marginRight: 4,
    width: 48,
  },
  headerButtonPressed: {
    opacity: 0.6,
  },
  headerButtonDisabled: {
    opacity: 0.45,
  },
  webViewContainer: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: "center",
    backgroundColor: "#050505",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  messageContainer: {
    alignItems: "center",
    backgroundColor: "#050505",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  messageTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 18,
    textAlign: "center",
  },
  messageText: {
    color: "#999999",
    fontSize: 14,
    letterSpacing: 0,
    marginTop: 10,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: "#08d7ae",
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
    marginTop: 28,
    width: 180,
  },
  retryButtonPressed: { backgroundColor: "#07b997" },
  retryButtonText: {
    color: "#020202",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
});
