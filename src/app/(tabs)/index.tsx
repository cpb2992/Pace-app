import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fmtLong } from '../../engine/dates';
import { bountiesToday, streakMult } from '../../engine/game';
import { evidence, FIX, rxText, VOICE, ZONES } from '../../engine/training';
import { fmtW, letter, num } from '../../engine/util';
import { useApp, useDayIdx } from '../../store/AppStore';
import { Badge, Button, Card, Field, List, Logo, Ring, Row, Screen, Section, Segmented, Tag, TwoCol, Txt } from '../../ui/components';
import { fmtPts, PtsText, RankBadge, XpBar } from '../../ui/game';
import { Icon } from '../../ui/icons';
import { F, numStyle, radius, useTheme, zoneColor } from '../../ui/theme';

const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function Stat({ label, value, unit, sub, first }: { label: string; value: string; unit?: string; sub?: string; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 3, paddingLeft: first ? 0 : 12, borderLeftWidth: first ? 0 : StyleSheet.hairlineWidth, borderLeftColor: t.line }}>
      <Txt v="label">{label}</Txt>
      <Text style={numStyle(26, value === '–' ? t.ink3 : t.ink)}>{value}{unit ? <Text style={{ fontFamily: F.med, fontSize: 12, color: t.ink3 }}>{` ${unit}`}</Text> : null}</Text>
      {sub ? <Txt v="label">{sub}</Txt> : null}
    </View>
  );
}

/** The top of Today: recovery as a plate, what it means, and the night's numbers. */
function Recovery({ onEdit }: { onEdit: () => void }) {
  const { ctx, today, demo, whoop, syncWhoop, data } = useApp();
  const t = useTheme();
  const r = ctx.readiness(today);
  const z = ZONES[r.zone];
  const zc = zoneColor(t, r.zone).fg;
  const strain = data.whoop[today]?.strain;
  return (
    <View style={{ gap: 18, paddingTop: 2 }}>
      <Row gap={18} style={{ justifyContent: 'flex-start' }}>
        <Ring value={r.rec ?? 0} zone={r.zone} size={136} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 14, color: zc }}>{z.label}</Text>
          <Txt v="display" style={{ fontSize: 38, lineHeight: 40 }}>{z.head}</Txt>
          <Txt v="sub">{z.sub}</Txt>
        </View>
      </Row>
      <View style={{ flexDirection: 'row', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
        <Stat first label="HRV" value={r.hrv != null ? String(Math.round(r.hrv)) : '–'} unit="ms" sub={r.base?.n && r.base.n >= 7 && r.base.mean ? `Avg ${Math.round(r.base.mean)}` : undefined} />
        <Stat label="Resting HR" value={r.rhr != null ? String(Math.round(r.rhr)) : '–'} unit="bpm" />
        <Stat label="Sleep" value={r.sleep != null ? String(r.sleep) : '–'} unit="h" />
        {strain != null ? <Stat label="Strain" value={String(strain)} /> : null}
      </View>
      {r.notes.map(n => <Txt key={n} v="fine">{n}</Txt>)}
      {demo ? null : whoop.status === 'connected' ? (
        <Pressable onPress={() => syncWhoop()} disabled={whoop.busy} accessibilityRole="button" accessibilityLabel="Sync WHOOP now" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 }}>
          <Icon name="sync" size={15} color={t.ink3} />
          <Txt v="label">{whoop.busy ? 'Syncing with WHOOP' : `WHOOP, synced ${ago(data.whoopSync)}`}</Txt>
        </Pressable>
      ) : (
        <Row gap={16} style={{ justifyContent: 'flex-start', marginTop: -6 }}>
          <Button kind="link" title="Edit numbers" onPress={onEdit} />
          <Button kind="link" title="Connect WHOOP" onPress={() => router.push('/settings')} />
        </Row>
      )}
    </View>
  );
}

