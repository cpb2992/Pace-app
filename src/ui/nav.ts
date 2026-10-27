import { router } from 'expo-router';

/** Opens the Coach tab with a message ready to send. */
export const openCoach = (prefill: string) => router.navigate({ pathname: '/coach', params: { prefill, at: String(Date.now()) } });
