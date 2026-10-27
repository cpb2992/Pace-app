import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { fmtLong, fmtMid } from '../../engine/dates';
import { bestEffort, betWon, bountiesToday, MAX_BETS, scoreDraft, STAKES, type SessionScore, type SetScore } from '../../engine/game';
import { isFree, plates, rxText, topStr, ZONES, type Prescription } from '../../engine/training';
import type { Bet, Exercise, LoggedSet, ZoneOrUnknown } from '../../engine/types';
import { fmtW, key, letter, num } from '../../engine/util';
import { useApp, useDayIdx, type Draft } from '../../store/AppStore';
import { Badge, Button, Card, Confirm, Field, Grid, List, Row, Screen, Section, Segmented, success, Tag, tap, Txt } from '../../ui/components';
import { CritPill, fmtPts, PtsText, useCountUp } from '../../ui/game';
import { Icon } from '../../ui/icons';
import { F, numStyle, radius, useTheme, zoneColor } from '../../ui/theme';
import { VideoTile } from '../../ui/VideoTile';

const TANK = ['Failure', '1 in the tank', '2 in the tank', '3 in the tank', '4+ in the tank'];

/** "In the tank" buttons shrink on narrow phones (a Fold's cover screen) so weight and reps keep room. */
function useTankCell() {
  const { width } = useWindowDimensions();
  return width < 370 ? 26 : 30;
}

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

/** What a logged set earned, and why. */
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
  const small = { fontFamily: F.semi, fontSize: 12.5 } as const;

  if (score) {
    const effortColor = score.effort >= 1.5 ? t.go : score.effort >= 1 ? t.ink2 : t.stop;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4, paddingLeft: 34 }}>
        <PtsText n={score.pts} size={13} />
        {score.heavier ? <Text style={[small, { color: t.go }]}>Heavier ×1.25</Text> : null}
        {score.lighter ? <Text style={[small, { color: t.stop }]}>Lighter ×0.85</Text> : null}
        {rir != null ? <Text style={[small, { color: effortColor }]}>{`${TANK[Math.min(4, rir)]} ×${score.effort.toFixed(1)}`}</Text> : null}
        <Animated.View style={{ transform: [{ scale: pop }] }}><CritPill crit={score.crit} small /></Animated.View>
        {bet ? <Text style={[small, { color: betResult ? t.go : t.stop }]}>{betResult ? `Bet won +${bet}` : `Bet lost −${bet}`}</Text> : null}
      </View>
    );
  }
  if (bet) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 34 }}>
        <Icon name="dice" size={14} color={t.xp} width={2} />
        <Text style={[small, { flex: 1, color: t.xp }]}>{`${bet} riding on ${tgt}`}</Text>
        <Pressable onPress={onCancelBet} hitSlop={8} accessibilityRole="button"><Text style={[small, { color: t.ink3 }]}>Cancel</Text></Pressable>
      </View>
    );
  }
  if (choosing) {
    return (
      <View style={{ gap: 8, paddingLeft: 34 }}>
        <Text style={[small, { color: t.ink2 }]}>{`Double or nothing on ${tgt}`}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {STAKES.map(s => <Button key={s} small title={String(s)} onPress={() => onBet(s)} icon={<Icon name="dice" size={13} color={t.xp} width={2} />} />)}
          <Button small kind="link" title="Not now" onPress={() => onBet(null)} />
        </View>
      </View>
    );
  }
  if (canBet) {
    return (
      <Pressable onPress={onChoose} hitSlop={6} accessibilityRole="button" accessibilityLabel="Bet points on this set" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 34 }}>
        <Icon name="dice" size={14} color={t.ink3} width={2} />
        <Text style={[small, { color: t.ink3 }]}>Bet on this set</Text>
      </Pressable>
    );
  }
  return null;
}

