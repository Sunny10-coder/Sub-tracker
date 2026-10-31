import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { initServerUrl } from "@/src/lib/api";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  // Load the Material Design Icons glyph font so icons render inside Expo Go.
  const [fontsLoaded, fontError] = useFonts({
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  });

  // Load the server address saved in Settings before any screen makes a request.
  const [serverReady, setServerReady] = useState(false);
  useEffect(() => {
    const load = async () => {
      try {
        await initServerUrl();
      } finally {
        setServerReady(true);
      }
    };
    void load();
  }, []);

  if (!serverReady || !(fontsLoaded || fontError)) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <View style={{ flex: 1, backgroundColor: colors.surface }}>
                <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                  <Stack.Screen name="actions" options={{ presentation: "transparentModal", animation: "fade" }} />
                </Stack>
              </View>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
