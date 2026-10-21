import { useState } from 'react';
import { Linking, Switch, TextInput, View } from 'react-native';
import { parseProgramText, PROGRAM_PROMPT, TYPE_LABEL, validateProgram, type ParsedProgram } from '../../engine/parse';
import { rxText, VOICE } from '../../engine/training';
import { uid } from '../../engine/util';
import { backendReady, getDeviceId, parseProgramRemote, syncWhoop, whoopConnectUrl } from '../../services/backend';
import { deleteClip, pickHistoryCSV, pickWhoopExport } from '../../services/files';
import { remindersSupported, setMorningReminder } from '../../services/reminders';
import { useApp } from '../../store/AppStore';
import { Button, Card, CommitField, Confirm, Row, Screen, Section, Segmented, TwoCol, Txt } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export default function Settings() {
  const { data, mutate, demo, eraseAll, today } = useApp();
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
  const [liveMsg, setLiveMsg] = useState('');
  const connectWhoop = async () => { setLiveMsg(''); Linking.openURL(whoopConnectUrl(await getDeviceId())).catch(() => setLiveMsg("Couldn't open WHOOP sign-in.")); };
  const syncNow = async () => {
    setLiveMsg('Syncing…');
    try { const days = await syncWhoop(await getDeviceId()); mutate(d => { Object.assign(d.whoop, days); }); setLiveMsg(`Synced ${Object.keys(days).length} days.`); }
    catch (e) { setLiveMsg(e instanceof Error ? e.message : 'WHOOP sync failed.'); }
  };

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
    if (backendReady) { try { p = validateProgram(await parseProgramRemote(PROGRAM_PROMPT + progText.slice(0, 12000))); } catch { p = null; } }
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
      <Section>Appearance</Section>
      <Card>
        <Row><Txt v="h3">Theme</Txt><View style={{ width: 210 }}><Segmented options={[{ label: 'Dark', value: 'dark' as const }, { label: 'Light', value: 'light' as const }, { label: 'Auto', value: 'system' as const }]} value={s.appearance} onChange={v => mutate(d => { d.settings.appearance = v; })} /></View></Row>
        {s.appearance === 'system' ? <Txt v="fine">{`Follows your phone's light or dark setting.`}</Txt> : null}
      </Card>

      <Section>Recovery</Section>
      <Card>
        <Txt v="h2">Import WHOOP data</Txt>
        <Txt v="fine">In WHOOP: More › App Settings › Data Export › Create Export. Pick the .zip WHOOP emails you.</Txt>
        <Button kind="primary" title="Choose export" onPress={importWhoop} disabled={demo} />
        {whoopMsg ? <Txt v="body" style={{ fontWeight: '500' }}>{whoopMsg}</Txt> : null}
      </Card>
      {backendReady ? (
        <Card>
          <Txt v="h2">WHOOP live sync</Txt>
          <Txt v="fine">Connect once, then pull your latest recovery, HRV and sleep with one tap.</Txt>
          <Row gap={8} style={{ justifyContent: 'flex-start' }}><Button kind="primary" title="Connect WHOOP" onPress={connectWhoop} disabled={demo} /><Button title="Sync now" onPress={syncNow} disabled={demo} /></Row>
          {liveMsg ? <Txt v="body" style={{ fontWeight: '500' }}>{liveMsg}</Txt> : null}
        </Card>
      ) : null}
      {remindersSupported ? (
        <Card>
          <Row><View style={{ flex: 1 }}><Txt v="h3">Morning reminder</Txt><Txt v="fine">A nudge at {s.reminder.hour}:{String(s.reminder.minute).padStart(2, '0')} to log recovery.</Txt></View><Switch value={s.reminder.on} onValueChange={toggleReminder} disabled={demo} /></Row>
          {remMsg ? <Txt v="fine">{remMsg}</Txt> : null}
        </Card>
      ) : null}

      <Section>Program</Section>
      <Card>
        <Txt v="h2">Paste a new block from {s.coach}</Txt>
        <Txt v="fine">Copy every workout from the coach app and paste it here.</Txt>
        <TextInput value={progText} onChangeText={setProgText} multiline placeholder={'Upper\nA: Close Grip Bench Press 3x10-12\nB: Wide Lat Pull Down 3x10-12'} placeholderTextColor={t.ink3}
          style={{ minHeight: 140, textAlignVertical: 'top', fontSize: 16, color: t.ink, backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: 10, padding: 11 }} />
        <Button kind="primary" title={reading ? 'Reading…' : 'Read program'} onPress={readProgram} disabled={reading || demo} />
        {progMsg ? <Txt v="body" style={{ fontWeight: '500' }}>{progMsg}</Txt> : null}
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
        {histMsg ? <Txt v="body" style={{ fontWeight: '500' }}>{histMsg}</Txt> : null}
      </Card>

      </>} right={<>
      <Section>Coaching</Section>
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
        {backendReady ? null : <Txt v="fine">The AI coach turns on once the Pace backend is connected.</Txt>}
      </Card>

      <Section>Data</Section>
      <Card>
        <Txt v="h2">Storage</Txt>
        <Txt v="fine">{nDays} days of recovery · {data.sessions.length} sessions · {nWorkouts} workouts · {Object.keys(data.videos).length} videos. Saved on this phone.</Txt>
        {demo ? null : confirmErase
          ? <Confirm text="Erase every check-in, import, session, workout and clip? This can't be undone." confirm="Erase all data" onConfirm={() => { Object.values(data.videos).forEach(v => { if (v.kind === 'clip') deleteClip(v.uri); }); setMorningReminder(false, 0, 0).catch(() => {}); eraseAll(); setConfirmErase(false); }} onCancel={() => setConfirmErase(false)} />
          : <Button kind="dangerLink" title="Erase all data" onPress={() => setConfirmErase(true)} />}
      </Card>
      </>} />
      <Txt v="label" style={{ textAlign: 'center', marginTop: 8 }}>Pace 1.0</Txt>
    </Screen>
  );
}
