import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseYouTube, ytLink, ytSearch } from '../engine/parse';
import { key } from '../engine/util';
import { deleteClip, pickClip } from '../services/files';
import { useApp } from '../store/AppStore';
import { Button, Field, Row, Txt } from '../ui/components';
import { useTheme } from '../ui/theme';

/** Sheet for adding a how-to video to an exercise. Videos are keyed by exercise name, so they show everywhere it appears. */
export default function VideoSheet() {
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const { data, mutate } = useApp();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const k = key(name);
  const current = data.videos[k];
  const [url, setUrl] = useState(current?.kind === 'yt' ? ytLink(current) : '');
  const [msg, setMsg] = useState('');

  const cleanupOld = () => { if (current?.kind === 'clip') deleteClip(current.uri); };
  const saveLink = () => {
    const v = parseYouTube(url);
    if (!v) { setMsg("That isn't a YouTube link. In YouTube tap Share, then Copy link."); return; }
    cleanupOld();
    mutate(d => { d.videos[k] = v; });
    router.back();
  };
  const addClip = async () => {
    setMsg('');
    try {
      const res = await pickClip();
      if (!res) return;
      if ('error' in res) { setMsg(res.error); return; }
      cleanupOld();
      mutate(d => { d.videos[k] = { kind: 'clip', uri: res.uri }; });
      router.back();
    } catch { setMsg("That clip couldn't be added. Try a shorter one."); }
  };
  const remove = () => { cleanupOld(); mutate(d => { delete d.videos[k]; }); router.back(); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.surface }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.line, alignSelf: 'center', marginBottom: 4 }} />
      <View><Txt v="label">How-to video</Txt><Txt v="h2" style={{ fontSize: 20 }}>{name}</Txt></View>
      <Field label="YouTube link" value={url} onChangeText={setUrl} placeholder="youtube.com/shorts/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" onSubmitEditing={saveLink} />
      <Row gap={8} style={{ justifyContent: 'flex-start' }}>
        <Button kind="primary" title="Save link" onPress={saveLink} />
        <Button title="Search YouTube" onPress={() => Linking.openURL(ytSearch(name))} />
      </Row>
      <Txt v="fine">Opens in the YouTube app when you tap it.</Txt>
      {Platform.OS !== 'web' ? (
        <>
          <Row gap={10}><View style={{ flex: 1, height: 1, backgroundColor: t.line }} /><Txt v="label">or</Txt><View style={{ flex: 1, height: 1, backgroundColor: t.line }} /></Row>
          <Button title="Choose a clip from your phone" onPress={addClip} />
          <Txt v="fine">Plays right inside Pace. Keep it around 30 seconds.</Txt>
        </>
      ) : null}
      {msg ? <Txt v="body" style={{ fontWeight: '500' }}>{msg}</Txt> : null}
      <Row>
        {current ? <Button kind="dangerLink" title="Remove video" onPress={remove} /> : <View />}
        <Button title="Done" onPress={() => router.back()} />
      </Row>
    </ScrollView>
  );
}
