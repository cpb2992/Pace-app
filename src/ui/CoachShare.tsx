import { useState } from 'react';
import { View } from 'react-native';
import { ago } from '../engine/dates';
import { useApp } from '../store/AppStore';
import { useShare } from '../store/ShareStore';
import { Button, Card, CommitField, Confirm, Row, Toggle, Txt } from './components';
import { F, useTheme } from './theme';

/** Settings card: the coach's live view (private link) and sending a week as a message. */
export function CoachShareCard() {
  const { data, mutate, demo } = useApp();
  const sh = useShare();
  const t = useTheme();
  const [confirmOff, setConfirmOff] = useState(false);
  const s = data.settings.share;
  const coach = data.settings.coach || 'your coach';
  const on = !!sh.link;
  const status = on
    ? `${sh.uploaded ? `Updated ${ago(sh.uploaded)}. ` : ''}${sh.viewed ? `${coach} last opened it ${ago(sh.viewed)}.` : `${coach} hasn't opened it yet.`}`
    : '';

  return (
    <Card>
      <Row>
        <Txt v="h2" style={{ flex: 1 }}>{`Live view for ${coach}`}</Txt>
        {on ? <Txt v="label" color={t.go}>Live</Txt> : null}
      </Row>
      <Txt v="fine">{on
        ? `${coach} sees your workouts, recovery and the coasting check on a private page that updates on its own. ${status}`
        : `Give ${coach} a private link to a read-only page with your workouts, recovery and the coasting check. It updates on its own, and ${coach} doesn't need an account or the app.`}</Txt>
      <CommitField label="Your name" value={s.name} placeholder={`So ${coach} knows it's you`} autoCapitalize="words" onCommit={v => mutate(d => { d.settings.share.name = v.trim().slice(0, 40); })} />
      <Row>
        <View style={{ flex: 1, gap: 2 }}><Txt v="h3">Recovery details</Txt><Txt v="fine">HRV, sleep, resting heart rate and strain. Recovery % is always shared.</Txt></View>
        <Toggle value={s.recovery} onValueChange={v => mutate(d => { d.settings.share.recovery = v; })} disabled={demo} label="Share recovery details" />
      </Row>
      <Row>
        <View style={{ flex: 1, gap: 2 }}><Txt v="h3">AI coach notes</Txt><Txt v="fine">What you told the AI coach to remember, like injuries.</Txt></View>
        <Toggle value={s.notes} onValueChange={v => mutate(d => { d.settings.share.notes = v; })} disabled={demo} label="Share AI coach notes" />
      </Row>
      {on ? (
        <>
          <Button kind="primary" wide title={`Send link to ${coach}`} onPress={sh.sendLink} disabled={sh.busy} />
          {confirmOff ? (
            <Confirm text={`Turn off the live view? ${coach}'s link stops working and Pace deletes everything it uploaded.`} confirm="Turn off" onConfirm={() => { setConfirmOff(false); sh.turnOff(); }} onCancel={() => setConfirmOff(false)} />
          ) : (
            <Row gap={18} style={{ justifyContent: 'flex-start' }}>
              <Button kind="link" title="New link" onPress={sh.rotate} disabled={sh.busy} />
              <Button kind="dangerLink" title="Turn off" onPress={() => setConfirmOff(true)} disabled={sh.busy} />
            </Row>
          )}
          <Txt v="fine">A new link stops the old one from working.</Txt>
        </>
      ) : (
        <Button kind="primary" wide title={sh.busy ? 'Turning on…' : 'Turn on live view'} onPress={sh.turnOn} disabled={sh.busy || demo || !sh.ready} />
      )}
      {sh.msg ? <Txt v="body" style={{ fontFamily: F.med }}>{sh.msg}</Txt> : null}
      <Button title="Send this week as a message" onPress={sh.sendWeek} />
    </Card>
  );
}