function SetRow({ i, j, draft, setDraft, wPh, rPh }: { i: number; j: number; draft: Draft; setDraft: (d: Draft) => void; wPh: string; rPh: string }) {
  const t = useTheme();
  const cell = useTankCell();
  const row = draft.rows[i][j];
  const done = Math.round(num(row.r) ?? 0) > 0;
  const update = (patch: Partial<typeof row>) => {
    const rows = draft.rows.map((r, a) => (a === i ? r.map((x, b) => (b === j ? { ...x, ...patch } : x)) : r));
    setDraft({ ...draft, rows });
  };
  const input = { flex: 1, minWidth: 0, fontSize: 17, fontFamily: F.semi, color: t.ink, backgroundColor: t.raised, borderRadius: radius.control, paddingVertical: 10, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={[numStyle(20, done ? t.ink : t.ink3), { width: 28, textAlign: 'center' }]}>{j + 1}</Text>
      <TextInput value={row.w} onChangeText={w => update({ w })} placeholder={wPh} placeholderTextColor={t.ink3} keyboardType="decimal-pad" style={[input, { flexGrow: 1.25 }]} accessibilityLabel={`Set ${j + 1} weight`} />
      <TextInput value={row.r} onChangeText={r => update({ r })} placeholder={rPh} placeholderTextColor={t.ink3} keyboardType="number-pad" style={input} accessibilityLabel={`Set ${j + 1} reps`} />
      <View style={{ flexDirection: 'row', backgroundColor: t.raised, borderRadius: radius.control, padding: 2 }}>
        {[0, 1, 2, 3, 4].map(v => {
          const on = row.rir === v;
          return (
            <Pressable key={v} onPress={() => { tap(); update({ rir: on ? null : v }); }} accessibilityRole="button" accessibilityLabel={`${v === 4 ? '4 or more' : v} reps left`} accessibilityState={{ selected: on }}
              style={{ width: cell, height: 40, borderRadius: 10, backgroundColor: on ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: on ? t.accentInk : t.ink2, fontSize: 14, fontFamily: on ? F.bold : F.med }}>{v === 4 ? '4+' : v}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface Betting { on: boolean; left: number; balance: number }

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexBasis: '46%', flexGrow: 1, gap: 2 }}>
      <Txt v="label">{label}</Txt>
      <Txt v="body" style={{ fontFamily: F.med, fontSize: 14 }}>{value}</Txt>
    </View>
  );
}

function ExerciseCard({ ex, i, zone, p, draft, setDraft, live, slots, betting }: {
  ex: Exercise; i: number; zone: ZoneOrUnknown; p: Prescription; draft: Draft; setDraft: (d: Draft) => void;
  live: SessionScore | null; slots: (number | null)[]; betting: Betting;
}) {
  const { ctx, data, demo } = useApp();
  const t = useTheme();
  const [showHist, setShowHist] = useState(false);
  const [showTank, setShowTank] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const cell = useTankCell();
  const video = <VideoTile compact name={ex.name} video={ctx.video(ex.name)} canEdit={!demo} />;
  const head = (right?: React.ReactNode) => (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <Badge letter={letter(i)} large />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h2">{ex.name}</Txt>
        <Txt v="sub">{`${rxText(ex)}${ex.rxSet ? '' : ', sets to confirm'}`}</Txt>
      </View>
      {right}
    </Row>
  );
  if (isFree(ex.type) || p.kind === 'free') {
    return <Card>{head()}<Txt v="sub">{ex.type === 'cardio' ? (zone === 'red' ? 'Keep it easy today.' : 'As written.') : 'Follow the circuit as written.'}</Txt>{video}</Card>;
  }
  const rows = draft.rows[i] ?? [];
  const pl = ex.type === 'barbell' && p.kind === 'lift' ? plates(p.w, data.settings.bar) : null;
  const hist = ctx.hist(ex.name);
  const exScore = live?.exercises.find(e => key(e.name) === key(ex.name));
  const target = betTarget(p);
  const game = data.settings.game;
  const best = bestEffort(zone, ex.type === 'barbell');
  const setRow = (j: number, patch: Partial<Draft['rows'][number][number]>) => setDraft({ ...draft, rows: draft.rows.map((r, a) => (a === i ? r.map((x, b) => (b === j ? { ...x, ...patch } : x)) : r)) });
  // Offer a bet only on the next set to log, so the list stays calm.
  const nextOpen = slots.findIndex((x, k) => x == null && !rows[k]?.bet);

  return (
    <Card style={{ gap: 16 }}>
      {head(game && exScore && exScore.pts ? <PtsText n={exScore.pts} size={15} /> : undefined)}
      <View style={{ gap: 10 }}>
        <Row gap={10} style={{ justifyContent: 'flex-start', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {p.w == null ? <Text style={numStyle(36, t.ink)}>Find your weight</Text> : (
            <Text style={numStyle(48, t.ink)}>
              {p.w > 0 ? fmtW(p.w) : p.reps}
              <Text style={{ fontFamily: F.semi, fontSize: 16, color: t.ink2 }}>{p.w > 0 ? `  lb × ${p.reps}` : '  reps'}</Text>
            </Text>
          )}
          {p.kind === 'lift' ? <View style={{ marginBottom: 8 }}><Tag text={p.tagText} kind={p.tag} /></View> : null}
        </Row>
        <Txt v="body">{p.why}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12, paddingTop: 4 }}>
          {p.kind === 'lift' ? <Fact label="Last time" value={p.last} /> : null}
          {pl ? <Fact label="Each side" value={pl.replace(' per side', '')} /> : null}
          <Fact label="Effort" value={p.effort} />
          {game ? <Fact label="Most points" value={TANK[best]} /> : null}
          {p.sets !== ex.sets ? <Fact label="Today" value={`${p.sets} sets`} /> : null}
        </View>
        {video}
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt v="label" style={{ width: 28, textAlign: 'center' }}>Set</Txt>
          <Txt v="label" style={{ flex: 1.25, textAlign: 'center' }}>lb</Txt>
          <Txt v="label" style={{ flex: 1, textAlign: 'center' }}>Reps</Txt>
          <Pressable onPress={() => { tap(); setShowTank(s => !s); }} accessibilityRole="button" accessibilityLabel="What does in the tank mean?" hitSlop={8}
            style={{ width: cell * 5 + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Txt v="label" numberOfLines={1}>{cell < 30 ? 'Tank' : 'In the tank'}</Txt>
            <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: t.ink3, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.bold, fontSize: 9.5, color: t.ink3 }}>?</Text></View>
          </Pressable>
        </View>
        {showTank ? (
          <View style={{ padding: 12, borderRadius: radius.tile, backgroundColor: t.raised }}>
            <Txt v="fine">How many more clean reps you had when you stopped. 0 means you couldn’t do another, 4+ means it was easy. Tap it after every set.</Txt>
          </View>
        ) : null}
        {rows.map((r, j) => {
          const n = slots[j];
          const sc = n != null && exScore ? exScore.sets[n] ?? null : null;
          const res = n != null && r.bet && target ? betWon(target, { ex: ex.name, w: Math.max(0, num(r.w) ?? 0), r: Math.round(num(r.r) ?? 0), rir: r.rir }) : null;
          return (
            <View key={j} style={{ gap: 6 }}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.tile, backgroundColor: t.xpSoft }}>
          <Icon name="trophy" size={18} color={t.xp} width={2} />
          <Text style={{ flex: 1, color: t.xp, fontFamily: F.bold, fontSize: 15 }}>{exScore.bonus.label === 'PR' ? 'New PR' : exScore.bonus.label}</Text>
          <PtsText n={exScore.bonus.pts} size={15} />
        </View>
      ) : null}
      <Row>
        <Button kind="link" title="Add a set" onPress={() => { const last = rows[rows.length - 1]; setDraft({ ...draft, rows: draft.rows.map((r, a) => (a === i ? [...r, { w: last?.w ?? '', r: '', rir: null }] : r)) }); }} />
        {hist.length ? <Button kind="link" title={showHist ? 'Hide history' : `History (${hist.length})`} onPress={() => setShowHist(!showHist)} /> : null}
      </Row>
      {showHist ? (
        <View style={{ gap: 8 }}>
          {hist.slice(-6).reverse().map(e => (
            <Row key={e.id}>
              <Txt v="sub">{fmtMid(e.date)}</Txt>
              <Txt v="body" style={{ fontFamily: F.med, fontSize: 14, fontVariant: ['tabular-nums'] }}>{e.sets.map(x => (x.w > 0 ? fmtW(x.w) + '×' : '') + x.r).join('   ')}</Txt>
            </Row>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Bounties({ list }: { list: { title: string; detail: string; pts: number; met: boolean }[] }) {
  const t = useTheme();
  if (!list.length) return null;
  return (
    <List>
      {list.map(b => (
        <View key={b.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: b.met ? t.go : t.lineStrong, backgroundColor: b.met ? t.go : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {b.met ? <Icon name="check" size={13} color={t.bg} width={2.6} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="body" style={{ fontFamily: F.semi, fontSize: 14.5 }} color={b.met ? t.ink2 : t.ink}>{b.title}</Txt>
            <Txt v="fine">{b.detail}</Txt>
          </View>
          <PtsText n={b.pts} size={13} color={b.met ? t.go : t.xp} />
        </View>
      ))}
    </List>
  );
}

function DateField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setText(value); }
  const commit = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text))) onCommit(text); else setText(value); };
  return <Field label="Workout date (YYYY-MM-DD)" value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} autoCapitalize="none" placeholder="YYYY-MM-DD" />;
}

export default function Train() {
  const { ctx, data, game, today, demo, draft, setDraft, setDayIdx, mutate } = useApp();
  const t = useTheme();
  const di = useDayIdx();
  const days = ctx.days();
  const block = ctx.activeBlock();
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(false);
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
  const shownPts = useCountUp(live ? live.earned + live.bets : 0, 450, false);

  if (!day || !cur || !read) return <Screen title="Train"><Card><Txt v="h3">No workouts yet</Txt><Txt v="sub">Add your coach’s workouts in Program.</Txt></Card></Screen>;

  // Bets: three per workout, paid from your points. Settled bets count; open ones hold their stake.
  const allBets = cur.rows.flat().filter(r => r.bet).length;
  const openStake = cur.rows.flat().reduce((a, r) => a + (r.bet && !(Math.round(num(r.r) ?? 0) > 0) ? r.bet : 0), 0);
  const settled = read.bets.reduce((a, b) => a + (b.won ? b.stake : -b.stake), 0);
  const betting: Betting = { on: zone !== 'red' && data.settings.game, left: MAX_BETS - allBets, balance: game.total + settled - openStake };

  const finish = () => {
    if (demo) return;
    if (!read.sets.length) { setMsg('Log reps on at least one set first.'); return; }
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

  const zc = zoneColor(t, zone).fg;
  const recent = ctx.sessions.slice(-12).reverse();
  const pts = live ? live.earned + live.bets : 0;
  return (
    <Screen title={day.name}
      eyebrow={<Row gap={7} style={{ justifyContent: 'flex-start' }}>{zone !== 'unknown' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: zc }} /> : null}<Txt v="sub">{zone !== 'unknown' ? `${ZONES[zone].label}, ${block?.name ?? 'program'} block` : `${block?.name ?? 'Program'} block`}</Txt></Row>}
      right={data.settings.game ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={numStyle(34, pts ? t.xp : t.ink3)}>{fmtPts(shownPts)}</Text>
          <Txt v="label">{live?.mult && live.mult > 1 ? `points, ×${live.mult.toFixed(1)} streak` : 'points'}</Txt>
        </View>
      ) : undefined}
      footer={<Button kind="primary" wide title={data.settings.game && pts ? `Finish workout, ${fmtPts(pts)} points` : 'Finish workout'} onPress={finish} disabled={demo} />}>
      {days.length > 1 ? <Segmented options={days.map((d, i) => ({ label: d.name.replace(/^Nov\/Dec\s+/i, ''), value: i }))} value={di} onChange={i => { setDayIdx(i); setDraft(null); }} /> : null}
      <Row>
        <Txt v="sub">{cur.date === today ? 'Logging for today' : `Logging for ${fmtLong(cur.date)}`}</Txt>
        <Button kind="link" title={editDate ? 'Done' : 'Change date'} onPress={() => setEditDate(e => !e)} />
      </Row>
      {editDate ? <DateField value={cur.date} onCommit={date => setDraft({ ...cur, date })} /> : null}
      {data.settings.game ? (
        <>
          <Section right={zone === 'red' ? 'No bets on red days' : live && live.crits ? `${live.crits} crit${live.crits > 1 ? 's' : ''} so far` : undefined}>Bounties</Section>
          <Bounties list={bounties} />
        </>
      ) : null}
      <Section right={`${day.exercises.length} exercises`}>Workout</Section>
      <Grid>{day.exercises.map((ex, i) => <ExerciseCard key={ex.id} ex={ex} i={i} zone={zone} p={presc[i]} draft={cur} setDraft={setDraft} live={live} slots={read.slot[i] ?? []} betting={betting} />)}</Grid>
      {msg ? <Txt v="body" color={t.stop}>{msg}</Txt> : null}
      <Section>Recent workouts</Section>
      {recent.length ? (
        <List>
          {recent.map(s => {
            const z = ctx.sessionZone(s);
            const byEx = new Map<string, typeof s.sets>();
            s.sets.forEach(x => { if (!byEx.has(x.ex)) byEx.set(x.ex, []); byEx.get(x.ex)!.push(x); });
            const tops = [...byEx.entries()].slice(0, 2).map(([n, sets]) => `${n} ${topStr(sets)}`).join(', ');
            const sc = game.sessions.get(s.id);
            return (
              <View key={s.id} style={{ paddingVertical: 13, paddingHorizontal: 14, gap: 4 }}>
                <Pressable onPress={() => router.push({ pathname: '/results', params: { id: s.id } })} accessibilityRole="button" style={{ gap: 3 }}>
                  <Row gap={8}>
                    <Row gap={8} style={{ justifyContent: 'flex-start', flex: 1 }}>
                      {z ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: zoneColor(t, z).fg }} /> : null}
                      <Txt v="h3">{fmtMid(s.date)}</Txt>
                      <Txt v="sub">{s.day}</Txt>
                    </Row>
                    {data.settings.game && sc ? <Text style={numStyle(18, t.xp)}>{fmtPts(sc.total)}</Text> : null}
                  </Row>
                  <Txt v="fine" numberOfLines={1}>{tops}</Txt>
                </Pressable>
                {demo ? null : confirmDel === s.id
                  ? <Confirm text="Delete this workout and its points?" confirm="Delete" onConfirm={() => { mutate(d => { d.sessions = d.sessions.filter(x => x.id !== s.id); }); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
                  : <Pressable onPress={() => setConfirmDel(s.id)} hitSlop={6} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}><Text style={{ fontFamily: F.med, fontSize: 12.5, color: t.ink3 }}>Delete</Text></Pressable>}
              </View>
            );
          })}
        </List>
      ) : <Txt v="sub">Finished workouts show up here.</Txt>}
      <View style={{ height: StyleSheet.hairlineWidth }} />
    </Screen>
  );
}
