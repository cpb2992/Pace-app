import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysBetween, fmtMid } from '../engine/dates';
import { levelFor, LOOT, lootOdds, rankName, rollLoot } from '../engine/game';
import { describeNudge, feelNudges } from '../engine/prompt';
import type { Feel, LootTier, Nudge } from '../engine/types';
import { key } from '../engine/util';
import { useApp } from '../store/AppStore';
import { Button, Card, List, Row, Section, Txt } from '../ui/components';
import { CritPill, fmtPts, PtsText, tierColor, TierText, useCountUp, XpBar } from '../ui/game';
import { Icon, PlateArt } from '../ui/icons';
import { openCoach } from '../ui/nav';
import { F, numStyle, radius, useTheme } from '../ui/theme';

const FEELS: { v: Feel; label: string }[] = [
  { v: 'easy', label: 'Too easy' },
  { v: 'right', label: 'Just right' },
  { v: 'hard', label: 'Too hard' },
  { v: 'hurt', label: 'Something hurt' },
];

/** After a workout: spin the mystery plate. It lands on a 5, 10, 20 or 25 kg plate; heavier is rarer. */
function MysteryPlate({ eligible, loot, quality, pr, onOpen }: { eligible: boolean; loot?: { tier: LootTier; pts: number }; quality: number; pr: boolean; onOpen: () => void }) {
  const t = useTheme();
  const [spin] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(loot ? 1 : 0));
  const [spinning, setSpinning] = useState(false);
  const odds = lootOdds(quality, pr);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const go = () => {
    if (spinning || loot) return;
    setSpinning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(spin, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      onOpen();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    });
  };
  if (!loot && !eligible) return null;
  const color = loot ? tierColor(t, loot.tier) : t.raised;
  const plateInk = loot ? (loot.tier === 'common' ? '#111113' : '#FFFFFF') : t.ink3;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] });
  return (
    <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 22, borderRadius: radius.panel }}>
      <Animated.View style={{ transform: [{ rotate }, { scale: loot ? pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) : 1 }] }}>
        <PlateArt size={150} color={color} hub={loot ? '#C9CACF' : t.lineStrong} ink={plateInk} label={loot ? String(LOOT[loot.tier].kg) : '?'} unit={loot ? 'KG' : 'SPIN'} />
      </Animated.View>
      {loot ? (
        <Animated.View style={{ alignItems: 'center', gap: 4, opacity: pop }}>
          <TierText tier={loot.tier} size={15} />
          <Text style={numStyle(44, loot.tier === 'common' ? t.xp : color)}>{fmtPts(loot.pts, true)}</Text>
          <Txt v="sub">{loot.tier === 'legendary' ? 'The rarest plate in Pace.' : loot.tier === 'epic' ? 'Effort pays.' : 'Added to your points.'}</Txt>
        </Animated.View>
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Txt v="h2">Mystery plate</Txt>
            <Txt v="sub" style={{ textAlign: 'center' }}>{`10 kg ${pct(odds.rare)}, 20 kg ${pct(odds.epic)}, 25 kg ${pct(odds.legendary)}. Harder sets and PRs load the odds.`}</Txt>
          </View>
          <Button kind="primary" wide title={spinning ? 'Spinning…' : 'Spin the plate'} onPress={go} disabled={spinning} />
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
    ...score.exercises.filter(e => e.bonus).map(e => ({ label: `${e.bonus!.label}, ${e.name}`, pts: e.bonus!.pts, tone: 'bonus' as const })),
    ...score.bounties.filter(b => b.met).map(b => ({ label: b.bounty.title, pts: b.bounty.pts, tone: 'bonus' as const })),
    { label: 'Finished the workout', pts: 100 },
  ];
  const streakBonus = score.earned - (score.setPts + score.bonusPts);
  if (streakBonus) lines.push({ label: `${score.streak}-week streak ×${score.mult.toFixed(1)}`, pts: streakBonus, tone: 'bonus' });
  if (score.bets) lines.push({ label: 'Bets', pts: score.bets, tone: score.bets < 0 ? 'bad' : 'bonus' });
  if (score.loot && session.loot) lines.push({ label: `Mystery plate, ${LOOT[session.loot.tier].kg} kg`, pts: score.loot, tone: 'bonus' });
  const crits = score.exercises.flatMap(e => e.sets.map((s, n) => ({ e: e.name, n, s })).filter(x => x.s.crit > 1));
  const feel = session.feel;

  const pill = (icon: 'trophy' | 'bolt' | 'target', text: string, fg: string, bg: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: bg }}>
      <Icon name={icon} size={14} color={fg} fill={icon === 'bolt' ? fg : 'none'} width={icon === 'bolt' ? 1.2 : 2} />
      <Text style={{ color: fg, fontFamily: F.semi, fontSize: 13 }}>{text}</Text>
    </View>
  );
  const met = score.bounties.filter(b => b.met).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 18, gap: 14, maxWidth: 620, width: '100%', alignSelf: 'center' }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ gap: 2 }}>
            <Txt v="title" style={{ fontSize: 34, lineHeight: 36 }}>{session.day}</Txt>
            <Txt v="sub">{fmtMid(session.date)}</Txt>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={20} color={t.ink} />
          </Pressable>
        </Row>
        {data.settings.game ? (
          <>
            <View style={{ alignItems: 'center', gap: 4, paddingTop: 10, paddingBottom: 6 }}>
              <Text style={numStyle(88, t.xp)}>{fmtPts(shown, true)}</Text>
              <Txt v="sub">points</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                {score.prs ? pill('trophy', `${score.prs} PR${score.prs > 1 ? 's' : ''}`, t.xp, t.xpSoft) : null}
                {score.crits ? (score.jackpots ? pill('bolt', `${score.jackpots} jackpot${score.jackpots > 1 ? 's' : ''}`, t.legendary, t.stopSoft) : pill('bolt', `${score.crits} crit${score.crits > 1 ? 's' : ''}`, t.crit, t.critSoft)) : null}
                {met ? pill('target', `${met} bount${met > 1 ? 'ies' : 'y'}`, t.go, t.goSoft) : null}
              </View>
            </View>
            {lvlNow > lvlBefore ? (
              <View style={{ alignItems: 'center', gap: 2, padding: 16, borderRadius: radius.card, backgroundColor: t.xpSoft }}>
                <Txt v="sub" color={t.xp} style={{ fontFamily: F.semi }}>Level up</Txt>
                <Text style={numStyle(36, t.xp)}>{rankName(lvlNow)}</Text>
              </View>
            ) : null}
            <Card style={{ gap: 10 }}>
              <Row><Txt v="h3">{game.rank}</Txt><Txt v="label">{`${fmtPts(game.need - game.into)} to ${game.next}`}</Txt></Row>
              <XpBar into={game.into} need={game.need} height={6} animate={animate} />
            </Card>
            <MysteryPlate eligible={eligible} loot={session.loot} quality={score.quality} pr={score.prs > 0} onOpen={openCrate} />
            <Section>Breakdown</Section>
            <List>
              {lines.map(l => (
                <Row key={l.label} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
                  <Txt v="body" style={{ flex: 1 }} color={l.tone ? t.ink : t.ink2}>{l.label}</Txt>
                  <PtsText n={l.pts} size={14} color={l.tone === 'bad' ? t.stop : l.tone === 'bonus' ? t.xp : t.ink} />
                </Row>
              ))}
              <Row style={{ paddingVertical: 13, paddingHorizontal: 14 }}><Txt v="h3">Total</Txt><PtsText n={score.total} size={17} sign={false} /></Row>
            </List>
            {crits.length ? (
              <>
                <Section>Crits</Section>
                <List>
                  {crits.map(c => (
                    <Row key={`${c.e}${c.n}`} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
                      <View style={{ flex: 1, gap: 1 }}><Txt v="body" style={{ fontFamily: F.semi }}>{c.e}</Txt><Txt v="fine">{`Set ${c.n + 1}`}</Txt></View>
                      <CritPill crit={c.s.crit} small />
                      <PtsText n={c.s.pts} size={14} />
                    </Row>
                  ))}
                </List>
              </>
            ) : null}
          </>
        ) : (
          <Card><Txt v="h2">Workout saved</Txt><Txt v="sub">{`${score.exercises.reduce((a, e) => a + e.sets.length, 0)} sets logged.`}</Txt></Card>
        )}
        <Section>How did that feel?</Section>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FEELS.map(f => <Button key={f.v} small kind={feel === f.v ? 'primary' : 'secondary'} title={f.label} onPress={() => giveFeel(f.v)} disabled={demo} />)}
          </View>
          {queued ? (
            queued.length ? (
              <View style={{ gap: 6 }}>
                <Txt v="sub">Next time:</Txt>
                {queued.map(n => <Txt key={n.ex} v="body" style={{ fontFamily: F.med }}>{describeNudge(n)}</Txt>)}
              </View>
            ) : <Txt v="sub">Noted. The plan stays as it is.</Txt>
          ) : <Txt v="sub">Too easy moves your lifts up a step next time. Too hard holds them. Something hurt opens the coach.</Txt>}
          {queued ? <Button kind="link" title="Tell the coach more" onPress={() => { router.back(); setTimeout(() => openCoach(`About ${session.day} today: `), 80); }} /> : null}
        </Card>
        <Button kind="primary" wide title="Done" onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}