function CheckIn({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const { data, today, mutate, demo, whoop, syncWhoop } = useApp();
  const t = useTheme();
  const prev = data.whoop[today];
  const [rec, setRec] = useState(prev?.rec != null ? String(prev.rec) : '');
  const [hrv, setHrv] = useState(prev?.hrv != null ? String(prev.hrv) : '');
  const [rhr, setRhr] = useState(prev?.rhr != null ? String(prev.rhr) : '');
  const [sleep, setSleep] = useState(prev?.sleep != null ? String(prev.sleep) : '');
  const [err, setErr] = useState('');
  const save = () => {
    const r = num(rec);
    if (r == null || r < 0 || r > 100) { setErr('Recovery is a score from 0 to 100.'); return; }
    const s = num(sleep);
    mutate(d => { d.whoop[today] = { ...(d.whoop[today] ?? {}), rec: Math.round(r), hrv: num(hrv), rhr: num(rhr), sleep: s != null ? Math.round(s * 10) / 10 : null, src: 'manual' }; });
    onDone();
  };
  const connected = whoop.status === 'connected';
  return (
    <Card style={{ borderRadius: radius.panel, padding: 18 }}>
      <View style={{ gap: 4 }}>
        <Txt v="h2">How recovered are you?</Txt>
        <Txt v="sub">{connected ? 'WHOOP hasn’t scored today yet. Sync, or enter it yourself.' : 'Copy today’s numbers from WHOOP, or connect it once and skip this.'}</Txt>
      </View>
      <Row gap={10}><Field label="Recovery %" value={rec} onChangeText={setRec} keyboardType="number-pad" placeholder="72" /><Field label="HRV (ms)" value={hrv} onChangeText={setHrv} keyboardType="decimal-pad" placeholder="54" /></Row>
      <Row gap={10}><Field label="Resting HR" value={rhr} onChangeText={setRhr} keyboardType="number-pad" placeholder="56" /><Field label="Sleep (hours)" value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" placeholder="7.2" /></Row>
      {err ? <Txt v="fine" color={t.stop}>{err}</Txt> : null}
      <Row gap={8} style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <Button kind="primary" title="Save" onPress={save} disabled={demo} />
        {connected ? <Button title={whoop.busy ? 'Syncing…' : 'Sync WHOOP'} onPress={() => syncWhoop()} disabled={whoop.busy} /> : <Button title="Connect WHOOP" onPress={() => router.push('/settings')} />}
        {canCancel ? <Button kind="link" title="Cancel" onPress={onDone} /> : null}
      </Row>
      {whoop.msg && connected && !whoop.busy ? <Txt v="fine">{whoop.msg}</Txt> : null}
    </Card>
  );
}

function UpNext() {
  const { ctx, today, dayIdx, setDayIdx, setDraft } = useApp();
  const di = useDayIdx();
  const days = ctx.days();
  const zone = ctx.readiness(today).zone;
  if (!days.length) return <Card><Txt v="h2">No workouts yet</Txt><Txt v="sub">Add your coach’s workouts in Program.</Txt></Card>;
  const day = days[di];
  const when = dayIdx == null ? ctx.pickDay().label : 'Picked';
  const done = ctx.sessions.some(s => s.date === today && s.day.toLowerCase() === day.name.toLowerCase());
  return (
    <View style={{ gap: 12 }}>
      <Section right={done ? 'Done today' : when === 'Today' ? undefined : when}>{day.name}</Section>
      {days.length > 1 ? <Segmented options={days.map((d, i) => ({ label: d.name.replace(/^Nov\/Dec\s+/i, ''), value: i }))} value={di} onChange={i => { setDayIdx(i); setDraft(null); }} /> : null}
      <List>
        {day.exercises.map((ex, j) => {
          const p = ctx.prescribe(ex, zone);
          return (
            <View key={ex.id} style={{ paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Badge letter={letter(j)} />
              <View style={{ flex: 1, gap: 1 }}>
                <Txt v="body" style={{ fontFamily: F.semi }} numberOfLines={1}>{ex.name}</Txt>
                <Txt v="sub">{p.kind === 'lift' ? `${p.w > 0 ? `${fmtW(p.w)} lb × ` : ''}${p.reps}` : p.kind === 'new' ? `Find a weight for ${p.reps}` : rxText(ex)}</Txt>
              </View>
              {p.kind === 'lift' ? <Tag text={p.tagText} kind={p.tag} /> : null}
            </View>
          );
        })}
      </List>
      <Button kind="primary" wide title={done ? `Log another ${day.name}` : `Start ${day.name}`} onPress={() => router.navigate('/train')} />
    </View>
  );
}

function Rank() {
  const { game, data } = useApp();
  const t = useTheme();
  if (!data.settings.game) return null;
  const mult = streakMult(game.streak);
  return (
    <Card style={{ gap: 14 }}>
      <Row gap={14} style={{ justifyContent: 'flex-start' }}>
        <RankBadge level={game.level} size={56} />
        <View style={{ flex: 1, gap: 7 }}>
          <Row style={{ alignItems: 'baseline' }}>
            <Txt v="h2">{game.rank}</Txt>
            <Text style={numStyle(24, t.xp)}>{fmtPts(game.total)}</Text>
          </Row>
          <XpBar into={game.into} need={game.need} height={6} />
          <Txt v="label">{`${fmtPts(game.need - game.into)} points to ${game.next}`}</Txt>
        </View>
      </Row>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line }} />
      <Row>
        <Row gap={10} style={{ justifyContent: 'flex-start', flex: 1 }}>
          <Icon name="flame" size={20} color={game.streak ? t.xp : t.ink3} fill={game.streak ? t.xp : 'none'} width={1.6} />
          <View style={{ flex: 1 }}>
            <Txt v="h3">{game.streak ? `${game.streak}-week streak` : 'No streak yet'}</Txt>
            <Txt v="label">{game.streak ? `Points ×${mult.toFixed(1)} while it lasts` : `${game.weekGoal} workouts in a week starts one`}</Txt>
          </View>
        </Row>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: game.weekGoal }, (_, i) => <View key={i} style={{ width: 18, height: 6, borderRadius: 3, backgroundColor: i < game.weekDone ? t.xp : t.raised }} />)}
          </View>
          <Txt v="label">{`${game.weekDone} of ${game.weekGoal} this week`}</Txt>
        </View>
      </Row>
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
  const open = list.filter(b => !b.met).reduce((a, b) => a + b.pts, 0);
  return (
    <View style={{ gap: 12 }}>
      <Section right={open ? `${fmtPts(open)} up for grabs` : 'All claimed'}>Bounties</Section>
      <List>
        {list.map(b => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: b.met ? t.go : t.lineStrong, backgroundColor: b.met ? t.go : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {b.met ? <Icon name="check" size={14} color={t.bg} width={2.6} /> : null}
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Txt v="body" style={{ fontFamily: F.semi, textDecorationLine: b.met ? 'line-through' : 'none' }} color={b.met ? t.ink2 : t.ink}>{b.title}</Txt>
              <Txt v="fine">{b.detail}</Txt>
            </View>
            <PtsText n={b.pts} size={14} color={b.met ? t.go : t.xp} />
          </View>
        ))}
      </List>
    </View>
  );
}

