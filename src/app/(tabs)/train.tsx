import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { fmtMid } from '../../engine/dates';
import { bestEffort, betWon, bountiesToday, MAX_BETS, scoreDraft, STAKES, type SessionScore, type SetScore } from '../../engine/game';
import { isFree, plates, rxText, topStr, ZONES, type Prescription } from '../../engine/training';
import type { Bet, Exercise, LoggedSet, ZoneOrUnknown } from '../../engine/types';
import { fmtW, key, letter, num } from '../../engine/util';
import { useApp, useDayIdx, type Draft } from '../../store/AppStore';
import { Badge, Button, Card, Chip, Confirm, Field, Grid, Row, Screen, Section, success, Tag, tap, Txt } from '../../ui/components';
import { CritPill, fmtPts, PtsText, useCountUp } from '../../ui/game';
import { Icon } from '../../ui/icons';
import { useTheme } from '../../ui/theme';
import { VideoTile } from '../../ui/VideoTile';

const RIR_LABEL = ['Failure', '1 left', '2 left', '3 left', '4+ left'];

/** What a set needs to win a bet: the Pace target for that exercise. */
const betTarget = (p: Prescription) => (p.kind === 'lift' ? { w: p.w, reps: p.reps } : null);

/** Turns the draft into logged sets (in order) plus resolved bets, and remembers which row became which set. */
function readDraft(exercises: Exercise[], cur: Draft, targets: ({ w: number; reps: number } | null)[]) {
  const sets: LoggedSet[] = [];
  const bets: Bet[] = [];
  const slot: (number | null)[][] = [];
  exercises.forEach((ex, i) => {
    let n = 0;
    slot[i] = (cur.rows[i] ?? []).map(r => {
      const reps = Math.round(num(r.r) ?? 0);
      if (isFree(ex.type) || reps <= 0) return null;
      const x: LoggedSet = { ex: ex.name, w: Math.max(0, num(r.w) ?? 0), r: reps, rir: r.rir };
      sets.push(x);
      const tg = targets[i];
      if (r.bet && tg) bets.push({ ex: ex.name, set: n, stake: r.bet, w: tg.w, reps: tg.reps, won: betWon(tg, x) });
      return n++;
    });
  });
  return { sets, bets, slot };
}

function EffortTag({ s, rir }: { s: SetScore; rir: number | null }) {
  const t = useTheme();
  const tags: { text: string; color: string }[] = [];
  if (s.heavier) tags.push({ text: 'Heavier ×1.25', color: t.accent });
  if (s.lighter) tags.push({ text: 'Lighter ×0.85', color: t.stop });
  if (rir != null) tags.push({ text: `${RIR_LABEL[Math.min(4, rir)]} ×${s.effort.toFixed(1)}`, color: s.effort >= 1.5 ? t.go : s.effort >= 1 ? t.ink2 : t.stop });
  return <>{tags.map(g => <Text key={g.text} style={{ color: g.color, fontSize: 12, fontWeight: '600' }}>{g.text}</Text>)}</>;
}

function SetLine({ score, rir, bet, betResult, canBet, choosing, target, onChoose, onBet, onCancelBet }: {
  score: SetScore | null; rir: number | null; bet?: number; betResult: boolean | null; canBet: boolean; choosing: boolean;
  target: { w: number; reps: number } | null; onChoose: () => void; onBet: (stake: number | null) => void; onCancelBet: () => void;
}) {
  const t = useTheme();
  const [pop] = useState(() => new Animated.Value(1));
  const lastCrit = useRef(1);
  useEffect(() => {
    const c = score?.crit ?? 1;
    if (c > 1 && lastCrit.current === 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
    lastCrit.current = c;
  }, [score?.crit, pop]);
  const tgt = target ? `${target.reps} reps${target.w > 0 ? ` at ${fmtW(target.w)} lb` : ''}` : '';

  if (score) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4, paddingLeft: 30 }}>
        <PtsText n={score.pts} size={13.5} />
        <EffortTag s={score} rir={rir} />
        <Animated.View style={{ transform: [{ scale: pop }] }}><CritPill crit={score.crit} small /></Animated.View>
        {bet ? <Text style={{ color: betResult ? t.go : t.stop, fontSize: 12, fontWeight: '700' }}>{betResult ? `Bet won +${bet}` : `Bet lost −${bet}`}</Text> : null}
      </View>
    );
  }
  if (bet) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 30 }}>
        <Icon name="dice" size={14} color={t.xp} width={2} />
        <Text style={{ flex: 1, color: t.xp, fontSize: 12.5, fontWeight: '600' }}>{`${bet} on ${tgt}. Hit it and it doubles.`}</Text>
        <Pressable onPress={onCancelBet} hitSlop={8} accessibilityRole="button"><Text style={{ color: t.ink3, fontSize: 12.5 }}>Cancel</Text></Pressable>
      </View>
    );
  }
  if (choosing) {
    return (
      <View style={{ gap: 6, paddingLeft: 30 }}>
        <Text style={{ color: t.ink2, fontSize: 12.5 }}>{`Double or nothing: hit ${tgt}.`}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STAKES.map(s => <Button key={s} small kind="tint" title={`Bet ${s}`} onPress={() => onBet(s)} />)}
          <Button small kind="link" title="Not now" onPress={() => onBet(null)} />
        </View>
      </View>
    );
  }
  if (canBet) {
    return (
      <Pressable onPress={onChoose} hitSlop={6} accessibilityRole="button" accessibilityLabel="Bet points on this set" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' }}>
        <Icon name="dice" size={14} color={t.ink3} width={2} />
        <Text style={{ color: t.ink3, fontSize: 12.5, fontWeight: '500' }}>Bet on this set</Text>
      </Pressable>
    );
  }
  return null;
}

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

