# Pace

A strength-training app that turns WHOOP recovery and a coach's program into daily weight targets, how-to videos, a "coasting" check and an AI coach.

Built with Expo (React Native), so one codebase ships to iPhone and Android.

## What's in the app

- **Boot screen.** The Pace mark and a progress bar on black, then a fade into the app.
- **Today.** A recovery ring (WHOOP zones: 67+ recovered, 34–66 moderate, under 34 low), today's workout with a weight target for every exercise, and the coach card. The coach calls out coasting when sets end with 3+ reps left, lifts stall, or green days go to maintenance.
- **Train.** Each exercise has its how-to video, the Pace target and plate math, set-by-set logging with "reps left", and history.
- **Program.** Blocks of workouts (October, then Nov/Dec from Nov 5) that switch over on their start date. Edit any workout or exercise and attach a YouTube link or your own clip.
- **Trends.** 30-day recovery and HRV, weekly effort mix, lift trends (estimated max), and strength change by recovery zone.
- **Foldables and tablets.** On a wide screen (an unfolded Galaxy Z Fold, a tablet, or a phone turned sideways) screens switch to two columns, and the layout updates live when you fold or unfold.
- **Settings.** Dark / Light / Auto theme, WHOOP export import, a morning reminder notification, pasting a new block, CSV history import, coach voice (No filter / Clean), and erasing data.

Your coach's program and your close-grip history are preloaded in `src/engine/seed.ts`. Exercises marked "placeholder" still need their real sets and reps.

## 1. Run it on your phone today (free)

You need a computer with [Node.js 20+](https://nodejs.org) installed.

```bash
npm install
npx expo start
```

Install **Expo Go** from the Play Store or App Store, then scan the QR code that appears. The app runs fully on the phone and saves data on the device.

Useful commands:

```bash
npm test             # engine tests (prescriptions, coasting check, parsers)
npm run typecheck    # TypeScript
npx expo lint        # lint
```

### Or install it on an Android phone with no computer

Every push to `main` builds `Pace.apk` with GitHub Actions and posts it on the repo's **Releases** page.

1. On the phone, open the repo's Releases page and tap **Pace.apk** under the newest build.
2. Open the download. If Android asks, allow your browser to install unknown apps.
3. If Play Protect warns about an unknown developer, tap **More details → Install anyway**. On Samsung phones, if Auto Blocker stops the install, turn it off in Settings → Security and privacy → Auto Blocker, install, then turn it back on.
4. To update, install the newest build over the old one. Your data stays on the phone.

This build is signed with a debug key: fine for your own phone, not for the Play Store (that's step 3).

## 2. Turn on the AI coach and WHOOP live sync (backend)

The backend lives in `supabase/`: two Edge Functions and one database migration.

1. Create a project at [supabase.com](https://supabase.com) and install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link and set up the database:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. Add secrets (get a Claude API key at [platform.claude.com](https://platform.claude.com)):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... \
     WHOOP_REDIRECT_URL=https://<your-project-ref>.supabase.co/functions/v1/whoop/callback
   ```
4. Deploy:
   ```bash
   supabase functions deploy coach
   supabase functions deploy whoop --no-verify-jwt
   ```
5. Copy `.env.example` to `.env` and fill in your project URL and anon key. Restart `npx expo start`. For the GitHub-built APK, add the same two values as repository secrets (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) and re-run the build.

**WHOOP developer setup:** at [developer.whoop.com](https://developer.whoop.com), sign in with your WHOOP account and create an app. Add the redirect URL from step 3 and request the scopes `read:recovery read:sleep read:cycles offline`. Submit the app for WHOOP's approval before launch. WHOOP's default limit is 100 requests a minute and 10,000 a day per app.

**AI costs:** each "Ask Pace" question is one Claude API call (Sonnet for coaching, Haiku for reading pasted programs). Price your subscription to cover it.

## 3. Publish to the App Store and Google Play

Builds run in the cloud with EAS, so no Xcode or Android Studio is needed.

1. Change `ios.bundleIdentifier` and `android.package` in `app.json` to IDs you own (for example `com.yourcompany.pace`).
2. Accounts: Apple Developer Program ($99/year) and Google Play Console ($25 one-time). New personal Google accounts must run a closed test with 12 testers for 14 days before going public.
3. Build and submit:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --platform all --profile production
   npx eas-cli@latest submit --platform ios
   npx eas-cli@latest submit --platform android
   ```
4. For a test build to share with friends first: `npx eas-cli@latest build --platform android --profile preview` produces an installable APK.

## Before selling: what's left

| Area | What to do | Where |
| --- | --- | --- |
| Accounts | Add Supabase Auth sign-in (Apple + Google + email). Required by Apple once data syncs. | new screen |
| Cloud sync | Save `AppData` to the `app_data` table (row-level security is already in the migration). | `src/store/AppStore.tsx` |
| Secure WHOOP + coach | Replace the device id with the signed-in user id; enforce daily coach limits with `coach_usage`. | `supabase/functions/*` |
| Payments | Subscriptions through the stores (RevenueCat is the common way with Expo). | — |
| Onboarding | Start new users with an empty program and a "paste your coach's program" step instead of the seeded one. | `src/engine/seed.ts` |
| Default voice | Default new users to the Clean voice. "No filter" uses profanity, which affects the age rating. | `seed.ts` |
| Legal | Privacy policy, store privacy labels for health data, terms, and a trademark check on the name. Coaches' programs belong to them. | — |
| Review | Apple reviews with a demo account and notes; the built-in demo mode helps. | — |

## Project layout

```
src/app/            screens (Expo Router): tabs, workout editor, video sheet, WHOOP return
src/engine/         training logic with no UI: prescriptions, coasting check, parsers, seed data, coach prompt
src/store/          app state and on-device persistence
src/services/       file pickers, notifications, backend calls
src/ui/             theme, components, charts, boot screen, video tiles
supabase/           Edge Functions (coach, whoop) and the database migration
assets/             icon, adaptive icon, splash
```
