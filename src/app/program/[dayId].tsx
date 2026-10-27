import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DOW } from '../../engine/dates';
import { TYPE_LABEL, TYPES } from '../../engine/parse';
import { isFree } from '../../engine/training';
import type { Exercise, ExerciseType, WorkoutDay } from '../../engine/types';
import { key, letter, uid } from '../../engine/util';
import { useApp } from '../../store/AppStore';
import { Badge, Button, Card, CommitField, Confirm, Row, Screen, Txt } from '../../ui/components';
import { F, useTheme } from '../../ui/theme';
import { VideoTile } from '../../ui/VideoTile';

function Pills<T extends string | number | null>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.surface }}>
            <Text style={{ color: on ? t.accent : t.ink, fontSize: 13.5, fontFamily: on ? F.semi : F.med }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function DayEditor() {
  const { dayId, blockId } = useLocalSearchParams<{ dayId: string; blockId: string }>();
  const { data, ctx, mutate, today } = useApp();
  const [confirm, setConfirm] = useState<string | null>(null);
  const block = data.program.blocks.find(b => b.id === blockId);
  const day = block?.days.find(d => d.id === dayId);
  if (!block || !day) return <Screen title="Workout"><Txt v="fine">This workout no longer exists.</Txt></Screen>;

  const editDay = (fn: (d: WorkoutDay) => void) => mutate(d => {
    const dd = d.program.blocks.find(b => b.id === blockId)?.days.find(x => x.id === dayId);
    if (dd) { fn(dd); d.program.source = 'coach'; d.program.updated = today; }
  });
  const editEx = (id: string, fn: (e: Exercise) => void) => editDay(d => { const e = d.exercises.find(x => x.id === id); if (e) fn(e); });
  const intField = (ex: Exercise, field: 'sets' | 'repLow' | 'repHigh', text: string) => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || n < (field === 'sets' ? 1 : 0)) return;
    editEx(ex.id, e => { e[field] = Math.min(field === 'sets' ? 12 : 100, n); if (e.repHigh < e.repLow) e.repHigh = e.repLow; e.rxSet = true; });
  };

  return (
    <Screen title={day.name} eyebrow={block.name}>
      <Card>
        <CommitField label="Name" value={day.name} onCommit={raw => { const v = raw.trim(); if (v) editDay(d => { d.name = v.slice(0, 40); }); }} />
        <Txt v="label">Usual day</Txt>
        <Pills options={[{ label: 'Any', value: null }, ...DOW.map((d, i) => ({ label: d, value: i }))]} value={day.dow} onChange={v => editDay(d => { d.dow = v; })} />
      </Card>
      {day.exercises.map((ex, j) => (
        <Card key={ex.id}>
          <Row gap={10}>
            <Badge letter={letter(j)} large />
            <CommitField label="Exercise" value={ex.name} onCommit={raw => { const v = raw.trim();
              if (!v || v === ex.name) return;
              mutate(d => {
                const oldK = key(ex.name), newK = key(v);
                if (d.videos[oldK] && !d.videos[newK]) d.videos[newK] = d.videos[oldK];
                const dd = d.program.blocks.find(b => b.id === blockId)?.days.find(x => x.id === dayId);
                const e2 = dd?.exercises.find(x => x.id === ex.id);
                if (e2) e2.name = v.slice(0, 80);
              });
            }} />
            <View style={{ flexDirection: 'row', gap: 4, alignSelf: 'flex-end' }}>
              <Button small title="↑" disabled={j === 0} onPress={() => editDay(d => { const [x] = d.exercises.splice(j, 1); d.exercises.splice(j - 1, 0, x); })} />
              <Button small title="↓" disabled={j === day.exercises.length - 1} onPress={() => editDay(d => { const [x] = d.exercises.splice(j, 1); d.exercises.splice(j + 1, 0, x); })} />
            </View>
          </Row>
          <VideoTile name={ex.name} video={ctx.video(ex.name)} canEdit />
          {ctx.video(ex.name) ? <Button kind="link" title="Change video" onPress={() => router.push({ pathname: '/video', params: { name: ex.name } })} /> : null}
          {isFree(ex.type) ? null : (
            <>
              <Row gap={8}>
                <CommitField label="Sets" value={String(ex.sets)} keyboardType="number-pad" onCommit={v => intField(ex, 'sets', v)} />
                <CommitField label="Reps min" value={String(ex.repLow)} keyboardType="number-pad" onCommit={v => intField(ex, 'repLow', v)} />
                <CommitField label="Reps max" value={String(ex.repHigh)} keyboardType="number-pad" onCommit={v => intField(ex, 'repHigh', v)} />
              </Row>
              {ex.rxSet ? null : <Txt v="fine">Placeholder. Match this to the coach app.</Txt>}
            </>
          )}
          <Txt v="label">Equipment</Txt>
          <Pills options={TYPES.map(tp => ({ label: TYPE_LABEL[tp], value: tp }))} value={ex.type} onChange={(v: ExerciseType) => editEx(ex.id, e => { e.type = v; })} />
          <CommitField label={isFree(ex.type) ? 'Details' : 'Cue'} value={ex.note} placeholder={isFree(ex.type) ? '15–20 min' : 'Elbows at 45°'} onCommit={raw => { const v = raw.trim(); editEx(ex.id, x => { x.note = v.slice(0, 80); }); }} />
          {confirm === ex.id
            ? <Confirm text={`Remove ${ex.name}? Its history stays.`} confirm="Remove" onConfirm={() => { editDay(d => { d.exercises = d.exercises.filter(x => x.id !== ex.id); }); setConfirm(null); }} onCancel={() => setConfirm(null)} />
            : <Button kind="dangerLink" title="Remove exercise" onPress={() => setConfirm(ex.id)} />}
        </Card>
      ))}
      <Button kind="primary" wide title="Add exercise" onPress={() => editDay(d => { d.exercises.push({ id: uid(), name: 'New exercise', sets: 3, repLow: 10, repHigh: 12, type: 'machine', note: '', rxSet: true }); })} />
      {confirm === 'day'
        ? <Confirm text={`Delete ${day.name}? Logged sessions stay.`} confirm="Delete workout" onConfirm={() => { mutate(d => { const b = d.program.blocks.find(x => x.id === blockId); if (b) b.days = b.days.filter(x => x.id !== dayId); }); router.back(); }} onCancel={() => setConfirm(null)} />
        : <Button kind="dangerLink" title="Delete workout" onPress={() => setConfirm('day')} />}
    </Screen>
  );
}
