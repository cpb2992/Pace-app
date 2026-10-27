#!/usr/bin/env bash
# Called by the smoke workflow inside the running emulator.
#   A: open Pace cold.   B: log a set in Train, finish, open the loot crate.
#   C: the Coach tab, Settings and the WHOOP return link open without crashing.
set -x
mkdir -p smoke
APK=android/app/build/outputs/apk/release/app-release.apk
PKG=com.pacetraining.app
FIND="python3 .github/smoke_find.py"

alive() { adb shell pidof $PKG >/dev/null 2>&1 && echo "RUNNING" || echo "NOT RUNNING"; }
focused() { adb shell dumpsys window | grep -E "mCurrentFocus" | head -1; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > smoke/ui.xml; }
H=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f2); H=${H:-1920}
W=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f1); W=${W:-1080}
open() { adb shell am start -W -a android.intent.action.VIEW -d "$1" $PKG >/dev/null; }

# Scrolls until a node whose text/description matches $1 is on screen (above the tab bar), then taps it.
tap_label() {
  local n=${2:-14}
  for i in $(seq 1 $((n * 2))); do
    dump
    if xy=$($FIND smoke/ui.xml "$1"); then
      y=${xy#* }
      if [ "$y" -gt 20 ] && [ "$y" -lt "${TAP_MAXY:-$((H * 4 / 5))}" ]; then adb shell input tap $xy; echo "tapped '$1' at $xy" >> ${TAP_LOG:-smoke/steps.txt}; return 0; fi
    fi
    if [ "$i" -le "$n" ]; then adb shell input swipe $((W / 2)) $((H * 3 / 5)) $((W / 2)) $((H * 2 / 5)) 600
    else adb shell input swipe $((W / 2)) $((H * 2 / 5)) $((W / 2)) $((H * 3 / 5)) 600; fi
    sleep 1
  done
  echo "could not find '$1'" >> ${TAP_LOG:-smoke/steps.txt}; return 1
}
has() { dump; grep -q "$1" smoke/ui.xml; }
# Hides the keyboard only if it's up, so BACK never leaves the screen.
hide_kb() { adb shell dumpsys input_method | grep -q "mInputShown=true" && adb shell input keyevent KEYCODE_BACK; sleep 1; }

adb root >/dev/null 2>&1; sleep 2
adb shell setprop persist.sys.timezone America/New_York
adb install -r "$APK"
: > smoke/steps.txt

# --- A: cold open
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity
sleep 25
{ echo "alive: $(alive)"; focused; } > smoke/a-launch.txt
adb exec-out screencap -p > smoke/a-today.png
has "How recovered are you\|Push day\|Steady day\|Recovery day" && echo "today shows recovery" >> smoke/steps.txt
adb logcat -d -b crash > smoke/a-crash.txt

# --- B: Train: log a set, finish, open the crate
adb logcat -c
open "pace://train"
sleep 6
tap_label "Set 1 reps" 4 && sleep 1
adb shell input text "9"
sleep 1
# Close the keyboard first, or the tap lands on a keyboard key.
hide_kb
tap_label "^0 reps left\|" 4 && sleep 1
adb exec-out screencap -p > smoke/b-train.png
has "Bounties" && echo "train shows bounties and live points" >> smoke/steps.txt
# Finish lives in the bar pinned above the tabs.
TAP_MAXY=$((H * 9 / 10)) tap_label "Finish workout" 2 && sleep 5
adb exec-out screencap -p > smoke/b-results.png
has "Breakdown" && echo "results screen opened" >> smoke/steps.txt
tap_label "^\|Spin the plate$" 6 && sleep 4
adb exec-out screencap -p > smoke/b-crate.png
has "Added to your points\|rarest plate\|Effort pays" && echo "mystery plate spun" >> smoke/steps.txt
tap_label "^\|Too easy$" 10 && sleep 2
has "Next time" && echo "feedback queued a change" >> smoke/steps.txt
echo "alive after train: $(alive)" >> smoke/steps.txt
adb logcat -d -v time > smoke/b-logcat.txt
adb logcat -d -b crash > smoke/b-crash.txt

# --- C: Coach, Settings, WHOOP return
adb logcat -c
adb shell am force-stop $PKG
open "pace://coach"
sleep 10
adb exec-out screencap -p > smoke/c-coach.png
has "Turn on your coach" && echo "coach setup shows" >> smoke/steps.txt
open "pace://settings"
sleep 5
adb exec-out screencap -p > smoke/c-settings.png
has "Client ID" && echo "settings shows the WHOOP setup" >> smoke/steps.txt
open "pace://whoop?code=test&state=abcd2345"
sleep 5
adb exec-out screencap -p > smoke/c-whoop.png
has "Add your WHOOP app first" && echo "WHOOP return handles a code safely" >> smoke/steps.txt
echo "alive at end: $(alive)" >> smoke/steps.txt
adb logcat -d -v time > smoke/c-logcat.txt
adb logcat -d -b crash > smoke/c-crash.txt
