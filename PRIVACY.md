# Pace privacy policy

*Last updated October 29, 2026*

Pace is a personal strength-training app. This page explains what it does with your data.

## What Pace stores, and where

- **Your training data stays on your phone.** Workouts, sets, recovery numbers, coach chats, points and settings are saved in the app's storage on your device. Pace has no account system, and nothing leaves the phone unless you turn on the live view for your coach (below).
- **Keys and sign-ins live in secure storage.** Your Claude API key, your WHOOP app credentials and your WHOOP sign-in tokens are kept in the phone's secure storage (Android Keystore / iOS Keychain), separate from the rest of the app's data.

## WHOOP

If you connect WHOOP, Pace asks for read-only access to your recovery, sleep, cycles (day strain) and workouts. It uses that data only to show your recovery, adjust your training targets, power the coach, and award points. Pace never writes to your WHOOP account, and it never sells or shares your WHOOP data. You can disconnect in Pace's Settings at any time, or revoke access from your WHOOP account.

## The AI coach

The coach is optional. When you send it a message, Pace sends that message along with the training context the coach needs (recent recovery, workouts, your program and the notes you asked it to remember) to Anthropic's Claude API, using your own API key. Anthropic handles that data under its own terms and privacy policy. Nothing goes to Claude unless you use the coach or the program reader.

## Sharing with your coach

Sharing is off until you turn it on.

- **Send to coach** opens your phone's share menu with a text summary of a workout or your week. You pick who gets it; Pace sends nothing itself.
- **Live view** (Settings → Share with your coach) uploads a read-only summary to Pace's server (Supabase) and gives you a private link for your coach. The summary has your recent workouts (exercises, weights, reps, reps left, how it felt), recovery %, the coasting check, your next workout's targets and your program. HRV, sleep, resting heart rate and strain are included only while "Recovery details" is on, and notes you gave the AI coach only while "AI coach notes" is on. Pace uploads a new summary when your data changes and records when the link was last opened.
- Anyone with the link can see the summary, so share it only with your coach. **New link** stops the old one from working. **Turn off** deletes everything Pace uploaded. The server stores the link and your phone's key only as one-way hashes.

## What Pace doesn't do

No ads, no tracking or analytics, no selling of data, and no sharing with third parties beyond the WHOOP, Claude and coach sharing you choose to turn on.

## Deleting your data

Settings → Erase all data deletes everything Pace stores on the phone and turns off the live view, which deletes what was uploaded. Uninstalling the app removes the data on the phone; turn off the live view first to delete the uploaded copy.

## Contact

Questions: open an issue at github.com/cpb2992/Pace-app.
