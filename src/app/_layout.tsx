import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStoreProvider, useApp } from '../store/AppStore';
import { ShareProvider } from '../store/ShareStore';
import { BootSplash } from '../ui/BootSplash';
import { F, FONT_FILES, useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell({ fontsReady }: { fontsReady: boolean }) {
  const { ready: dataReady } = useApp();
  const ready = dataReady && fontsReady;
  const t = useTheme();
  useEffect(() => { if (ready) SplashScreen.hide(); }, [ready]);
  const header = { headerShown: true, title: '', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.ink, headerShadowVisible: false, headerTitleStyle: { fontFamily: F.semi, color: t.ink } } as const;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="program/[dayId]" options={{ ...header, headerBackTitle: 'Program' }} />
          <Stack.Screen name="video" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="settings" options={{ ...header, headerBackTitle: 'Today' }} />
          <Stack.Screen name="results" options={{ presentation: 'modal', headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="whoop" options={{ headerShown: false }} />
        </Stack>
      ) : null}
      <BootSplash ready={ready} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <ShareProvider>
          <Shell fontsReady={fontsLoaded || !!fontError} />
        </ShareProvider>
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
