import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LOOT, type Crit } from '../engine/game';
import type { LootTier } from '../engine/types';
import { Icon, ShieldArt } from './icons';
import { useTheme, type Theme } from './theme';

export const fmtPts = (n: number, sign = false) => {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−' : sign && n > 0 ? '+' : '') + s;
};

/** Counts up to a number with an ease-out, for the moments points land. */
export function useCountUp(target: number, ms = 1100, run = true) {
  const [shown, setShown] = useState(run ? 0 : target);
  const from = useRef(run ? 0 : target);
  useEffect(() => {
    if (!run) { from.current = target; const id = setTimeout(() => setShown(target), 0); return () => clearTimeout(id); }
    const start = Date.now(), a = from.current;
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (target - a) * e));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, run]);
  return shown;
}

export const tierColor = (t: Theme, tier: LootTier) => (tier === 'legendary' ? t.legendary : tier === 'epic' ? t.epic : tier === 'rare' ? t.rare : t.ink2);
export const critColor = (t: Theme, c: Crit) => (c === 5 ? t.legendary : t.crit);

export function RankBadge({ level, size = 54 }: { level: number; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute' }}><ShieldArt size={size} color={t.xp} fill={t.xpSoft} /></View>
      <Text style={{ color: t.xp, fontWeight: '800', fontSize: size * 0.32, marginTop: -size * 0.04, fontVariant: ['tabular-nums'] }}>{level}</Text>
    </View>
  );
}

export function XpBar({ into, need, height = 8, animate = true }: { into: number; need: number; height?: number; animate?: boolean }) {
  const t = useTheme();
  const pct = need > 0 ? Math.max(0, Math.min(1, into / need)) : 0;
  const [w] = useState(() => new Animated.Value(animate ? 0 : pct));
  useEffect(() => { Animated.timing(w, { toValue: pct, duration: animate ? 900 : 0, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [pct, w, animate]);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.fill, overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', borderRadius: height / 2, backgroundColor: t.xp, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export function CritPill({ crit, small }: { crit: Crit; small?: boolean }) {
  const t = useTheme();
  if (crit === 1) return null;
  const c = critColor(t, crit);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: small ? 6 : 8, paddingVertical: small ? 1 : 3, borderRadius: 999, backgroundColor: crit === 5 ? t.xpSoft : t.critSoft }}>
      <Icon name="bolt" size={small ? 11 : 13} color={c} fill={c} width={1.2} />
      <Text style={{ color: c, fontSize: small ? 11 : 12.5, fontWeight: '800', letterSpacing: 0.3 }}>{crit === 5 ? 'JACKPOT ×5' : `CRIT ×${crit}`}</Text>
    </View>
  );
}

export function TierText({ tier, size = 13 }: { tier: LootTier; size?: number }) {
  const t = useTheme();
  return <Text style={{ color: tierColor(t, tier), fontSize: size, fontWeight: '800', letterSpacing: 1 }}>{LOOT[tier].label.toUpperCase()}</Text>;
}

/** A small gold "+120" for points earned. */
export function PtsText({ n, size = 14, sign = true, color }: { n: number; size?: number; sign?: boolean; color?: string }) {
  const t = useTheme();
  return <Text style={{ color: color ?? (n < 0 ? t.stop : t.xp), fontSize: size, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmtPts(n, sign)}</Text>;
}
