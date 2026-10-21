import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStoreProvider, useApp } from '../store/AppStore';
import { BootSplash } from '../ui/BootSplash';
import { useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { ready } = useApp();
  const t = useTheme();
  useEffect(() => { if (ready) SplashScreen.hide(); }, [ready]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="program/[dayId]" options={{ headerShown: true, title: '', headerBackTitle: 'Program', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.accent, headerShadowVisible: false }} />
          <Stack.Screen name="video" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      ) : null}
      <BootSplash ready={ready} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <Shell />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
