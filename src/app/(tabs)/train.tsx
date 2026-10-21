import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { fmtMid } from '../../engine/dates';
import { isFree, plates, rxText, topStr, ZONES } from '../../engine/training';
import type { Exercise, ZoneOrUnknown } from '../../engine/types';
import { fmtW, letter, num } from '../../engine/util';
import { useApp, useDayIdx, type Draft } from '../../store/AppStore';
import { Badge, Button, Card, Chip, Confirm, Field, Row, Screen, Section, success, Tag, tap, Txt } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { VideoTile } from '../../ui/VideoTile';

function SetRow({ i, j, draft, setDraft, wPh, rPh }: { i: number; j: number; draft: Draft; setDraft: (d: Draft) => void; wPh: string; rPh: string }) {
  const t = useTheme();
  const row = draft.rows[i][j];
  const update = (patch: Partial<typeof row>) => {
    const rows = draft.rows.map((r, a) => (a === i ? r.map((x, b) => (b === j ? { ...x, ...patch } : x)) : r));
    setDraft({ ...draft, rows });
  };
  const input = { flex: 1, minWidth: 0, fontSize: 16, color: t.ink, backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingVertical: 9, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ width: 24, textAlign: 'center', color: t.ink3, fontSize: 13 }}>{j + 1}</Text>
      <TextInput value={row.w} onChangeText={w => update({ w })} placeholder={wPh} placeholderTextColor={t.ink3} keyboardType="decimal-pad" style={[input, { flexGrow: 1.2 }]} accessibilityLabel={`Set ${j + 1} weight`} />
      <TextInput value={row.r} onChangeText={r => update({ r })} placeholder={rPh} placeholderTextColor={t.ink3} keyboardType="number-pad" style={input} accessibilityLabel={`Set ${j + 1} reps`} />
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[0, 1, 2, 3, 4].map(v => {
          const on = row.rir === v;
          return (
            <Pressable key={v} onPress={() => { tap(); update({ rir: on ? null : v }); }} accessibilityRole="button" accessibilityLabel={`${v === 4 ? '4 or more' : v} reps left`} accessibilityState={{ selected: on }}
              style={{ width: 31, height: 40, borderRadius: 8, borderWidth: 1, borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : t.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: on ? t.surface : t.ink, fontSize: 13.5, fontWeight: '500' }}>{v === 4 ? '4+' : v}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ExerciseCard({ ex, i, zone, draft, setDraft }: { ex: Exercise; i: number; zone: ZoneOrUnknown; draft: Draft; setDraft: (d: Draft) => void }) {
  const { ctx, data, demo } = useApp();
  const t = useTheme();
  const [showHist, setShowHist] = useState(false);
  const head = (
    <Row gap={12} style={{ justifyContent: 'flex-start' }}>
      <Badge letter={letter(i)} large />
      <View style={{ flex: 1 }}><Txt v="h3" style={{ fontSize: 17 }}>{ex.name}</Txt><Txt v="fine">{rxText(ex)}{ex.rxSet ? '' : ' · placeholder'}</Txt></View>
    </Row>
  );
  const video = <VideoTile name={ex.name} video={ctx.video(ex.name)} canEdit={!demo} />;
  if (isFree(ex.type)) return <Card>{head}{video}<Txt v="fine">{ex.type === 'cardio' ? (zone === 'red' ? 'Easy pace today.' : 'As written.') : 'Follow the circuit as written.'}</Txt></Card>;
  const p = ctx.prescribe(ex, zone);
  if (p.kind === 'free') return null;
  const rows = draft.rows[i] ?? [];
  const big = p.w == null ? 'Find your weight' : p.w > 0 ? `${fmtW(p.w)} lb` : `${p.reps} reps`;
  const small = p.w == null || p.w > 0 ? `× ${p.reps}` : '';
  const pl = ex.type === 'barbell' && p.kind === 'lift' ? plates(p.w, data.settings.bar) : null;
  const meta = [p.kind === 'lift' ? `Last ${p.last}` : '', pl, p.sets !== ex.sets ? `${p.sets} sets today` : '', p.effort].filter(Boolean).join(' · ');
  const hist = ctx.hist(ex.name);
  return (
    <Card>
      {head}
      {ex.note ? <View style={{ borderLeftWidth: 2, borderLeftColor: t.line, paddingLeft: 10 }}><Txt v="sub">{ex.note}</Txt></View> : null}
      {video}
      <View style={{ padding: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.fill, gap: 3 }}>
        <Row gap={8} style={{ justifyContent: 'flex-start', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <Txt v="big">{big}</Txt>
          {small ? <Txt v="body" color={t.ink2} style={{ fontSize: 16 }}>{small}</Txt> : null}
          {p.kind === 'lift' ? <Tag text={p.tagText} kind={p.tag} /> : null}
        </Row>
        <Txt v="body" style={{ fontSize: 14 }}>{p.why}</Txt>
        <Txt v="fine" style={{ fontSize: 12.5 }}>{meta}</Txt>
      </View>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Txt v="label" style={{ width: 24, textAlign: 'center' }}>Set</Txt>
          <Txt v="label" style={{ flex: 1.2, textAlign: 'center' }}>lb</Txt>
          <Txt v="label" style={{ flex: 1, textAlign: 'center' }}>Reps</Txt>
          <Txt v="label" style={{ width: 167, textAlign: 'center' }}>Reps left</Txt>
        </View>
        {rows.map((_, j) => <SetRow key={j} i={i} j={j} draft={draft} setDraft={setDraft} wPh={p.w ? fmtW(p.w) : '0'} rPh={String(p.reps)} />)}
      </View>
      <Row>
        <Button kind="link" title="Add set" onPress={() => { const last = rows[rows.length - 1]; setDraft({ ...draft, rows: draft.rows.map((r, a) => (a === i ? [...r, { w: last?.w ?? '', r: '', rir: null }] : r)) }); }} />
        {hist.length ? <Button kind="link" title={showHist ? 'Hide history' : `History · ${hist.length}`} onPress={() => setShowHist(!showHist)} /> : null}
      </Row>
      {showHist ? <View style={{ gap: 4 }}>{hist.slice(-6).reverse().map(e => <Row key={e.id}><Txt v="sub">{fmtMid(e.date)}</Txt><Txt v="body" style={{ fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{e.sets.map(x => (x.w > 0 ? fmtW(x.w) + '×' : '') + x.r).join('  ')}</Txt></Row>)}</View> : null}
    </Card>
  );
}

function DateField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setText(value); }
  const commit = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text))) onCommit(text); else setText(value); };
  return <Field label="Date" value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} autoCapitalize="none" placeholder="YYYY-MM-DD" />;
}

