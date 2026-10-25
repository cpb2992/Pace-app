import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fmtLong } from '../../engine/dates';
import { bountiesToday } from '../../engine/game';
import { evidence, FIX, rxText, VOICE, ZONES } from '../../engine/training';
import { fmtW, letter, num } from '../../engine/util';
import { useApp, useDayIdx } from '../../store/AppStore';
import { Badge, Button, Card, Chip, Divider, Field, Logo, Ring, Row, Screen, Segmented, Tag, TwoCol, Txt } from '../../ui/components';
import { fmtPts, PtsText, RankBadge, XpBar } from '../../ui/game';
import { Icon } from '../../ui/icons';
import { useTheme } from '../../ui/theme';

const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function Score() {
  const { game, data, today, ctx } = useApp();
  const t = useTheme();
  const zone = ctx.readiness(today).zone;
  const mult = game.streak >= 8 ? 1.5 : game.streak >= 4 ? 1.4 : 1 + 0.1 * Math.min(3, game.streak);
  if (!data.settings.game) return null;
  return (
    <Card>
      <Row gap={14} style={{ justifyContent: 'flex-start' }}>
        <RankBadge level={game.level} size={58} />
        <View style={{ flex: 1, gap: 6 }}>
          <Row>
            <Txt v="h2">{game.rank}</Txt>
            <Text style={{ color: t.xp, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmtPts(game.total)}</Text>
          </Row>
          <XpBar into={game.into} need={game.need} />
          <Txt v="label">{`${fmtPts(game.need - game.into)} to ${game.next}`}</Txt>
        </View>
      </Row>
      <Divider />
      <Row gap={10}>
        <Row gap={8} style={{ justifyContent: 'flex-start', flex: 1 }}>
          <Icon name="flame" size={20} color={game.streak ? t.xp : t.ink3} fill={game.streak ? t.xpSoft : 'none'} width={1.8} />
          <View>
            <Txt v="body" style={{ fontWeight: '600' }}>{game.streak ? `${game.streak}-week streak` : 'Start a streak'}</Txt>
            <Txt v="label">{game.streak ? `Points ×${mult.toFixed(1)} while it lasts` : `${game.weekGoal} workouts in a week starts one`}</Txt>
          </View>
        </Row>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: game.weekGoal }, (_, i) => <View key={i} style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: i < game.weekDone ? t.xp : t.fill }} />)}
          </View>
          <Txt v="label">{`${game.weekDone} of ${game.weekGoal} this week`}</Txt>
        </View>
      </Row>
      {game.todayPts ? <Txt v="fine">{`${fmtPts(game.todayPts, true)} today${zone === 'red' ? ' · red day: backing off and sleep pay today' : ''}`}</Txt> : zone === 'red' ? <Txt v="fine">Red day: backing off, sleep and an easy session earn points today.</Txt> : null}
    </Card>
  );
}

function Bounties() {
  const { data, today, ctx, game } = useApp();
  const di = useDayIdx();
  const t = useTheme();
  const day = ctx.days()[di];
  const zone = ctx.readiness(today).zone;
  const list = useMemo(() => {
    if (!day) return [];
    const done = ctx.sessions.filter(s => s.date === today && s.day.toLowerCase() === day.name.toLowerCase()).pop();
    const sc = done ? game.sessions.get(done.id) : undefined;
    if (sc) return sc.bounties.map(b => ({ ...b.bounty, met: b.met }));
    return bountiesToday(data, today, day.name, zone).map(b => ({ ...b, met: false }));
  }, [data, today, day, zone, ctx, game]);
  if (!data.settings.game || !list.length) return null;
  return (
    <Card>
      <Row><Txt v="h2">Today’s bounties</Txt><Icon name="target" size={20} color={t.xp} width={2} /></Row>
      {list.map(b => (
        <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: b.met ? t.go : t.line, backgroundColor: b.met ? t.go : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {b.met ? <Icon name="check" size={14} color="#fff" width={2.6} /> : null}
          </View>
          <View style={{ flex: 1 }}><Txt v="body" style={{ fontWeight: '600', fontSize: 14 }}>{b.title}</Txt><Txt v="fine">{b.detail}</Txt></View>
          <PtsText n={b.pts} size={13.5} color={b.met ? t.go : t.xp} />
        </View>
      ))}
    </Card>
  );
}

