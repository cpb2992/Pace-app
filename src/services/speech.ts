import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export { useSpeechRecognitionEvent } from 'expo-speech-recognition';

export function speechAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Starts listening. Returns false if the microphone or speech permission was refused. */
export async function startListening(): Promise<boolean> {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) return false;
  ExpoSpeechRecognitionModule.start({
    lang: 'en-US',
    interimResults: true,
    continuous: Platform.OS === 'android',
    addsPunctuation: true,
    androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500 },
  });
  return true;
}

export function stopListening() {
  try { ExpoSpeechRecognitionModule.stop(); } catch { /* not listening */ }
}

export function abortListening() {
  try { ExpoSpeechRecognitionModule.abort(); } catch { /* not listening */ }
}
