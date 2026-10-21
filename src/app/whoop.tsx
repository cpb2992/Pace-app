import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { getDeviceId, syncWhoop } from '../services/backend';
import { useApp } from '../store/AppStore';
import { Button, Txt } from '../ui/components';
import { useTheme } from '../ui/theme';

/** WHOOP sends users back to pace://whoop after sign-in. This screen pulls their data, then returns to Settings. */
export default function WhoopReturn() {
  const { connected, error } = useLocalSearchParams<{ connected?: string; error?: string }>();
  const { mutate } = useApp();
  const t = useTheme();
  const [msg, setMsg] = useState(connected ? 'Connected. Pulling your last 30 days…' : 'WHOOP sign-in was cancelled.');

  useEffect(() => {
    if (!connected || error) return;
    (async () => {
      try {
        const days = await syncWhoop(await getDeviceId());
        mutate(d => { Object.assign(d.whoop, days); });
        setMsg(`Synced ${Object.keys(days).length} days from WHOOP.`);
        setTimeout(() => router.replace('/settings'), 900);
      } catch (e) { setMsg(e instanceof Error ? e.message : 'WHOOP sync failed.'); }
    })();
  }, [connected, error, mutate]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: t.bg }}>
      <Txt v="h2">WHOOP</Txt>
      <Txt v="sub" style={{ textAlign: 'center' }}>{msg}</Txt>
      <Button title="Back to Settings" onPress={() => router.replace('/settings')} />
    </View>
  );
}