function TalkToCoach() {
  const { data } = useApp();
  const t = useTheme();
  const last = [...data.coach.msgs].reverse().find(m => m.role === 'coach');
  return (
    <Card onPress={() => router.navigate('/coach')} accessibilityLabel="Open the coach">
      <Row gap={12}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.raised, alignItems: 'center', justifyContent: 'center' }}><Logo size={20} color={t.ink} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">Coach</Txt>
          <Txt v="sub" numberOfLines={2}>{last ? last.text : 'Ask for today’s plan, or tell it how a lift felt.'}</Txt>
        </View>
        <Icon name="chevron" size={18} color={t.ink3} />
      </Row>
    </Card>
  );
}

/** The coasting check: one honest line, the score, and the evidence behind it. */
function EffortCheck() {
  const { ctx, data, today } = useApp();
  const t = useTheme();
  const c = ctx.coast();
  const v = VOICE[data.settings.tone === 'clean' ? 'clean' : 'nofilter'];
  if (!c.enough || !c.level) {
    return (
      <Card>
        <Txt v="h3">Effort check</Txt>
        <Txt v="sub">{`Unlocks after 3 workouts (${c.n} so far). It watches for easy sets, stalled weights and wasted green days.`}</Txt>
      </Card>
    );
  }
  const zone = ctx.readiness(today).zone;
  const head = c.level === 'coasting' && zone === 'green' ? v.greenCoast : v[c.level];
  const tone = c.level === 'working' ? t.go : c.level === 'close' ? t.hold : t.stop;
  const label = { coasting: 'Coasting', grind: 'Overreaching', close: 'Almost there', working: 'On track' }[c.level];
  return (
    <Card style={{ gap: 14 }}>
      <Row>
        <Txt v="h3">Effort check</Txt>
        <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: tone }}>{label}</Text>
      </Row>
      <Txt v="display" color={c.level === 'working' ? t.ink : tone} style={{ fontSize: 26, lineHeight: 28 }}>{head}</Txt>
      <Row gap={12}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.raised, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, Math.max(4, c.score ?? 0))}%`, height: '100%', backgroundColor: tone }} />
        </View>
        <Text style={numStyle(18, t.ink2)}>{c.score}</Text>
      </Row>
      <View style={{ gap: 8 }}>
        {evidence(c).map(e => (
          <Row key={e} gap={10} style={{ alignItems: 'flex-start', justifyContent: 'flex-start' }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.ink3, marginTop: 8 }} />
            <Txt v="sub" style={{ flex: 1 }}>{e}</Txt>
          </Row>
        ))}
      </View>
      <View style={{ padding: 13, borderRadius: radius.tile, backgroundColor: t.raised }}>
        <Txt v="body" style={{ fontFamily: F.med, fontSize: 14 }}>{FIX[c.level]}</Txt>
      </View>
    </Card>
  );
}

export default function Today() {
  const { ctx, today, demo, startDemo, endDemo, data } = useApp();
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const r = ctx.readiness(today);
  return (
    <Screen title="Today" eyebrow={fmtLong(today)}
      right={<Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: t.raised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}><Icon name="gear" size={21} color={t.ink} /></Pressable>}>
      {demo ? (
        <Row style={{ padding: 12, paddingHorizontal: 14, borderRadius: radius.tile, backgroundColor: t.holdSoft }}>
          <Txt v="body" color={t.hold} style={{ fontFamily: F.semi }}>Sample data</Txt>
          <Button small title="Back to mine" onPress={endDemo} />
        </Row>
      ) : null}
      <TwoCol
        left={<>
          {r.zone === 'unknown' || editing ? <CheckIn onDone={() => setEditing(false)} canCancel={r.zone !== 'unknown'} /> : <Recovery onEdit={() => setEditing(true)} />}
          <UpNext />
        </>}
        right={<>
          <Section>Progress</Section>
          <Rank />
          <Bounties />
          <Section>Coaching</Section>
          <TalkToCoach />
          <EffortCheck />
          {!demo && data.sessions.length < 3 ? <Button kind="link" title="See Pace with sample data" onPress={startDemo} /> : null}
        </>}
      />
    </Screen>
  );
}
