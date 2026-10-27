import { View } from 'react-native';
import { addDays, fmtShort, weekStart } from '../../engine/dates';
import { bestRaw, topStr } from '../../engine/training';
import { avg, key } from '../../engine/util';
import { useApp } from '../../store/AppStore';
import { Card, Grid, Row, Screen, Txt } from '../../ui/components';
import { fmtPts } from '../../ui/game';
import { HrvLine, MixBar, RecoveryBars, Sparkline } from '../../ui/charts';
import { F, useTheme } from '../../ui/theme';

const Legend = ({ items }: { items: [string, string][] }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
    {items.map(([c, l]) => <Row key={l} gap={6} style={{ justifyContent: 'flex-start' }}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c }} /><Txt v="fine">{l}</Txt></Row>)}
  </View>
);

export default function Trends() {
  const { ctx, data, today, game } = useApp();
  const t = useTheme();
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const recs = days.map(d => data.whoop[d]?.rec ?? null);
  const have = recs.filter((v): v is number => v != null);
  const hrvs = days.map(d => data.whoop[d]?.hrv ?? null);
  const hv = hrvs.filter((v): v is number => v != null);

  const start = weekStart(today);
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(start, -7 * (5 - i))).map(w => {
    const end = addDays(w, 7);
    let hard = 0, steady = 0, easy = 0;
    for (const s of ctx.sessions) if (s.date >= w && s.date < end) for (const x of s.sets) { if (x.rir == null) continue; if (x.rir <= 1) hard++; else if (x.rir === 2) steady++; else easy++; }
    return { w, hard, steady, easy, tot: hard + steady + easy };
  });

  const names = new Map<string, string>();
  ctx.sessions.forEach(s => s.sets.forEach(x => { if (!names.has(key(x.ex))) names.set(key(x.ex), x.ex); }));
  const lifts = [...names.values()].map(n => ({ name: n, h: ctx.hist(n) })).filter(g => g.h.length >= 2)
    .sort((a, b) => b.h[b.h.length - 1].date.localeCompare(a.h[a.h.length - 1].date) || b.h.length - a.h.length).slice(0, 10);

  const pay: Record<'green' | 'yellow' | 'red', number[]> = { green: [], yellow: [], red: [] };
  for (const s of ctx.sessions) {
    const z = ctx.sessionZone(s);
    if (!z) continue;
    const byEx = new Map<string, typeof s.sets>();
    s.sets.forEach(x => { const k = key(x.ex); if (!byEx.has(k)) byEx.set(k, []); byEx.get(k)!.push(x); });
    for (const sets of byEx.values()) {
      const h = ctx.hist(sets[0].ex), i = h.findIndex(e => e.id === s.id);
      if (i > 0) { const a = bestRaw(h[i - 1].sets), b = bestRaw(sets); if (a > 0) pay[z].push(((b - a) / a) * 100); }
    }
  }
  const payN = pay.green.length + pay.yellow.length + pay.red.length;

  // Points per week, last 8 weeks.
  const ptsWeeks = Array.from({ length: 8 }, (_, i) => addDays(start, -7 * (7 - i))).map(w => ({ w, pts: game.weeks.find(x => x.week === w)?.pts ?? 0 }));
  const ptsMax = Math.max(1, ...ptsWeeks.map(w => w.pts));
  const bestWeek = Math.max(0, ...game.weeks.map(w => w.pts));

  return (
    <Screen title="Trends" eyebrow="Your numbers">
      <Grid>
      {data.settings.game ? (
        <Card>
          <Row><Txt v="h2">Points</Txt><Txt v="fine">{`${game.rank} · best week ${fmtPts(bestWeek)}`}</Txt></Row>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
            {ptsWeeks.map((w, i) => (
              <View key={w.w} style={{ flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                {w.pts ? <Txt v="label" style={{ fontSize: 10.5 }}>{w.pts >= 1000 ? `${(w.pts / 1000).toFixed(1)}k` : String(w.pts)}</Txt> : null}
                <View style={{ width: '100%', height: `${Math.max(2, (w.pts / ptsMax) * 78)}%`, borderRadius: 5, backgroundColor: i === ptsWeeks.length - 1 ? t.xp : t.xpSoft, borderWidth: i === ptsWeeks.length - 1 ? 0 : 1, borderColor: t.xp }} />
              </View>
            ))}
          </View>
          <Row><Txt v="label">{fmtShort(ptsWeeks[0].w)}</Txt><Txt v="label">This week</Txt></Row>
        </Card>
      ) : null}
      <Card>
        <Row><Txt v="h2">Recovery</Txt>{have.length ? <Txt v="fine">Avg {Math.round(avg(have)!)}%</Txt> : null}</Row>
        {have.length ? <>
          <RecoveryBars days={days} values={recs} />
          <Legend items={[[t.go, `${have.filter(v => v >= 67).length} recovered`], [t.hold, `${have.filter(v => v >= 34 && v < 67).length} moderate`], [t.stop, `${have.filter(v => v < 34).length} low`]]} />
        </> : <Txt v="fine">Log recovery on Today or import WHOOP data in Settings.</Txt>}
      </Card>
      {hv.length >= 3 ? (
        <Card><Row><Txt v="h2">HRV</Txt><Txt v="fine">Avg {Math.round(avg(hv)!)} ms</Txt></Row><HrvLine days={days} values={hrvs} base={Math.round(avg(hv)!)} /></Card>
      ) : null}
      <Card>
        <Txt v="h2">Effort</Txt>
        {weeks.some(w => w.tot) ? <>
          {weeks.map(w => (
            <Row key={w.w} gap={8}>
              <Txt v="label" style={{ width: 46 }}>{fmtShort(w.w)}</Txt>
              <MixBar hard={w.hard} steady={w.steady} easy={w.easy} />
              <Txt v="fine" style={{ width: 62, textAlign: 'right' }}>{w.tot ? `${Math.round((100 * w.easy) / w.tot)}% easy` : '–'}</Txt>
            </Row>
          ))}
          <Legend items={[[t.accent, '0–1 in the tank'], [t.steady, '2 in the tank'], [t.easy, '3+ in the tank']]} />
        </> : <Txt v="fine">Log reps left on your sets to see how much of your training is real work.</Txt>}
      </Card>
      <Card>
        <Txt v="h2">Lifts</Txt>
        {lifts.length ? lifts.map(g => {
          const series = g.h.slice(-10).map(e => bestRaw(e.sets));
          const last = g.h[g.h.length - 1];
          const loaded = last.sets.some(x => x.w > 0);
          const ch = series[0] ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : 0;
          return (
            <Row key={g.name}>
              <View style={{ flex: 1 }}>
                <Txt v="body" style={{ fontFamily: F.med }}>{g.name}</Txt>
                <Txt v="fine">{topStr(last.sets)}{loaded ? ` · e1RM ${Math.round(series[series.length - 1])}` : ''} · <Txt v="fine" color={Math.abs(ch) < 0.5 ? t.ink2 : ch > 0 ? t.go : t.stop}>{Math.abs(ch) < 0.5 ? 'flat' : `${ch > 0 ? '+' : ''}${ch.toFixed(1)}%`}</Txt></Txt>
              </View>
              <Sparkline values={series} />
            </Row>
          );
        }) : <Txt v="fine">Log an exercise twice to see its trend.</Txt>}
      </Card>
      {payN >= 4 ? (
        <Card>
          <Txt v="h2">Strength change by recovery</Txt>
          <Row gap={8}>
            {(['green', 'yellow', 'red'] as const).map(z => {
              const a = avg(pay[z]);
              return (
                <View key={z} style={{ flex: 1, backgroundColor: t.fill, borderRadius: 10, padding: 10, gap: 2 }}>
                  <Txt v="label">{z === 'green' ? 'Recovered' : z === 'yellow' ? 'Moderate' : 'Low'}</Txt>
                  <Txt v="h2" color={a == null ? undefined : a > 0.5 ? t.go : a < -0.5 ? t.stop : undefined}>{a == null ? '–' : `${a > 0 ? '+' : ''}${a.toFixed(1)}%`}</Txt>
                  <Txt v="label">{pay[z].length} lifts</Txt>
                </View>
              );
            })}
          </Row>
          <Txt v="fine">Average change per lift versus the previous session.</Txt>
        </Card>
      ) : null}
      </Grid>
    </Screen>
  );
}
