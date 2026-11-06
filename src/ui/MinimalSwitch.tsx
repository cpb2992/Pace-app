import { View } from 'react-native';
import { MINIMAL_KIT, swapCount } from '../engine/minimal';
import type { WorkoutDay } from '../engine/types';
import { useApp } from '../store/AppStore';
import { Card, Row, Toggle, Txt } from './components';

/** Can't make the gym? Swap today's workout to dumbbells and bodyweight. Turns itself off tomorrow. */
export function MinimalSwitch({ day }: { day: WorkoutDay | undefined }) {
  const { minimal, setMinimal, setDraft } = useApp();
  const n = day && minimal ? swapCount(day) : 0;
  return (
    <Card>
      <Row>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">Minimal equipment</Txt>
          <Txt v="sub">
            {minimal
              ? `${MINIMAL_KIT}. ${n ? `${n} swap${n === 1 ? '' : 's'}, same sets and reps.` : 'Nothing to swap today.'}`
              : 'Not making the gym? Swap today’s workout to dumbbells and bodyweight.'}
          </Txt>
        </View>
        <Toggle
          value={minimal}
          label="Minimal equipment"
          onValueChange={on => { setMinimal(on); setDraft(null); }}
        />
      </Row>
    </Card>
  );
}
