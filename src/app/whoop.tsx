import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { finishWhoopLogin } from '../services/whoop';
import { useApp } from '../store/AppStore';
import { Button, Logo, Txt } from '../ui/components';
import { useTheme } from '../ui/theme';

/** WHOOP sends the browser back to pace://whoop. If the app (not the sign-in sheet) catches it, finish here. */
export default function WhoopReturn() {
  const { code, state, error, error_description } = useLocalSearchParams<{ code?: string; state?: string; error?: string; error_description?: string }>();
  const { syncWhoop, refreshWhoop } = useApp();
  const t = useTheme();
  const [msg, setMsg] = useState(error ? (error === 'access_denied' ? 'WHOOP access was not allowed.' : `WHOOP said: ${error_description || error}`) : code ? 'Connecting to WHOOP…' : 'Back from WHOOP.');
  const [done, setDone] = useState(!code || !!error);

  useEffect(() => {
    if (!code || error) return;
    let alive = true;
    (async () => {
      try {
        await finishWhoopLogin(code, state ?? null);
        await refreshWhoop();
        if (alive) setMsg('Connected. Pulling your last 30 days…');
        await syncWhoop();
        if (alive) { setMsg('WHOOP is connected. Pace now syncs on its own.'); setDone(true); setTimeout(() => { if (alive) router.replace('/'); }, 1200); }
      } catch (e) {
        if (alive) { setMsg(e instanceof Error ? e.message : 'WHOOP sign-in failed.'); setDone(true); }
      }
    })();
    return () => { alive = false; };
  }, [code, state, error, syncWhoop, refreshWhoop]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: t.bg }}>
      <Logo size={40} color={t.accent} />
      <Txt v="h2">WHOOP</Txt>
      <Txt v="sub" style={{ textAlign: 'center' }}>{msg}</Txt>
      {done ? <Button title="Back to Pace" onPress={() => router.replace('/')} /> : null}
    </View>
  );
}
