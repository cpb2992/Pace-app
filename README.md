# Pace

A strength-training app that turns WHOOP recovery and a coach's program into daily weight targets, how-to videos, a "coasting" check and an AI coach.

Built with Expo (React Native), so one codebase ships to iPhone and Android.

## What's in the app

- **Today.** Your rank, points and weekly streak; the recovery ring (WHOOP zones: 67+ recovered, 34–66 moderate, under 34 low), synced from WHOOP; today's workout with a weight target for every exercise; today's bounties; and the coasting check (sets ending with 3+ reps left, stalled lifts, green days spent maintaining).
- **Train.** A stamped target, last time and plate math for every exercise, a how-to video, set-by-set logging with "in the tank" (reps you had left), live points on every set (crits, PRs, double-or-nothing bets, bounty progress), and a Finish bar pinned above the tabs.
- **Results.** After each workout: the points breakdown, level progress, a mystery plate to spin, and Too easy / Just right / Too hard / Something hurt feedback that changes your next targets.
- **Coach.** A chat with an AI coach (type or talk) that reads your WHOOP data, every logged set and the coach's program, remembers what matters (injuries, equipment, preferences), and nudges next session's targets when you give feedback. Optional read-aloud.
- **Trends.** Points per week, 30-day recovery and HRV, weekly effort mix, lift trends (estimated max), and strength change by recovery zone.
- **Program.** Blocks of workouts that switch over on their start date. Edit any workout or exercise and attach a YouTube link or your own clip.
- **Settings** (gear on Today). WHOOP live sync, WHOOP export import, the Claude key, coach voice, points on/off, theme, morning reminder, pasting a new block, CSV history import, erasing data.
- **Share with your coach.** "Send to Sarah" on the results screen (and "Send this week" in Settings) opens the share menu with a text summary. The live view gives the coach a private link to a read-only page (`site/coach/`) with workouts, recovery, the coasting check, next workout's targets and the program. It updates on its own; you choose whether HRV/sleep and AI-coach notes are included, can make a new link, or turn it off (which deletes the upload).
- **Foldables and tablets.** On wide screens, screens switch to two columns and update live when you fold or unfold.

### Design

Black iron and chalk, with color borrowed from competition plates: green (10 kg) for recovered and good effort, yellow (15 kg) for moderate days and points, red (25 kg) for low recovery and legendary drops, blue (20 kg) for crits. Chrome stays black and chalk-white so color always means something. Titles and numbers use Big Shoulders Display (condensed, like stamped plates and gym scoreboards); everything you read uses Archivo. Tokens live in `src/ui/theme.ts`, shared components in `src/ui/components.tsx`.

### How points work

Every rep is 10 points; heavier than last time ×1.25. Effort pays by recovery: failure on green days (1 rep left on barbell lifts), 2 left on yellow, 3 left on red; coasting barely scores. Any set can crit ×2, ×3 or hit a ×5 jackpot, with better odds on harder sets. PRs +150, rep records +60, beating last time +40, plus daily bounties (break a stalled lift, fight to failure, honest logging, back off on red days). Up to three double-or-nothing bets per workout (none on red days), a mystery plate after every workout (5 kg white common, 10 kg green rare, 20 kg blue epic, 25 kg red legendary) with better odds for better effort, and weekly streaks that multiply points up to ×1.5. Sleep, check-ins and respecting red days earn points too. The engine is `src/engine/game.ts`; everything except bets and loot is recomputed from the training log.

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

## 2. Turn on the AI coach and WHOOP live sync

Both run straight from the phone. Nothing to deploy.

**AI coach:** make an API key at [platform.claude.com](https://platform.claude.com/settings/keys) and paste it in the Coach tab (or Settings › Coach). It's kept in the phone's secure storage. Each coach message is one Claude API call (Sonnet); reading a pasted program uses Haiku.

**WHOOP:** at [developer.whoop.com](https://developer.whoop.com), create an app with
- redirect URL `pace://whoop`
- privacy policy `https://github.com/cpb2992/Pace-app/blob/main/PRIVACY.md`
- scopes `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`

Paste its Client ID and Secret in Settings › WHOOP and tap Connect. Pace then syncs the last 30 days on launch and whenever it comes back to the front (at most every 45 minutes). Sandbox apps work for up to 10 WHOOP members without review, which covers personal use.

**Before selling:** the WHOOP secret and the user's Claude key live on the phone, which is fine for your own use but not for a store app. The `supabase/` folder holds a backend (coach proxy, WHOOP OAuth with server-side tokens) to switch to: create a Supabase project, `supabase db push`, set `ANTHROPIC_API_KEY`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` and `WHOOP_REDIRECT_URL` as secrets, and deploy the `coach` and `whoop` functions (`--no-verify-jwt` for whoop). Submit the WHOOP app for approval before launch; WHOOP allows 100 requests a minute and 10,000 a day per app.

### Coach live view (already running)

- **Server:** the `pace-share` Edge Function and the `pace_athletes` table, currently in the Supabase project **hats** (Pace shares it to stay on the free plan; tables are prefixed `pace_`). The table has row-level security with no policies, so only the function can touch it; phone keys and coach links are stored as SHA-256 hashes.
- **Page:** `site/` is published to the `gh-pages` branch by `.github/workflows/pages.yml` and served at https://cpb2992.github.io/Pace-app/coach/. If it ever 404s, turn on GitHub Pages: repo Settings › Pages › Deploy from a branch › `gh-pages` / root.
- **Check:** `.github/workflows/coach-check.yml` runs `scripts/check-coach-share.mjs` against the live function and page.
- **Moving Pace to its own Supabase project:** apply `supabase/migrations/20261029000000_pace_coach_share.sql`, deploy `pace-share` with `--no-verify-jwt`, then set `EXPO_PUBLIC_PACE_SHARE_URL` (repo secret for the APK build) and update `API` in `site/coach/index.html`.

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
src/services/       Claude coach, WHOOP sync, secure storage, speech, file pickers, notifications
src/ui/             theme, components, charts, boot screen, video tiles
supabase/           Edge Functions (coach, whoop, pace-share) and database migrations
site/               the coach view page, published to GitHub Pages
scripts/            live checks
assets/             icon, adaptive icon, splash
```
