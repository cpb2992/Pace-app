import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysBetween, fmtMid } from '../engine/dates';
import { levelFor, lootOdds, rankName, rollLoot } from '../engine/game';
import { describeNudge, feelNudges } from '../engine/prompt';
import type { Feel, Nudge } from '../engine/types';
import { key } from '../engine/util';
import { useApp } from '../store/AppStore';
import { Button, Card, Row, Txt } from '../ui/components';
import { CritPill, fmtPts, PtsText, tierColor, TierText, useCountUp, XpBar } from '../ui/game';
import { CrateArt, Icon } from '../ui/icons';
import { openCoach } from '../ui/nav';
import { useTheme } from '../ui/theme';

const FEELS: { v: Feel; label: string }[] = [
  { v: 'easy', label: 'Too easy' },
  { v: 'right', label: 'Just right' },
  { v: 'hard', label: 'Too hard' },
  { v: 'hurt', label: 'Something hurt' },
];

function Crate({ eligible, loot, quality, pr, onOpen }: { eligible: boolean; loot?: { tier: 'common' | 'rare' | 'epic' | 'legendary'; pts: number }; quality: number; pr: boolean; onOpen: () => void }) {
  const t = useTheme();
  const [shake] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(loot ? 1 : 0));
  const [opening, setOpening] = useState(false);
  const odds = lootOdds(quality, pr);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const open = () => {
    if (opening || loot) return;
    setOpening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      ...[1, -1, 1, -1, 1, -1, 0].map((v, i) => Animated.timing(shake, { toValue: v * (4 + i * 1.5), duration: 90, easing: Easing.linear, useNativeDriver: true })),
    ]).start(() => {
      onOpen();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      pop.setValue(0.3);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    });
  };
  if (!loot && !eligible) return null;
  const color = loot ? tierColor(t, loot.tier) : t.xp;
  return (
    <Card style={{ alignItems: 'center', gap: 10, borderColor: loot ? color : t.line }}>
      <Animated.View style={{ transform: [{ rotate: shake.interpolate({ inputRange: [-20, 20], outputRange: ['-20deg', '20deg'] }) }, { scale: loot ? pop : 1 }] }}>
        <CrateArt size={128} color={color} lid={t.surface} open={!!loot} />
      </Animated.View>
      {loot ? (
        <Animated.View style={{ alignItems: 'center', gap: 2, opacity: pop }}>
          <TierText tier={loot.tier} size={15} />
          <PtsText n={loot.pts} size={30} color={color} />
          <Txt v="fine">{loot.tier === 'legendary' ? 'Jackpot. That’s the rarest drop in Pace.' : loot.tier === 'epic' ? 'Epic drop. Effort pays.' : 'Added to your points.'}</Txt>
        </Animated.View>
      ) : (
        <>
          <Txt v="h2">Your loot crate</Txt>
          <Txt v="fine" style={{ textAlign: 'center' }}>{`Odds: Rare ${pct(odds.rare)} · Epic ${pct(odds.epic)} · Legendary ${pct(odds.legendary)}. Harder sets and PRs raise them.`}</Txt>
          <Button kind="primary" wide title={opening ? 'Opening…' : 'Open crate'} onPress={open} disabled={opening} />
        </>
      )}
    </Card>
  );
}