interface Betting { on: boolean; left: number; balance: number }

function ExerciseCard({ ex, i, zone, p, draft, setDraft, live, slots, betting }: {
  ex: Exercise; i: number; zone: ZoneOrUnknown; p: Prescription; draft: Draft; setDraft: (d: Draft) => void;
  live: SessionScore | null; slots: (number | null)[]; betting: Betting;
}) {
  const { ctx, data, demo } = useApp();
  const t = useTheme();
  const [showHist, setShowHist] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const head = (
    <Row gap={12} style={{ justifyContent: 'flex-start' }}>
      <Badge letter={letter(i)} large />
      <View style={{ flex: 1 }}><Txt v="h3" style={{ fontSize: 17 }}>{ex.name}</Txt><Txt v="fine">{rxText(ex)}{ex.rxSet ? '' : ' · placeholder'}</Txt></View>
    </Row>
  );
  const video = <VideoTile name={ex.name} video={ctx.video(ex.name)} canEdit={!demo} />;
  if (isFree(ex.type) || p.kind === 'free') return <Card>{head}{video}<Txt v="fine">{ex.type === 'cardio' ? (zone === 'red' ? 'Easy pace today.' : 'As written.') : 'Follow the circuit as written.'}</Txt></Card>;
  const rows = draft.rows[i] ?? [];
  const big = p.w == null ? 'Find your weight' : p.w > 0 ? `${fmtW(p.w)} lb` : `${p.reps} reps`;
  const small = p.w == null || p.w > 0 ? `× ${p.reps}` : '';
  const pl = ex.type === 'barbell' && p.kind === 'lift' ? plates(p.w, data.settings.bar) : null;
  const meta = [p.kind === 'lift' ? `Last ${p.last}` : '', pl, p.sets !== ex.sets ? `${p.sets} sets today` : '', p.effort].filter(Boolean).join(' · ');
  const hist = ctx.hist(ex.name);
  const exScore = live?.exercises.find(e => key(e.name) === key(ex.name));
  const target = betTarget(p);
  const game = data.settings.game;
  const best = bestEffort(zone, ex.type === 'barbell');
  const setRow = (j: number, patch: Partial<Draft['rows'][number][number]>) => setDraft({ ...draft, rows: draft.rows.map((r, a) => (a === i ? r.map((x, b) => (b === j ? { ...x, ...patch } : x)) : r)) });
  return (
    <Card>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>{head}</View>
        {game && exScore ? <PtsText n={exScore.pts} size={15} /> : null}
      </Row>
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
        {game ? <Txt v="fine" style={{ fontSize: 12.5 }} color={t.xp}>{`Top payout today: ${RIR_LABEL[best].toLowerCase()}${zone === 'red' ? '. Failure pays less on red days.' : '.'}`}</Txt> : null}
      </View>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Txt v="label" style={{ width: 24, textAlign: 'center' }}>Set</Txt>
          <Txt v="label" style={{ flex: 1.2, textAlign: 'center' }}>lb</Txt>
          <Txt v="label" style={{ flex: 1, textAlign: 'center' }}>Reps</Txt>
          <Txt v="label" style={{ width: 167, textAlign: 'center' }}>Reps left</Txt>
        </View>
        {rows.map((r, j) => {
          const n = slots[j];
          // Offer a bet only on the next set to log, so the list stays calm.
          const nextOpen = slots.findIndex((x, k) => x == null && !rows[k]?.bet);
          const sc = n != null && exScore ? exScore.sets[n] ?? null : null;
          const res = n != null && r.bet && target ? betWon(target, { ex: ex.name, w: Math.max(0, num(r.w) ?? 0), r: Math.round(num(r.r) ?? 0), rir: r.rir }) : null;
          return (
            <View key={j} style={{ gap: 5 }}>
              <SetRow i={i} j={j} draft={draft} setDraft={setDraft} wPh={p.w ? fmtW(p.w) : '0'} rPh={String(p.reps)} />
              {game ? (
                <SetLine score={sc} rir={r.rir} bet={r.bet} betResult={res} target={target} choosing={choosing === j}
                  canBet={!demo && betting.on && !!target && n == null && j === nextOpen && betting.left > 0 && betting.balance >= STAKES[0]}
                  onChoose={() => { tap(); setChoosing(j); }}
                  onBet={stake => { setChoosing(null); if (stake != null && stake <= betting.balance) { tap(); setRow(j, { bet: stake }); } }}
                  onCancelBet={() => setRow(j, { bet: undefined })} />
              ) : null}
            </View>
          );
        })}
      </View>
      {game && exScore?.bonus ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: t.xpSoft }}>
          <Icon name="trophy" size={18} color={t.xp} width={2} />
          <Text style={{ flex: 1, color: t.xp, fontWeight: '700', fontSize: 14 }}>{exScore.bonus.label === 'PR' ? 'New PR!' : exScore.bonus.label}</Text>
          <PtsText n={exScore.bonus.pts} />
        </View>
      ) : null}
      <Row>
        <Button kind="link" title="Add set" onPress={() => { const last = rows[rows.length - 1]; setDraft({ ...draft, rows: draft.rows.map((r, a) => (a === i ? [...r, { w: last?.w ?? '', r: '', rir: null }] : r)) }); }} />
        {hist.length ? <Button kind="link" title={showHist ? 'Hide history' : `History · ${hist.length}`} onPress={() => setShowHist(!showHist)} /> : null}
      </Row>
      {showHist ? <View style={{ gap: 4 }}>{hist.slice(-6).reverse().map(e => <Row key={e.id}><Txt v="sub">{fmtMid(e.date)}</Txt><Txt v="body" style={{ fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{e.sets.map(x => (x.w > 0 ? fmtW(x.w) + '×' : '') + x.r).join('  ')}</Txt></Row>)}</View> : null}
    </Card>
  );
}

