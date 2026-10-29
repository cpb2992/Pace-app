import { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { parseProgramText, PROGRAM_PROMPT, TYPE_LABEL, validateProgram, type ParsedProgram } from '../engine/parse';
import { rxText, VOICE } from '../engine/training';
import { uid } from '../engine/util';
import { callClaude, READER_MODEL } from '../services/claude';
import { deleteClip, pickHistoryCSV, pickWhoopExport } from '../services/files';
import { remindersSupported, setMorningReminder } from '../services/reminders';
import { getClaudeKey } from '../services/secrets';
import { connectWhoop, disconnectWhoop, getWhoopClient, setWhoopClient, WHOOP_REDIRECT } from '../services/whoop';
import { useApp } from '../store/AppStore';
import { useShare } from '../store/ShareStore';
import { ClaudeKeyForm } from '../ui/ClaudeKey';
import { CoachShareCard } from '../ui/CoachShare';
import { Button, Card, CommitField, Confirm, List, Row, Screen, Section, Segmented, Toggle, TwoCol, Txt } from '../ui/components';
import { F, useTheme } from '../ui/theme';

const PRIVACY_URL = 'https://github.com/cpb2992/Pace-app/blob/main/PRIVACY.md';

function WhoopCard() {
  const { data, demo, whoop, syncWhoop, refreshWhoop } = useApp();
  const t = useTheme();
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { getWhoopClient().then(c => { if (c) setId(c.id); }).catch(() => {}); }, []);

  const saveApp = async () => {
    if (!id.trim() || !secret.trim()) { setMsg('Paste both the Client ID and the Client Secret.'); return; }
    await setWhoopClient({ id, secret });
    setSecret(''); setEditing(false); setMsg('');
    await refreshWhoop();
  };
  const connect = async () => {
    setBusy(true); setMsg('Opening WHOOP…');
    try {
      const r = await connectWhoop();
      if (r === 'connected') { setMsg(''); await refreshWhoop(); await syncWhoop(); }
      else setMsg('WHOOP sign-in was closed before it finished.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'WHOOP sign-in failed.'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => { await disconnectWhoop(); await refreshWhoop(); setMsg('Disconnected. Your synced days stay in Pace.'); };
  const field = { fontSize: 16, fontFamily: F.body, color: t.ink, backgroundColor: t.raised, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 };
  const status = whoop.status;
  const nDays = Object.values(data.whoop).filter(d => d.src === 'api').length;

  return (
    <Card>
      <Row><Txt v="h2">WHOOP</Txt>{status === 'connected' ? <Txt v="label" color={t.go}>Connected</Txt> : null}</Row>
      {status === 'no-app' || editing ? (
        <>
          <Txt v="fine">Pace reads your recovery, HRV, sleep, strain and workouts straight from WHOOP. One-time setup:</Txt>
          <View style={{ gap: 4 }}>
            <Txt v="fine">1.  At developer.whoop.com, create an app.</Txt>
            <Txt v="fine">{`2.  Redirect URL: ${WHOOP_REDIRECT}`}</Txt>
            <Txt v="fine">{`3.  Privacy policy: ${PRIVACY_URL}`}</Txt>
            <Txt v="fine">4.  Scopes: read:recovery, read:cycles, read:sleep, read:workout.</Txt>
            <Txt v="fine">5.  Paste the Client ID and Secret below. They stay in this phone’s secure storage.</Txt>
          </View>
          <TextInput value={id} onChangeText={setId} placeholder="Client ID" placeholderTextColor={t.ink3} autoCapitalize="none" autoCorrect={false} accessibilityLabel="WHOOP Client ID" style={field} />
          <TextInput value={secret} onChangeText={setSecret} placeholder="Client Secret" placeholderTextColor={t.ink3} autoCapitalize="none" autoCorrect={false} secureTextEntry accessibilityLabel="WHOOP Client Secret" style={field} />
          <Row gap={8} style={{ justifyContent: 'flex-start' }}>
            <Button kind="primary" title="Save" onPress={saveApp} disabled={demo} />
            {editing ? <Button title="Cancel" onPress={() => setEditing(false)} /> : <Button kind="link" title="Open WHOOP developer" onPress={() => Linking.openURL('https://developer.whoop.com').catch(() => {})} />}
          </Row>
        </>
      ) : status === 'ready' ? (
        <>
          <Txt v="fine">Your WHOOP app is saved. Connect once and Pace syncs every time you open it.</Txt>
          <Row gap={8} style={{ justifyContent: 'flex-start' }}>
            <Button kind="primary" title={busy ? 'Connecting…' : 'Connect WHOOP'} onPress={connect} disabled={busy || demo} />
            <Button kind="link" title="Change app details" onPress={() => setEditing(true)} />
          </Row>
        </>
      ) : (
        <>
          <Txt v="fine">{`Syncs recovery, sleep, strain and workouts on its own when you open Pace. ${nDays} days from WHOOP so far.`}</Txt>
          <Row gap={8} style={{ justifyContent: 'flex-start' }}>
            <Button kind="primary" title={whoop.busy ? 'Syncing…' : 'Sync now'} onPress={() => syncWhoop()} disabled={whoop.busy || demo} />
            <Button kind="dangerLink" title="Disconnect" onPress={disconnect} />
          </Row>
        </>
      )}
      {msg ? <Txt v="body" style={{ fontFamily: F.med }}>{msg}</Txt> : whoop.msg ? <Txt v="fine">{whoop.msg}</Txt> : null}
    </Card>
  );
}

export default function Settings() {
  const { data, mutate, demo, eraseAll, today } = useApp();
  const share = useShare();
  const t = useTheme();
  const s = data.settings;
  const [whoopMsg, setWhoopMsg] = useState('');
  const [histMsg, setHistMsg] = useState('');
  const [progText, setProgText] = useState('');
  const [progMsg, setProgMsg] = useState('');
  const [parsed, setParsed] = useState<ParsedProgram | null>(null);
  const [blockName, setBlockName] = useState('New block');
  const [reading, setReading] = useState(false);
  const [remMsg, setRemMsg] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);

  const importWhoop = async () => {
    setWhoopMsg('');
    try {
      const res = await pickWhoopExport();
      if (!res) return;
      if (!res.count) { setWhoopMsg('No recovery scores found. Pick the WHOOP .zip or physiological_cycles.csv.'); return; }
      mutate(d => { Object.assign(d.whoop, res.days); });
      const dates = Object.keys(res.days).sort();
      setWhoopMsg(`Imported ${res.count} days, ${dates[0]} to ${dates[dates.length - 1]}.`);
    } catch (e) { setWhoopMsg(e instanceof Error ? e.message : "That file couldn't be read."); }
  };
  const importHistory = async () => {
    setHistMsg('');
    try {
      const list = await pickHistoryCSV();
      if (!list) return;
      const ids = new Set(list.map(x => x.id));
      mutate(d => { d.sessions = d.sessions.filter(x => !ids.has(x.id)).concat(list); });
      setHistMsg(`Imported ${list.reduce((a, x) => a + x.sets.length, 0)} sets across ${list.length} workouts.`);
    } catch (e) { setHistMsg(e instanceof Error ? e.message : "That file couldn't be read."); }
  };
  const readProgram = async () => {
    if (!progText.trim()) { setProgMsg('Paste the program first.'); return; }
    setReading(true); setProgMsg('');
    let p: ParsedProgram | null = null;
    const key = await getClaudeKey();
    if (key) {
      try {
        const text = (await callClaude({ key, model: READER_MODEL, maxTokens: 2500, messages: [{ role: 'user', content: PROGRAM_PROMPT + progText.slice(0, 12000) }] })).trim();
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        p = validateProgram(JSON.parse(m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
      } catch { p = null; }
    }
    if (!p) p = validateProgram(parseProgramText(progText));
    setReading(false);
    if (!p) { setProgMsg('No exercises found. Put each one on its own line, like "Bench Press 4x6-8".'); return; }
    setParsed(p);
  };
  const saveBlock = () => {
    if (!parsed) return;
    const days = parsed.days.map(d => ({ id: uid(), name: d.name, dow: null, exercises: d.exercises.map(e => ({ ...e, id: uid(), rxSet: true })) }));
    mutate(d => {
      if (d.program.source === 'starter') d.program = { source: 'coach', updated: today, blocks: [{ id: uid(), name: blockName || 'Program', start: null, days }] };
      else { d.program.blocks.push({ id: uid(), name: blockName || 'New block', start: today, days }); d.program.updated = today; }
    });
    setParsed(null); setProgText(''); setProgMsg('Block saved. Add videos in Program.');
  };
  const toggleReminder = async (on: boolean) => {
    const ok = await setMorningReminder(on, s.reminder.hour, s.reminder.minute);
    if (on && !ok) { setRemMsg('Notifications are off for Pace. Turn them on in your phone settings.'); return; }
    setRemMsg('');
    mutate(d => { d.settings.reminder.on = on; });
  };

  const nDays = Object.keys(data.whoop).length;
  const nWorkouts = data.program.blocks.reduce((a, b) => a + b.days.length, 0);
  return (
    <Screen title="Settings">
      <TwoCol left={<>
      <Section>Recovery</Section>
      <WhoopCard />
      <Card>
        <Txt v="h2">Import a WHOOP export</Txt>
        <Txt v="fine">Live sync covers the last 30 days. For your full history: in WHOOP, More › App Settings › Data Export › Create Export, then pick the .zip WHOOP emails you.</Txt>
        <Button title="Choose export" onPress={importWhoop} disabled={demo} />
        {whoopMsg ? <Txt v="body" style={{ fontFamily: F.med }}>{whoopMsg}</Txt> : null}
      </Card>
      {remindersSupported ? (
        <Card>
          <Row><View style={{ flex: 1 }}><Txt v="h3">Morning reminder</Txt><Txt v="fine">A nudge at {s.reminder.hour}:{String(s.reminder.minute).padStart(2, '0')} to check your recovery.</Txt></View><Toggle value={s.reminder.on} onValueChange={toggleReminder} disabled={demo} /></Row>
          {remMsg ? <Txt v="fine">{remMsg}</Txt> : null}
        </Card>
      ) : null}

      <Section>Program</Section>
      <Card>
        <Txt v="h2">Paste a new block from {s.coach}</Txt>
        <Txt v="fine">Copy every workout from the coach app and paste it here.</Txt>
        <TextInput value={progText} onChangeText={setProgText} multiline placeholder={'Upper\nA: Close Grip Bench Press 3x10-12\nB: Wide Lat Pull Down 3x10-12'} placeholderTextColor={t.ink3}
          style={{ minHeight: 140, textAlignVertical: 'top', fontSize: 16, fontFamily: F.body, color: t.ink, backgroundColor: t.raised, borderRadius: 12, padding: 12 }} />
        <Button kind="primary" title={reading ? 'Reading…' : 'Read program'} onPress={readProgram} disabled={reading || demo} />
        {progMsg ? <Txt v="body" style={{ fontFamily: F.med }}>{progMsg}</Txt> : null}
        {parsed ? <>
          {parsed.days.map((d, di) => (
            <View key={di} style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, gap: 6 }}>
              <Txt v="h3">{d.name}</Txt>
              {d.exercises.map((e, ei) => <Row key={ei}><Txt v="body" style={{ flex: 1 }}>{e.name}</Txt><Txt v="fine">{rxText({ ...e, id: '', rxSet: true })} · {TYPE_LABEL[e.type]}</Txt></Row>)}
            </View>
          ))}
          <CommitField label="Block name" value={blockName} onCommit={setBlockName} />
          <Row gap={8} style={{ justifyContent: 'flex-start' }}><Button kind="primary" title="Save block" onPress={saveBlock} /><Button title="Discard" onPress={() => setParsed(null)} /></Row>
        </> : null}
      </Card>
      <Card>
        <Txt v="h2">Import workout history</Txt>
        <Txt v="fine">A CSV with date, exercise, weight and reps. RPE or RIR columns are used if present.</Txt>
        <Button title="Choose CSV" onPress={importHistory} disabled={demo} />
        {histMsg ? <Txt v="body" style={{ fontFamily: F.med }}>{histMsg}</Txt> : null}
      </Card>

      </>} right={<>
      <Section>{`Share with ${s.coach || 'your coach'}`}</Section>
      <CoachShareCard />

      <Section>Coach</Section>
      <Card>
        <Txt v="h2">AI coach</Txt>
        <ClaudeKeyForm />
        <Row><View style={{ flex: 1 }}><Txt v="h3">Read replies out loud</Txt><Txt v="fine">Hear the coach between sets.</Txt></View><Toggle value={s.speak} onValueChange={v => mutate(d => { d.settings.speak = v; })} disabled={demo} /></Row>
      </Card>
      <Card>
        <Txt v="h2">Coach voice</Txt>
        <Segmented options={[{ label: 'No filter', value: 'nofilter' as const }, { label: 'Clean', value: 'clean' as const }]} value={s.tone} onChange={v => mutate(d => { d.settings.tone = v; })} />
        <Txt v="fine">{`"${VOICE[s.tone].coasting}"`}</Txt>
        <Row gap={10}>
          <CommitField label="Coach" value={s.coach} onCommit={v => mutate(d => { d.settings.coach = v.trim().slice(0, 30) || 'Coach'; })} />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt v="label" color={t.ink2}>Barbell</Txt>
            <Segmented options={[{ label: '45 lb', value: 45 }, { label: '35 lb', value: 35 }]} value={s.bar} onChange={v => mutate(d => { d.settings.bar = v; })} />
          </View>
        </Row>
      </Card>

      <Section>Points</Section>
      <Card>
        <Row><View style={{ flex: 1, gap: 2 }}><Txt v="h3">Points and rewards</Txt><Txt v="fine">Off turns Pace back into a plain log.</Txt></View><Toggle value={s.game} onValueChange={v => mutate(d => { d.settings.game = v; })} disabled={demo} /></Row>
      </Card>
      {s.game ? (
        <List>
          {([
            ['Every rep', '10 points'],
            ['Heavier than last time', '×1.25'],
            ['Effort that fits your recovery', 'up to ×2'],
            ['Crits on any set', '×2, ×3 or ×5'],
            ['PR, rep record, beat last time', '+150, +60, +40'],
            ['Daily bounties', '+50 to +200'],
            ['Double or nothing', '3 bets a workout'],
            ['Mystery plate', 'after every workout'],
            ['Weekly streak', 'up to ×1.5'],
            ['Sleep, check-ins, red-day rest', '+10 to +60'],
          ] as const).map(([k, v]) => (
            <Row key={k} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
              <Txt v="body" style={{ flex: 1 }}>{k}</Txt>
              <Txt v="sub" style={{ fontFamily: F.semi }} color={t.xp}>{v}</Txt>
            </Row>
          ))}
        </List>
      ) : null}

      <Section>Appearance</Section>
      <Card>
        <Row><Txt v="h3">Theme</Txt><View style={{ width: 210 }}><Segmented options={[{ label: 'Dark', value: 'dark' as const }, { label: 'Light', value: 'light' as const }, { label: 'Auto', value: 'system' as const }]} value={s.appearance} onChange={v => mutate(d => { d.settings.appearance = v; })} /></View></Row>
        {s.appearance === 'system' ? <Txt v="fine">{`Follows your phone's light or dark setting.`}</Txt> : null}
      </Card>

      <Section>Data</Section>
      <Card>
        <Txt v="h2">Storage</Txt>
        <Txt v="fine">{nDays} days of recovery · {data.sessions.length} sessions · {nWorkouts} workouts · {Object.keys(data.videos).length} videos. Saved on this phone.</Txt>
        <Button kind="link" title="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} />
        {demo ? null : confirmErase
          ? <Confirm text="Erase every check-in, import, session, workout, clip, coach chat and point? This can't be undone." confirm="Erase all data" onConfirm={() => { Object.values(data.videos).forEach(v => { if (v.kind === 'clip') deleteClip(v.uri); }); setMorningReminder(false, 0, 0).catch(() => {}); if (share.link) share.turnOff(); eraseAll(); setConfirmErase(false); }} onCancel={() => setConfirmErase(false)} />
          : <Button kind="dangerLink" title="Erase all data" onPress={() => setConfirmErase(true)} />}
      </Card>
      </>} />
      <Txt v="label" style={{ textAlign: 'center', marginTop: 8 }}>Pace 1.3</Txt>
    </Screen>
  );
}
