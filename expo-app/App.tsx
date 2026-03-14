import { StatusBar } from "expo-status-bar";
import { startTransition, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import AdminScreen from "./app/admin";
import HomeScreen from "./app/home";
import ResultScreen from "./app/result";
import ScanScreen from "./app/index";
import type { CheckinResponse } from "./types/checkin";

type Screen = "home" | "scanner" | "result" | "admin";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [result, setResult] = useState<CheckinResponse | null>(null);

  const handleResult = (nextResult: CheckinResponse) => {
    startTransition(() => {
      setResult(nextResult);
      setScreen("result");
    });
  };

  const handleScanAgain = () => {
    startTransition(() => {
      setResult(null);
      setScreen("scanner");
    });
  };

  const handleGoHome = () => {
    startTransition(() => {
      setResult(null);
      setScreen("home");
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.container}>
          {screen === "home" ? <HomeScreen onOpenAdmin={() => setScreen("admin")} onOpenScanner={() => setScreen("scanner")} /> : null}
          {screen === "scanner" ? <ScanScreen onBack={handleGoHome} onResult={handleResult} /> : null}
          {screen === "result" && result !== null ? (
            <ResultScreen onDone={handleGoHome} onScanAgain={handleScanAgain} result={result} />
          ) : null}
          {screen === "admin" ? <AdminScreen onBack={handleGoHome} /> : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3efe6",
  },
  container: {
    flex: 1,
  },
});
