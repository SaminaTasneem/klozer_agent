import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DIALER_STORAGE_KEY = "remembered-dialer-number";

export default function HomeScreen() {
  const [dialerNumber, setDialerNumber] = useState("");
  const [rememberDialer, setRememberDialer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // useEffect(() => {
  //   AsyncStorage.getItem(DIALER_STORAGE_KEY)
  //     .then((savedNumber) => {
  //       if (savedNumber) {
  //         setDialerNumber(savedNumber);
  //         setRememberDialer(true);
  //       }
  //     })
  //     .finally(() => setIsLoading(false));
  // }, []);

  useEffect(() => {
    AsyncStorage.getItem(DIALER_STORAGE_KEY)
      .then((savedNumber) => {
        if (savedNumber) {
          router.replace({
            pathname: "/dialer",
            params: { number: savedNumber },
          });
          return;
        }

        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const handleNumberChange = (value: string) => {
    setDialerNumber(value.replace(/\D/g, ""));
    setError("");
  };

  const connectToDialer = async () => {
    const number = dialerNumber.trim();

    if (!number) {
      setError("Enter your dialer site number.");
      return;
    }

    try {
      if (rememberDialer) {
        await AsyncStorage.setItem(DIALER_STORAGE_KEY, number);
      } else {
        await AsyncStorage.removeItem(DIALER_STORAGE_KEY);
      }

      router.push({ pathname: "/dialer", params: { number } });
    } catch {
      setError("Unable to save your dialer number. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <Image
              accessibilityLabel="Klozer.io"
              resizeMode="contain"
              source={require("../../assets/images/app-logo.png")}
              style={styles.logo}
            />
            <Text style={styles.title}>AGENT PANEL</Text>
            <Text style={styles.subtitle}>
              Enter your provided dialer number to begin.
            </Text>
          </View>

          <View style={styles.form}>
            <View
              style={[styles.inputFrame, error ? styles.inputFrameError : null]}
            >
              <Text style={styles.inputLabel}>Dialer Site Number</Text>
              <SymbolView name="server.rack" tintColor="#08d7ae" size={24} />
              {isLoading ? (
                <ActivityIndicator color="#08d7ae" style={styles.loader} />
              ) : (
                <TextInput
                  autoFocus
                  keyboardType="number-pad"
                  maxLength={12}
                  onChangeText={handleNumberChange}
                  onSubmitEditing={connectToDialer}
                  placeholder="345"
                  placeholderTextColor="#555555"
                  returnKeyType="go"
                  selectionColor="#08d7ae"
                  style={styles.input}
                  value={dialerNumber}
                />
              )}
            </View>

            <View style={styles.errorRow}>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberDialer }}
              hitSlop={10}
              onPress={() => setRememberDialer((current) => !current)}
              style={styles.rememberRow}
            >
              <View
                style={[
                  styles.checkbox,
                  rememberDialer ? styles.checkboxChecked : null,
                ]}
              >
                {rememberDialer ? (
                  <SymbolView
                    name="checkmark"
                    tintColor="#020202"
                    size={16}
                    weight="bold"
                  />
                ) : null}
              </View>
              <Text style={styles.rememberText}>Remember this dialer site</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              onPress={connectToDialer}
              style={({ pressed }) => [
                styles.connectButton,
                pressed && styles.connectButtonPressed,
                isLoading && styles.connectButtonDisabled,
              ]}
            >
              <Text style={styles.connectButtonText}>CONNECT TO DIALER</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#050505" },
  keyboardView: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 36,
  },
  brandBlock: { alignItems: "center", marginBottom: 48 },
  logo: {
    aspectRatio: 121 / 43,
    height: 43,
    marginBottom: 22,
  },
  title: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: 0,
  },
  subtitle: {
    color: "#929292",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 14,
    textAlign: "center",
  },
  form: { width: "100%" },
  inputFrame: {
    alignItems: "center",
    borderColor: "#08d7ae",
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    height: 66,
    paddingHorizontal: 16,
    position: "relative",
  },
  inputFrameError: { borderColor: "#ff625f" },
  inputLabel: {
    backgroundColor: "#050505",
    color: "#a0a0a0",
    fontSize: 13,
    fontWeight: "700",
    left: 12,
    letterSpacing: 0,
    paddingHorizontal: 6,
    position: "absolute",
    top: -10,
  },
  input: {
    color: "#ffffff",
    flex: 1,
    fontSize: 20,
    height: "100%",
    letterSpacing: 0,
    marginLeft: 14,
    paddingVertical: 0,
  },
  loader: { marginLeft: 18 },
  errorRow: { height: 30, justifyContent: "center" },
  errorText: { color: "#ff7774", fontSize: 13, letterSpacing: 0 },
  rememberRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    minHeight: 44,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#ffffff",
    borderRadius: 3,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxChecked: { backgroundColor: "#08d7ae", borderColor: "#08d7ae" },
  rememberText: {
    color: "#eeeeee",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
    marginLeft: 14,
  },
  connectButton: {
    alignItems: "center",
    backgroundColor: "#08d7ae",
    borderRadius: 8,
    height: 58,
    justifyContent: "center",
    marginTop: 34,
  },
  connectButtonPressed: { backgroundColor: "#07b997" },
  connectButtonDisabled: { opacity: 0.55 },
  connectButtonText: {
    color: "#020202",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
  },
});
