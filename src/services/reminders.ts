import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const remindersSupported = Platform.OS !== 'web';

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Schedules (or clears) the daily "log your recovery" reminder. Returns false if permission was refused. */
export async function setMorningReminder(on: boolean, hour: number, minute: number): Promise<boolean> {
  if (!remindersSupported) return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!on) return true;
  if (Platform.OS === 'android') {
    // eslint-disable-next-line import/namespace -- AndroidImportance is re-exported from the package index
    await Notifications.setNotificationChannelAsync('default', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: false, allowBadge: false } })).granted;
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Check in with Pace', body: "Log today's recovery to get your training call." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'default' },
  });
  return true;
}