function LiveScore({ live, bounties, zone }: { live: SessionScore; bounties: { title: string; detail: string; pts: number; met: boolean }[]; zone: ZoneOrUnknown }) {
  const t = useTheme();
  const total = live.earned + live.bets;
  const shown = useCountUp(total, 450, false);
  return (
    <Card style={{ borderColor: t.xpSoft }}>
      <Row style={{ alignItems: 'flex-end' }}>
        <View>
          <Txt v="label">Points this workout</Txt>
          <Text style={{ color: t.xp, fontSize: 34, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{fmtPts(shown)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {live.mult > 1 ? <Chip text={`${live.streak}-week streak ×${live.mult.toFixed(1)}`} tone="accent" /> : null}
          <Txt v="fine">{[live.crits ? `${live.crits} crit${live.crits > 1 ? 's' : ''}` : '', live.prs ? `${live.prs} PR${live.prs > 1 ? 's' : ''}` : '', live.bets ? `bets ${fmtPts(live.bets, true)}` : ''].filter(Boolean).join(' · ') || 'Every rep counts'}</Txt>
        </View>
      </Row>
      {bounties.length ? (
        <View style={{ gap: 8 }}>
          {bounties.map(b => (
            <View key={b.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: b.met ? t.go : t.line, backgroundColor: b.met ? t.go : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {b.met ? <Icon name="check" size={14} color="#fff" width={2.6} /> : null}
              </View>
              <View style={{ flex: 1 }}><Txt v="body" style={{ fontWeight: '600', fontSize: 14 }}>{b.title}</Txt><Txt v="fine">{b.detail}</Txt></View>
              <PtsText n={b.pts} size={13} color={b.met ? t.go : t.ink3} />
            </View>
          ))}
        </View>
      ) : null}
      {zone === 'red' ? <Txt v="fine">No bets on red days. Today the points are in backing off.</Txt> : null}
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
  const { ctx, data, game, today, demo, draft, setDraft, setDayIdx, mutate } = useApp();
  const t = useTheme();
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
  const day = days.length ? days[di] : null;
  const zone = cur ? ctx.readiness(cur.date).zone : 'unknown';
  const presc = useMemo(() => (day ? day.exercises.map(ex => ctx.prescribe(ex, zone)) : []), [day, ctx, zone]);
  const targets = useMemo(() => presc.map(betTarget), [presc]);
  const read = useMemo(() => (day && cur ? readDraft(day.exercises, cur, targets) : null), [day, cur, targets]);
  const live = useMemo(() => (day && cur && read ? scoreDraft(data, { date: cur.date, day: day.name, zone: zone === 'unknown' ? null : zone, sets: read.sets, bets: read.bets }) : null), [data, day, cur, read, zone]);
  const bounties = useMemo(() => {
    if (!day || !cur) return [];
    if (live && live.bounties.length) return live.bounties.map(b => ({ ...b.bounty, met: b.met }));
    return bountiesToday(data, cur.date, day.name, zone).map(b => ({ ...b, met: false }));
  }, [live, data, day, cur, zone]);

  if (!day || !cur || !read) return <Screen title="Train"><Card><Txt v="fine">Add workouts in Program first.</Txt></Card></Screen>;

  // Bets: three per workout, paid from your points. Settled bets count; open ones hold their stake.
  const allBets = cur.rows.flat().filter(r => r.bet).length;
  const openStake = cur.rows.flat().reduce((a, r) => a + (r.bet && !(Math.round(num(r.r) ?? 0) > 0) ? r.bet : 0), 0);
  const settled = read.bets.reduce((a, b) => a + (b.won ? b.stake : -b.stake), 0);
  const betting: Betting = { on: zone !== 'red' && data.settings.game, left: MAX_BETS - allBets, balance: game.total + settled - openStake };

  const finish = () => {
    if (demo) return;
    if (!read.sets.length) { setMsg('Enter reps for at least one set.'); return; }
    const rd = ctx.readiness(cur.date);
    const id = 's' + Date.now().toString(36);
    const logged = new Set(read.sets.map(x => key(x.ex)));
    mutate(d => {
      d.sessions.push({ id, date: cur.date, day: day.name, zone: rd.zone === 'unknown' ? null : rd.zone, rec: rd.rec ?? null, src: 'app', sets: read.sets, ...(read.bets.length ? { bets: read.bets } : {}) });
      // Feedback nudges are one-shot: logging the exercise uses them up.
      d.coach.nudges = d.coach.nudges.filter(n => !logged.has(key(n.ex)));
    });
    success();
    setDraft(null); setDayIdx(null); setMsg('');
    router.push({ pathname: '/results', params: { id, fresh: '1' } });
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
      {data.settings.game && live ? <LiveScore live={live} bounties={bounties} zone={zone} /> : null}
      <Grid>{day.exercises.map((ex, i) => <ExerciseCard key={ex.id} ex={ex} i={i} zone={zone} p={presc[i]} draft={cur} setDraft={setDraft} live={live} slots={read.slot[i] ?? []} betting={betting} />)}</Grid>
      {msg ? <Txt v="body" style={{ fontWeight: '500' }}>{msg}</Txt> : null}
      <Button kind="primary" wide title={data.settings.game && live && live.earned ? `Finish workout · ${fmtPts(live.earned + live.bets)} pts` : 'Finish workout'} onPress={finish} disabled={demo} />
      <Section>Recent sessions</Section>
      <Card>
        {recent.length ? recent.map(s => {
          const z = ctx.sessionZone(s);
          const byEx = new Map<string, typeof s.sets>();
          s.sets.forEach(x => { if (!byEx.has(x.ex)) byEx.set(x.ex, []); byEx.get(x.ex)!.push(x); });
          const tops = [...byEx.entries()].slice(0, 3).map(([n, sets]) => `${n} ${topStr(sets)}`).join(' · ');
          const sc = game.sessions.get(s.id);
          return (
            <View key={s.id} style={{ gap: 3 }}>
              <Pressable onPress={() => router.push({ pathname: '/results', params: { id: s.id } })} accessibilityRole="button" style={{ gap: 3 }}>
                <Row gap={8}>
                  <Row gap={8} style={{ justifyContent: 'flex-start', flex: 1 }}><Txt v="h3">{fmtMid(s.date)}</Txt><Txt v="fine">{s.day}</Txt>{z ? <Chip text={ZONES[z].label} zone={z} /> : null}</Row>
                  {data.settings.game && sc ? <Text style={{ color: t.xp, fontWeight: '700', fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{fmtPts(sc.total)} pts</Text> : null}
                </Row>
                <Txt v="fine">{tops}</Txt>
              </Pressable>
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
