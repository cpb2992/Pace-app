import { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { testClaudeKey } from '../services/claude';
import { getClaudeKey, setClaudeKey } from '../services/secrets';
import { Button, Row, Txt } from './components';
import { useTheme } from './theme';

/** Paste, test and save the Claude API key that powers the coach. */
export function ClaudeKeyForm({ onChange, compact }: { onChange?: (key: string | null) => void; compact?: boolean }) {
  const t = useTheme();
  const [have, setHave] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { getClaudeKey().then(setHave).catch(() => setHave(null)); }, []);

  const save = async () => {
    const k = text.trim();
    if (!k) { setMsg('Paste your key first.'); return; }
    setBusy(true); setMsg('Checking the key…');
    const err = await testClaudeKey(k);
    setBusy(false);
    if (err) { setMsg(err); return; }
    await setClaudeKey(k);
    setHave(k); setText(''); setMsg('');
    onChange?.(k);
  };
  const remove = async () => { await setClaudeKey(null); setHave(null); setMsg(''); onChange?.(null); };

  if (have === undefined) return null;
  if (have) {
    return (
      <Row>
        <View style={{ flex: 1 }}><Txt v="h3">Coach is on</Txt><Txt v="fine">Key ending {have.slice(-4)}, saved in secure storage.</Txt></View>
        <Button small kind="dangerLink" title="Remove key" onPress={remove} />
      </Row>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {compact ? null : <Txt v="fine">Pace’s coach runs on Claude. Make a key at platform.claude.com, paste it here, and it stays in this phone’s secure storage. Each message is one Claude call, billed to your Claude API account.</Txt>}
      <TextInput value={text} onChangeText={setText} placeholder="sk-ant-…" placeholderTextColor={t.ink3} secureTextEntry autoCapitalize="none" autoCorrect={false}
        accessibilityLabel="Claude API key" style={{ fontSize: 16, color: t.ink, backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10 }} />
      <Row gap={8} style={{ justifyContent: 'flex-start' }}>
        <Button kind="primary" title={busy ? 'Checking…' : 'Save key'} onPress={save} disabled={busy} />
        <Button kind="link" title="Get a key" onPress={() => Linking.openURL('https://platform.claude.com/settings/keys').catch(() => {})} />
      </Row>
      {msg ? <Txt v="fine" style={{ fontWeight: '500' }}>{msg}</Txt> : null}
    </View>
  );
}
