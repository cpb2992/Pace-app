import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { fmtLong } from '../../engine/dates';
import { buildCoachPrompt } from '../../engine/prompt';
import { evidence, FIX, rxText, VOICE, ZONES } from '../../engine/training';
import { fmtW, letter, num } from '../../engine/util';
import { askCoach, backendReady } from '../../services/backend';
import { useApp, useDayIdx } from '../../store/AppStore';
import { Badge, Button, Card, Chip, Divider, Field, Logo, Ring, Row, Screen, Segmented, Tag, TwoCol, Txt } from '../../ui/components';
import { useTheme } from '../../ui/theme';

function CheckIn({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const { data, today, mutate, demo } = useApp();
  const prev = data.whoop[today];
  const [rec, setRec] = useState(prev?.rec != null ? String(prev.rec) : '');
  const [hrv, setHrv] = useState(prev?.hrv != null ? String(prev.hrv) : '');
  const [rhr, setRhr] = useState(prev?.rhr != null ? String(prev.rhr) : '');
  const [sleep, setSleep] = useState(prev?.sleep != null ? String(prev.sleep) : '');
  const [err, setErr] = useState('');
  const save = () => {
    const r = num(rec);
    if (r == null || r < 0 || r > 100) { setErr('Enter a recovery score from 0 to 100.'); return; }
    const s = num(sleep);
    mutate(d => { d.whoop[today] = { ...(d.whoop[today] ?? {}), rec: Math.round(r), hrv: num(hrv), rhr: num(rhr), sleep: s != null ? Math.round(s * 10) / 10 : null, src: 'manual' }; });
    onDone();
  };
  return (
    <Card>
      <View><Txt v="h2">{`Today's recovery`}</Txt><Txt v="fine">From the WHOOP app</Txt></View>
      <Row gap={10}><Field label="Recovery %" value={rec} onChangeText={setRec} keyboardType="number-pad" placeholder="72" /><Field label="HRV (ms)" value={hrv} onChangeText={setHrv} keyboardType="decimal-pad" placeholder="54" /></Row>
      <Row gap={10}><Field label="Resting HR" value={rhr} onChangeText={setRhr} keyboardType="number-pad" placeholder="56" /><Field label="Sleep (hours)" value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" placeholder="7.2" /></Row>
      {err ? <Txt v="fine" style={{ fontWeight: '500' }}>{err}</Txt> : null}
      <Row gap={8} style={{ justifyContent: 'flex-start' }}>
        <Button kind="primary" title="Save" onPress={save} disabled={demo} />
        {canCancel ? <Button title="Cancel" onPress={onDone} /> : null}
      </Row>
    </Card>
  );
}

function Recovery({ onEdit }: { onEdit: () => void }) {
  const { ctx, today, demo } = useApp();
  const t = useTheme();
  const r = ctx.readiness(today);
  const z = ZONES[r.zone];
  const stat = (label: string, value: string, unit: string, sub?: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt v="label">{label}</Txt>
      <Text style={{ color: t.ink, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value} <Text style={{ color: t.ink3, fontSize: 12, fontWeight: '400' }}>{unit}</Text></Text>
      {sub ? <Txt v="label">{sub}</Txt> : null}
    </View>
  );
  return (
    <Card>
      <Row gap={16} style={{ justifyContent: 'flex-start' }}>
        <Ring value={r.rec ?? 0} zone={r.zone} />
        <View style={{ flex: 1, gap: 5 }}>
          <Chip text={z.label} zone={r.zone} />
          <Txt v="h2" style={{ fontSize: 20 }}>{z.head}</Txt>
          <Txt v="sub">{z.sub}</Txt>
        </View>
      </Row>
      <Divider />
      <Row gap={12}>
        {stat('HRV', r.hrv != null ? String(Math.round(r.hrv)) : '–', 'ms', r.base?.n && r.base.n >= 7 && r.base.mean ? `avg ${Math.round(r.base.mean)}` : undefined)}
        {stat('Resting HR', r.rhr != null ? String(Math.round(r.rhr)) : '–', 'bpm')}
        {stat('Sleep', r.sleep != null ? String(r.sleep) : '–', 'h')}
      </Row>
      {r.notes.map(n => <Txt key={n} v="fine">{n}</Txt>)}
      {demo ? null : <Button kind="link" title="Edit" onPress={onEdit} />}
    </Card>
  );
}

function TodayWorkout() {
  const { ctx, today, dayIdx, setDayIdx, setDraft } = useApp();
  const t = useTheme();
  const di = useDayIdx();
  const days = ctx.days();
  const zone = ctx.readiness(today).zone;
  if (!days.length) return <Card><Txt v="h2">No workouts yet</Txt><Txt v="fine">{`Add your coach's workouts in Program.`}</Txt></Card>;
  const day = days[di];
  const label = dayIdx == null ? ctx.pickDay().label : 'Selected';
  const done = ctx.sessions.some(s => s.date === today && s.day.toLowerCase() === day.name.toLowerCase());
  return (
    <Card>
      <Row>
        <View><Txt v="label">{label} · {day.exercises.length} exercises</Txt><Txt v="h2">{day.name}</Txt></View>
        {done ? <Chip text="Done" tone="ok" /> : null}
      </Row>
      {days.length > 1 ? <Segmented options={days.map((d, i) => ({ label: d.name.replace(/^Nov\/Dec\s+/i, ''), value: i }))} value={di} onChange={i => { setDayIdx(i); setDraft(null); }} /> : null}
      <View>
        {day.exercises.map((ex, j) => {
          const p = ctx.prescribe(ex, zone);
          const sub = p.kind === 'lift' ? `${p.w > 0 ? fmtW(p.w) + ' lb × ' : ''}${p.reps}` : rxText(ex);
          return (
            <View key={ex.id} style={{ paddingVertical: 11, borderTopWidth: j ? 1 : 0, borderTopColor: t.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Badge letter={letter(j)} />
              <View style={{ flex: 1 }}><Txt v="body" style={{ fontWeight: '500' }}>{ex.name}</Txt><Txt v="sub">{sub}</Txt></View>
              {p.kind === 'lift' ? <Tag text={p.tagText} kind={p.tag} /> : null}
            </View>
          );
        })}
      </View>
      <Button kind="primary" wide title="Start workout" onPress={() => router.navigate('/train')} />
    </Card>
  );
}

function Coach() {
  const { ctx, data, today } = useApp();
  const t = useTheme();
  const c = ctx.coast();
  const v = VOICE[data.settings.tone === 'clean' ? 'clean' : 'nofilter'];
  if (!c.enough || !c.level) {
    return <Card><Row><Txt v="h2">Coach</Txt><Chip text={`${c.n} of 3 sessions`} /></Row><Txt v="fine">{v.early} Pace checks reps left, stalled weights and how you use green days.</Txt></Card>;
  }
  const zone = ctx.readiness(today).zone;
  const head = c.level === 'coasting' && zone === 'green' ? v.greenCoast : v[c.level];
  const chip = { coasting: ['bad', 'Coasting'], grind: ['bad', 'Overreaching'], close: ['warn', 'Almost'], working: ['ok', 'On track'] }[c.level] as ['bad' | 'warn' | 'ok', string];
  const bar = c.level === 'working' ? t.go : c.level === 'close' ? t.hold : t.stop;
  return (
    <Card>
      <Row><Txt v="label">Coach</Txt><Chip text={chip[1]} tone={chip[0]} /></Row>
      <Txt v="h2" color={c.level === 'coasting' || c.level === 'grind' ? t.stop : undefined} style={{ fontSize: 19, lineHeight: 25 }}>{head}</Txt>
      <Row gap={10}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.fill, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, Math.max(4, c.score ?? 0))}%`, height: '100%', backgroundColor: bar }} /></View>
        <Txt v="label">{c.score}/100</Txt>
      </Row>
      <View style={{ gap: 5 }}>{evidence(c).map(e => <Txt key={e} v="sub">•  {e}</Txt>)}</View>
      <View style={{ padding: 12, borderRadius: 10, backgroundColor: t.fill }}><Txt v="body" style={{ fontWeight: '500', fontSize: 14 }}>{FIX[c.level]}</Txt></View>
    </Card>
  );
}

function AskPace() {
  const { ctx } = useApp();
  const di = useDayIdx();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<{ q: string; a: string } | undefined>();
  if (!backendReady) return null;
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setOut('Thinking…');
    try {
      const a = await askCoach(buildCoachPrompt(ctx, di, question, prev));
      setOut(a); setPrev({ q: question, a });
    } catch (e) { setOut(e instanceof Error ? e.message : 'Connection lost. Try again.'); }
    finally { setBusy(false); setQ(''); }
  };
  const chips = [['Today\'s plan', "Give me today's game plan, set by set."], ["What's lagging?", 'Which lift is falling behind, and what should I change to move it?'], ['Next 2 weeks', 'Plan my weights and effort for the next two weeks using my recovery pattern.']];
  return (
    <Card>
      <View><Txt v="h2">Ask Pace</Txt><Txt v="fine">Coaching from your own numbers</Txt></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{chips.map(([l, p]) => <Button key={l} small title={l} onPress={() => ask(p)} />)}</View>
      <Row gap={8}>
        <TextInput value={q} onChangeText={setQ} placeholder="Ask a question" placeholderTextColor={t.ink3} onSubmitEditing={() => ask(q)} returnKeyType="send"
          style={{ flex: 1, fontSize: 16, color: t.ink, backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10 }} />
        <Button kind="primary" title="Ask" onPress={() => ask(q)} disabled={busy} />
      </Row>
      {out ? <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.fill }}><Txt v="body" color={busy ? t.ink3 : undefined}>{out}</Txt></View> : null}
    </Card>
  );
}

export default function Today() {
  const { ctx, today, demo, startDemo, endDemo, data } = useApp();
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const r = ctx.readiness(today);
  return (
    <Screen title="Today" sub={fmtLong(today)} eyebrow={<Row gap={6} style={{ justifyContent: 'flex-start' }}><Logo size={16} color={t.accent} /><Txt v="label" color={t.ink2} style={{ fontWeight: '600' }}>Pace</Txt></Row>}>
      {demo ? <Card style={{ backgroundColor: t.holdSoft, borderColor: t.holdSoft }}><Row><Txt v="body" color={t.hold} style={{ fontWeight: '500' }}>Viewing demo data</Txt><Button small title="Exit demo" onPress={endDemo} /></Row></Card> : null}
      <TwoCol
        left={<>
          {r.zone === 'unknown' || editing ? <CheckIn onDone={() => setEditing(false)} canCancel={r.zone !== 'unknown'} /> : <Recovery onEdit={() => setEditing(true)} />}
          <TodayWorkout />
        </>}
        right={<>
          <Coach />
          <AskPace />
          {!demo && data.sessions.length < 3 ? <Row><Txt v="fine">See every feature with sample data.</Txt><Button small title="Try demo" onPress={startDemo} /></Row> : null}
        </>}
      />
    </Screen>
  );
}
