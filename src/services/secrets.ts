/** The Claude key lives in the phone's secure storage (Android Keystore), never in Pace's regular data. */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'pace.claudeKey';
let memory: string | null = null;

export async function getClaudeKey(): Promise<string | null> {
  if (Platform.OS === 'web') return memory;
  try { return (await SecureStore.getItemAsync(KEY)) || null; } catch { return null; }
}

export async function setClaudeKey(value: string | null): Promise<void> {
  const v = value?.trim() || null;
  if (Platform.OS === 'web') { memory = v; return; }
  try {
    if (v) await SecureStore.setItemAsync(KEY, v);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Secure storage unavailable: the key just won't be remembered.
  }
}