export default function Results() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { data, game, today, mutate, demo } = useApp();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const session = data.sessions.find(s => s.id === id);
  const score = session ? game.sessions.get(session.id) : undefined;
  const [queued, setQueued] = useState<Nudge[] | null>(null);
  const animate = fresh === '1';
  const shown = useCountUp(score?.total ?? 0, animate ? 1400 : 600, animate || (score?.loot ?? 0) > 0);

  const before = score ? game.total - score.total : 0;
  const lvlBefore = levelFor(Math.max(0, before - (score?.loot ?? 0))).level;
  const lvlNow = game.level;
  const types = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of data.program.blocks) for (const d of b.days) for (const e of d.exercises) m.set(key(e.name), e.type);
    return (n: string) => m.get(key(n));
  }, [data.program]);

  useEffect(() => {
    if (animate && score && (score.prs || score.jackpots || lvlNow > lvlBefore)) {
      const id2 = setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 900);
      return () => clearTimeout(id2);
    }
  }, [animate, score, lvlNow, lvlBefore]);

  if (!session || !score) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: insets.top + 24, gap: 16 }}>
        <Txt v="h2">That workout is gone.</Txt>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const eligible = !demo && session.src === 'app' && !session.loot && daysBetween(session.date, today) <= 1 && score.exercises.length > 0 && data.settings.game;
  const openCrate = () => {
    const loot = rollLoot(score.quality, score.prs > 0);
    mutate(d => { const s = d.sessions.find(x => x.id === session.id); if (s && !s.loot) s.loot = loot; });
  };
  const giveFeel = (f: Feel) => {
    if (demo) return;
    if (f === 'hurt') {
      mutate(d => { const s = d.sessions.find(x => x.id === session.id); if (s) s.feel = f; });
      router.back();
      setTimeout(() => openCoach(`Something hurt during ${session.day}: `), 80);
      return;
    }
    const q = feelNudges(session, f, today, types);
    mutate(d => {
      const s = d.sessions.find(x => x.id === session.id);
      if (s) s.feel = f;
      for (const n of q) d.coach.nudges = d.coach.nudges.filter(x => key(x.ex) !== key(n.ex)).concat(n);
    });
    setQueued(q);
  };

  const lines: { label: string; pts: number; tone?: 'bonus' | 'bad' }[] = [
    { label: 'Reps, weight and effort', pts: score.setPts },
    ...score.exercises.filter(e => e.bonus).map(e => ({ label: `${e.bonus!.label} · ${e.name}`, pts: e.bonus!.pts, tone: 'bonus' as const })),
    ...score.bounties.filter(b => b.met).map(b => ({ label: `Bounty · ${b.bounty.title}`, pts: b.bounty.pts, tone: 'bonus' as const })),
    { label: 'Finished the workout', pts: 100 },
  ];
  const streakBonus = score.earned - (score.setPts + score.bonusPts);
  if (streakBonus) lines.push({ label: `${score.streak}-week streak ×${score.mult.toFixed(1)}`, pts: streakBonus, tone: 'bonus' });
  if (score.bets) lines.push({ label: 'Bets', pts: score.bets, tone: score.bets < 0 ? 'bad' : 'bonus' });
  if (score.loot) lines.push({ label: `Loot crate · ${session.loot?.tier ?? ''}`, pts: score.loot, tone: 'bonus' });
  const crits = score.exercises.flatMap(e => e.sets.map((s, n) => ({ e: e.name, n, s })).filter(x => x.s.crit > 1));
  const feel = session.feel;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 12, maxWidth: 620, width: '100%', alignSelf: 'center' }}>
        <Row>
          <Txt v="sub">{session.day} · {fmtMid(session.date)}</Txt>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={20} color={t.ink2} />
          </Pressable>
        </Row>
        {data.settings.game ? (
          <>
            <View style={{ alignItems: 'center', gap: 2, paddingVertical: 8 }}>
              <Text style={{ color: t.xp, fontSize: 60, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] }}>{fmtPts(shown, true)}</Text>
              <Txt v="sub">points</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                {score.prs ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.xpSoft }}><Icon name="trophy" size={13} color={t.xp} width={2} /><Text style={{ color: t.xp, fontWeight: '700', fontSize: 12.5 }}>{score.prs} PR{score.prs > 1 ? 's' : ''}</Text></View> : null}
                {score.crits ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: score.jackpots ? t.xpSoft : t.critSoft }}><Icon name="bolt" size={13} color={score.jackpots ? t.legendary : t.crit} fill={score.jackpots ? t.legendary : t.crit} width={1.2} /><Text style={{ color: score.jackpots ? t.legendary : t.crit, fontWeight: '700', fontSize: 12.5 }}>{score.jackpots ? `${score.jackpots} jackpot${score.jackpots > 1 ? 's' : ''}` : `${score.crits} crit${score.crits > 1 ? 's' : ''}`}</Text></View> : null}
                {score.bounties.some(b => b.met) ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.goSoft }}><Icon name="target" size={13} color={t.go} width={2} /><Text style={{ color: t.go, fontWeight: '700', fontSize: 12.5 }}>{score.bounties.filter(b => b.met).length} bount{score.bounties.filter(b => b.met).length > 1 ? 'ies' : 'y'}</Text></View> : null}
              </View>
            </View>
            {lvlNow > lvlBefore ? (
              <Card style={{ backgroundColor: t.xpSoft, borderColor: t.xp, alignItems: 'center' }}>
                <Txt v="label" color={t.xp}>LEVEL UP</Txt>
                <Txt v="h2" color={t.xp} style={{ fontSize: 24 }}>{rankName(lvlNow)}</Txt>
              </Card>
            ) : null}
            <Card>
              <Row><Txt v="h3">{game.rank}</Txt><Txt v="fine">{`${fmtPts(game.need - game.into)} to ${game.next}`}</Txt></Row>
              <XpBar into={game.into} need={game.need} animate={animate} />
            </Card>
            <Crate eligible={eligible} loot={session.loot} quality={score.quality} pr={score.prs > 0} onOpen={openCrate} />
            <Card>
              <Txt v="h2">Breakdown</Txt>
              {lines.map(l => (
                <Row key={l.label}>
                  <Txt v="body" style={{ flex: 1 }} color={l.tone === 'bonus' ? t.ink : t.ink2}>{l.label}</Txt>
                  <PtsText n={l.pts} size={14.5} color={l.tone === 'bad' ? t.stop : l.tone === 'bonus' ? t.xp : t.ink} />
                </Row>
              ))}
              <View style={{ height: 1, backgroundColor: t.line }} />
              <Row><Txt v="h3">Total</Txt><PtsText n={score.total} size={17} sign={false} /></Row>
            </Card>
            {crits.length ? (
              <Card>
                <Txt v="h2">Crits</Txt>
                {crits.map(c => (
                  <Row key={`${c.e}${c.n}`}>
                    <View style={{ flex: 1, gap: 2 }}><Txt v="body">{c.e}</Txt><Txt v="fine">Set {c.n + 1}</Txt></View>
                    <CritPill crit={c.s.crit} small />
                    <PtsText n={c.s.pts} size={14} />
                  </Row>
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          <Card><Txt v="h2">Workout saved</Txt><Txt v="fine">{score.exercises.reduce((a, e) => a + e.sets.length, 0)} sets logged.</Txt></Card>
        )}
        <Card>
          <Txt v="h2">How did that feel?</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FEELS.map(f => <Button key={f.v} small kind={feel === f.v ? 'primary' : 'secondary'} title={f.label} onPress={() => giveFeel(f.v)} disabled={demo} />)}
          </View>
          {queued ? (
            queued.length ? (
              <View style={{ gap: 4 }}>
                <Txt v="fine">Pace changed your next targets:</Txt>
                {queued.map(n => <Txt key={n.ex} v="body">{`•  ${describeNudge(n)}`}</Txt>)}
              </View>
            ) : <Txt v="fine">Noted. Pace keeps the plan as is.</Txt>
          ) : <Txt v="fine">Too easy moves your lifts up a step next time. Too hard holds them. Something hurt opens the coach.</Txt>}
          {queued ? <Button kind="link" title="Tell the coach more" onPress={() => { router.back(); setTimeout(() => openCoach(`About ${session.day} today: `), 80); }} /> : null}
        </Card>
        <Button kind="primary" wide title="Done" onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}
