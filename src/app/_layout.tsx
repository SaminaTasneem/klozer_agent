import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: "#050505" },
          headerStyle: { backgroundColor: "#111111" },
          headerTintColor: "#ffffff",
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="dialer"
          options={{ headerShown: false, headerBackButtonMenuEnabled: false }}
        />
      </Stack>
    </>
  );
}