function CheckIn({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const { data, today, mutate, demo, whoop, syncWhoop } = useApp();
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
      <View><Txt v="h2">{`Today's recovery`}</Txt><Txt v="fine">{whoop.status === 'connected' ? 'WHOOP hasn’t scored today yet. Sync, or type it in.' : 'From the WHOOP app, or connect WHOOP in Settings to skip this.'}</Txt></View>
      {whoop.status === 'connected' ? <Button small kind="tint" title={whoop.busy ? 'Syncing…' : 'Sync WHOOP'} onPress={() => syncWhoop()} disabled={whoop.busy} /> : null}
      {whoop.msg && whoop.status === 'connected' && !whoop.busy ? <Txt v="fine">{whoop.msg}</Txt> : null}
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
  const { ctx, today, demo, whoop, syncWhoop, data } = useApp();
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
      {demo ? null : whoop.status === 'connected' ? (
        <Row>
          <Txt v="fine">{whoop.busy ? 'Syncing with WHOOP…' : r.src === 'api' ? `From WHOOP · synced ${ago(data.whoopSync)}` : `WHOOP synced ${ago(data.whoopSync)}`}</Txt>
          <Pressable onPress={() => syncWhoop()} disabled={whoop.busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sync WHOOP now"><Icon name="sync" size={18} color={whoop.busy ? t.ink3 : t.accent} /></Pressable>
        </Row>
      ) : <Row><Button kind="link" title="Edit" onPress={onEdit} /><Button kind="link" title="Connect WHOOP" onPress={() => router.push('/settings')} /></Row>}
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

function TalkToCoach() {
  const { data } = useApp();
  const t = useTheme();
  const last = [...data.coach.msgs].reverse().find(m => m.role === 'coach');
  return (
    <Card onPress={() => router.navigate('/coach')}>
      <Row>
        <Row gap={10} style={{ justifyContent: 'flex-start', flex: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="coach" size={20} color={t.accent} /></View>
          <View style={{ flex: 1 }}><Txt v="h3">Talk to your coach</Txt><Txt v="fine" numberOfLines={2}>{last ? last.text : 'Ask for today’s plan, or tell Pace how a lift felt.'}</Txt></View>
        </Row>
        <Icon name="chevron" size={18} color={t.ink3} />
      </Row>
    </Card>
  );
}

export default function Today() {
  const { ctx, today, demo, startDemo, endDemo, data } = useApp();
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const r = ctx.readiness(today);
  return (
    <Screen title="Today" sub={fmtLong(today)} eyebrow={<Row gap={6} style={{ justifyContent: 'flex-start' }}><Logo size={16} color={t.accent} /><Txt v="label" color={t.ink2} style={{ fontWeight: '600' }}>Pace</Txt></Row>}
      right={<Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="gear" size={20} color={t.ink2} /></Pressable>}>
      {demo ? <Card style={{ backgroundColor: t.holdSoft, borderColor: t.holdSoft }}><Row><Txt v="body" color={t.hold} style={{ fontWeight: '500' }}>Viewing demo data</Txt><Button small title="Exit demo" onPress={endDemo} /></Row></Card> : null}
      <TwoCol
        left={<>
          <Score />
          {r.zone === 'unknown' || editing ? <CheckIn onDone={() => setEditing(false)} canCancel={r.zone !== 'unknown'} /> : <Recovery onEdit={() => setEditing(true)} />}
          <TodayWorkout />
        </>}
        right={<>
          <Bounties />
          <TalkToCoach />
          <Coach />
          {!demo && data.sessions.length < 3 ? <Row><Txt v="fine">See every feature with sample data.</Txt><Button small title="Try demo" onPress={startDemo} /></Row> : null}
        </>}
      />
    </Screen>
  );
}
