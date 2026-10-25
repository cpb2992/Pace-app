import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fmtShort } from '../engine/dates';
import { zoneOf } from '../engine/training';
import { useTheme, zoneColor } from './theme';

export function RecoveryBars({ days, values }: { days: string[]; values: (number | null)[] }) {
  const t = useTheme();
  const W = 340, H = 150, L = 26, B = 18, T = 8, iw = W - L - 4, ih = H - T - B, bw = iw / days.length;
  return (
    <View style={{ width: '100%', aspectRatio: W / H }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {[34, 67, 100].map(v => {
          const y = T + ih * (1 - v / 100);
          return [
            <Line key={`l${v}`} x1={L} x2={W - 4} y1={y} y2={y} stroke={t.line} strokeWidth={1} strokeDasharray={v < 100 ? '3 3' : undefined} />,
            <SvgText key={`t${v}`} x={L - 5} y={y + 3} fill={t.ink3} fontSize={10} textAnchor="end">{v}</SvgText>,
          ];
        })}
        {values.map((v, i) => {
          const x = L + i * bw + 1, w = Math.max(1, bw - 2);
          if (v == null) return <Rect key={i} x={x} y={T + ih - 2} width={w} height={2} fill={t.line} />;
          const hh = Math.max(2, (ih * v) / 100);
          return <Rect key={i} x={x} y={T + ih - hh} width={w} height={hh} rx={1.5} fill={zoneColor(t, zoneOf(v)).fg} />;
        })}
        <SvgText x={L} y={H - 4} fill={t.ink3} fontSize={10}>{fmtShort(days[0])}</SvgText>
        <SvgText x={W - 4} y={H - 4} fill={t.ink3} fontSize={10} textAnchor="end">Today</SvgText>
      </Svg>
    </View>
  );
}

export function HrvLine({ days, values, base }: { days: string[]; values: (number | null)[]; base: number }) {
  const t = useTheme();
  const pts = values.map((v, i) => (v == null ? null : ([i, v] as const))).filter((p): p is readonly [number, number] => p != null);
  const W = 340, H = 130, L = 30, B = 18, T = 10, iw = W - L - 8, ih = H - T - B;
  const ys = pts.map(p => p[1]).concat([base]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pv = Math.max(2, (hi - lo) * 0.15);
  lo = Math.floor(lo - pv); hi = Math.ceil(hi + pv);
  const X = (i: number) => L + (iw * i) / (days.length - 1);
  const Y = (v: number) => T + ih * (1 - (v - lo) / (hi - lo));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
  const e = pts[pts.length - 1];
  return (
    <View style={{ width: '100%', aspectRatio: W / H }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {[lo, hi].map(v => [
          <Line key={`l${v}`} x1={L} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={t.line} strokeWidth={1} />,
          <SvgText key={`t${v}`} x={L - 5} y={Y(v) + 3} fill={t.ink3} fontSize={10} textAnchor="end">{v}</SvgText>,
        ])}
        <Line x1={L} x2={W - 8} y1={Y(base)} y2={Y(base)} stroke={t.ink3} strokeWidth={1} strokeDasharray="4 3" />
        <Path d={d} stroke={t.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {e ? <Circle cx={X(e[0])} cy={Y(e[1])} r={4} fill={t.accent} stroke={t.surface} strokeWidth={2} /> : null}
        <SvgText x={L} y={H - 4} fill={t.ink3} fontSize={10}>{fmtShort(days[0])}</SvgText>
        <SvgText x={W - 8} y={H - 4} fill={t.ink3} fontSize={10} textAnchor="end">Today</SvgText>
      </Svg>
    </View>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const t = useTheme();
  const W = 96, H = 30, p = 4, mn = Math.min(...values), mx = Math.max(...values), rg = mx - mn || 1;
  const pts = values.map((v, i) => [p + (W - 2 * p) * (values.length === 1 ? 1 : i / (values.length - 1)), H - p - ((H - 2 * p) * (v - mn)) / rg]);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
  const e = pts[pts.length - 1];
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={`${d}L${e[0].toFixed(1)} ${H - p}L${pts[0][0].toFixed(1)} ${H - p}Z`} fill={t.accentSoft} />
      <Path d={d} stroke={t.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={e[0]} cy={e[1]} r={3} fill={t.accent} stroke={t.surface} strokeWidth={2} />
    </Svg>
  );
}

export function MixBar({ hard, steady, easy }: { hard: number; steady: number; easy: number }) {
  const t = useTheme();
  const tot = hard + steady + easy;
  return (
    <View style={{ flex: 1, flexDirection: 'row', height: 12, borderRadius: 4, overflow: 'hidden', backgroundColor: t.fill }}>
      {tot ? <>
        <View style={{ width: `${(100 * hard) / tot}%`, backgroundColor: t.accent }} />
        <View style={{ width: `${(100 * steady) / tot}%`, backgroundColor: t.steady }} />
        <View style={{ width: `${(100 * easy) / tot}%`, backgroundColor: t.easy }} />
      </> : null}
    </View>
  );
}
