import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import JSZip from 'jszip';
import { Platform } from 'react-native';
import { parseHistoryCSV, parseWhoopCycles } from '../engine/parse';
import type { Session, WhoopDay } from '../engine/types';
import { uid } from '../engine/util';

type Asset = DocumentPicker.DocumentPickerAsset & { file?: Blob };

async function readText(a: Asset) {
  if (Platform.OS === 'web' && a.file) return await a.file.text();
  return await new File(a.uri).text();
}
async function readZip(a: Asset) {
  if (Platform.OS === 'web' && a.file) return await JSZip.loadAsync(await a.file.arrayBuffer());
  return await JSZip.loadAsync(await new File(a.uri).base64(), { base64: true });
}

/** Pick WHOOP's export (.zip or physiological_cycles.csv) and return recovery by date. */
export async function pickWhoopExport(): Promise<{ days: Record<string, WhoopDay>; count: number } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return null;
  let texts: { name: string; text: string }[] = [];
  for (const a of res.assets as Asset[]) {
    if (/\.zip$/i.test(a.name) || /zip/.test(a.mimeType ?? '')) {
      const zip = await readZip(a);
      for (const entry of Object.values(zip.files)) if (!entry.dir && /\.csv$/i.test(entry.name)) texts.push({ name: entry.name, text: await entry.async('string') });
    } else texts.push({ name: a.name, text: await readText(a) });
  }
  if (texts.some(t => /physiological_cycles/i.test(t.name))) texts = texts.filter(t => /physiological_cycles/i.test(t.name));
  const days: Record<string, WhoopDay> = {};
  for (const t of texts) Object.assign(days, parseWhoopCycles(t.text));
  return { days, count: Object.keys(days).length };
}

export async function pickHistoryCSV(): Promise<Session[] | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled) return null;
  return parseHistoryCSV(await readText(res.assets[0] as Asset));
}

/** Pick a short how-to clip from the photo library and keep a copy in the app's documents folder. */
export async function pickClip(): Promise<{ uri: string } | { error: string } | null> {
  if (Platform.OS === 'web') return { error: 'Clip uploads work in the phone app.' };
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'Allow photo library access in Settings to add a clip.' };
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 120 });
  if (res.canceled) return null;
  const asset = res.assets[0];
  const ext = /\.(\w+)$/.exec(asset.uri)?.[1] ?? 'mp4';
  const dest = new File(Paths.document, `clip-${uid()}.${ext}`);
  await new File(asset.uri).copy(dest);
  return { uri: dest.uri };
}

export function deleteClip(uri: string) {
  if (Platform.OS === 'web') return;
  try { new File(uri).delete(); } catch { /* already gone */ }
}
