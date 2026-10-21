import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { addDays, DOWL, fmtLong } from '../../engine/dates';
import { rxText } from '../../engine/training';
import { clone, letter, uid } from '../../engine/util';
import type { Block } from '../../engine/types';
import { useApp } from '../../store/AppStore';
import { Badge, Button, Card, CommitField, Confirm, Row, Screen, Section, Segmented, Txt } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export default function ProgramScreen() {
  const { ctx, data, demo, mutate, today } = useApp();
  const t = useTheme();
  const blocks = data.program.blocks;
  const active = ctx.activeBlock();
  const [selId, setSelId] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const sel = blocks.find(b => b.id === selId) ?? active ?? blocks[0];
  if (!sel) return <Screen title="Program"><Card><Txt v="fine">No program yet. Paste one in Settings.</Txt></Card></Screen>;
  const status = sel.id === active?.id ? 'Current block' : sel.start && sel.start > today ? `Starts ${fmtLong(sel.start)}` : 'Past block';
  const coach = data.settings.coach || 'Sarah';

  const edit = (fn: (b: Block) => void) => mutate(d => { const b = d.program.blocks.find(x => x.id === sel.id); if (b) { fn(b); d.program.source = 'coach'; d.program.updated = today; } });

  return (
    <Screen title="Program" eyebrow={data.program.source === 'starter' ? 'Starter template' : `By ${coach}`}>
      {blocks.length > 1 ? <Segmented options={blocks.map(b => ({ label: b.name, value: b.id }))} value={sel.id} onChange={id => { setSelId(id); setConfirmBlock(false); }} /> : null}
      <Section>{status}</Section>
      {sel.days.map(d => (
        <Card key={d.id} onPress={demo ? undefined : () => router.push({ pathname: '/program/[dayId]', params: { dayId: d.id, blockId: sel.id } })}>
          <Row>
            <View><Txt v="label">{d.dow != null ? `${DOWL[d.dow]}s` : 'Any day'}</Txt><Txt v="h2">{d.name}</Txt></View>
            {demo ? null : <Txt v="body" color={t.accent} style={{ fontWeight: '500' }}>Edit</Txt>}
          </Row>
          <View style={{ gap: 10 }}>
            {d.exercises.map((ex, j) => (
              <Row key={ex.id} gap={12} style={{ justifyContent: 'flex-start' }}>
                <Badge letter={letter(j)} />
                <View style={{ flex: 1 }}><Txt v="body" style={{ fontWeight: '500' }}>{ex.name}</Txt><Txt v="sub">{rxText(ex)}</Txt></View>
                {ctx.video(ex.name) ? <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M8 5v14l11-7z" fill={t.ink3} /></Svg> : null}
              </Row>
            ))}
          </View>
        </Card>
      ))}
      {demo ? <Txt v="fine">Exit demo to edit your program.</Txt> : (
        <Card>
          <Txt v="h2">Block settings</Txt>
          <Row gap={10}>
            <CommitField label="Name" value={sel.name} onCommit={raw => { const v = raw.trim(); if (v) edit(b => { b.name = v.slice(0, 40); }); }} />
            <CommitField label="Starts (YYYY-MM-DD)" value={sel.start ?? ''} placeholder="Any time" autoCapitalize="none"
              onCommit={raw => { const v = raw.trim(); edit(b => { b.start = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }); }} />
          </Row>
          <Row gap={8} style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <Button small title="Add workout" onPress={() => { const id = uid(); edit(b => { b.days.push({ id, name: 'New workout', dow: null, exercises: [] }); }); router.push({ pathname: '/program/[dayId]', params: { dayId: id, blockId: sel.id } }); }} />
            <Button small title="New block" onPress={() => {
              const id = uid();
              mutate(d => {
                const last = d.program.blocks[d.program.blocks.length - 1];
                d.program.blocks.push({ id, name: 'Next block', start: addDays(today, 7), days: last ? clone(last.days).map(x => ({ ...x, id: uid(), exercises: x.exercises.map(e => ({ ...e, id: uid() })) })) : [] });
              });
              setSelId(id);
            }} />
          </Row>
          {blocks.length > 1 ? (confirmBlock
            ? <Confirm text={`Delete ${sel.name}? Logged sessions and videos stay.`} confirm="Delete block" onConfirm={() => { mutate(d => { d.program.blocks = d.program.blocks.filter(b => b.id !== sel.id); }); setSelId(null); setConfirmBlock(false); }} onCancel={() => setConfirmBlock(false)} />
            : <Button kind="dangerLink" title="Delete block" onPress={() => setConfirmBlock(true)} />) : null}
        </Card>
      )}
    </Screen>
  );
}