export default function Train() {
  const { ctx, today, demo, draft, setDraft, setDayIdx, mutate } = useApp();
  const di = useDayIdx();
  const days = ctx.days();
  const block = ctx.activeBlock();
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const sig = useMemo(() => `${block?.id}|${days.map(d => d.id + ':' + d.exercises.map(e => e.id).join(',')).join('|')}`, [block, days]);

  const fresh = useMemo<Draft | null>(() => {
    if (!days.length) return null;
    const date = today;
    const zone = ctx.readiness(date).zone;
    return {
      sig, dayIdx: di, date,
      rows: days[di].exercises.map(ex => {
        if (isFree(ex.type)) return [];
        const p = ctx.prescribe(ex, zone);
        const n = p.kind === 'free' ? 0 : p.sets || ex.sets || 3;
        const w = p.kind === 'lift' && p.w > 0 ? fmtW(p.w) : '';
        return Array.from({ length: n }, () => ({ w, r: '', rir: null }));
      }),
    };
  }, [sig, di, days, today, ctx]);
  // A saved draft wins while it still matches this workout; otherwise start from today's targets.
  const cur = draft && draft.sig === sig && draft.dayIdx === di ? draft : fresh;

  if (!days.length || !cur) return <Screen title="Train"><Card><Txt v="fine">Add workouts in Program first.</Txt></Card></Screen>;
  const day = days[di];
  const zone = ctx.readiness(cur.date).zone;

  const finish = () => {
    if (demo) return;
    const sets = day.exercises.flatMap((ex, i) => (cur.rows[i] ?? []).map(r => ({ ex: ex.name, w: Math.max(0, num(r.w) ?? 0), r: Math.round(num(r.r) ?? 0), rir: r.rir })).filter(s => s.r > 0));
    if (!sets.length) { setMsg('Enter reps for at least one set.'); return; }
    const rd = ctx.readiness(cur.date);
    mutate(d => { d.sessions.push({ id: 's' + Date.now().toString(36), date: cur.date, day: day.name, zone: rd.zone === 'unknown' ? null : rd.zone, rec: rd.rec ?? null, src: 'app', sets }); });
    success();
    setDraft(null); setDayIdx(null); setMsg(`Workout saved · ${sets.length} sets`);
  };

  const recent = ctx.sessions.slice(-12).reverse();
  return (
    <Screen title={day.name} eyebrow={`${block?.name ?? ''}${zone !== 'unknown' ? ` · ${ZONES[zone].label}` : ''}`}>
      <Card>
        <Txt v="label">Workout</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {days.map((d, i) => <Button key={d.id} small kind={i === di ? 'primary' : 'secondary'} title={d.name} onPress={() => { setDayIdx(i); setDraft(null); }} />)}
        </View>
        <DateField value={cur.date} onCommit={date => setDraft({ ...cur, date })} />
        <Txt v="fine">Reps left: how many more clean reps you had. 0 means failure.</Txt>
      </Card>
      {day.exercises.map((ex, i) => <ExerciseCard key={ex.id} ex={ex} i={i} zone={zone} draft={cur} setDraft={setDraft} />)}
      {msg ? <Txt v="body" style={{ fontWeight: '500' }}>{msg}</Txt> : null}
      <Button kind="primary" wide title="Finish workout" onPress={finish} disabled={demo} />
      <Section>Recent sessions</Section>
      <Card>
        {recent.length ? recent.map(s => {
          const z = ctx.sessionZone(s);
          const byEx = new Map<string, typeof s.sets>();
          s.sets.forEach(x => { if (!byEx.has(x.ex)) byEx.set(x.ex, []); byEx.get(x.ex)!.push(x); });
          const tops = [...byEx.entries()].slice(0, 3).map(([n, sets]) => `${n} ${topStr(sets)}`).join(' · ');
          return (
            <View key={s.id} style={{ gap: 3 }}>
              <Row gap={8} style={{ justifyContent: 'flex-start' }}><Txt v="h3">{fmtMid(s.date)}</Txt><Txt v="fine">{s.day}</Txt>{z ? <Chip text={ZONES[z].label} zone={z} /> : null}</Row>
              <Txt v="fine">{tops}</Txt>
              {demo ? null : confirmDel === s.id
                ? <Confirm text="Delete this session?" confirm="Delete" onConfirm={() => { mutate(d => { d.sessions = d.sessions.filter(x => x.id !== s.id); }); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
                : <Button kind="dangerLink" title="Delete" onPress={() => setConfirmDel(s.id)} />}
            </View>
          );
        }) : <Txt v="fine">Finished workouts show up here.</Txt>}
      </Card>
    </Screen>
  );
}
