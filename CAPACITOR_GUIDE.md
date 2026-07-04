# IronLog — Capacitor & Gradle integration guide

IronLog is a single self-contained file: `index.html` (also copied into `www/index.html`,
which is the folder Capacitor treats as your web app). Everything — HTML, CSS, JS, data
models, calculation engines — lives in that one file. No build step, no bundler, no
external network calls. Capacitor's only job is to wrap it in a native Android shell and
generate the Gradle project for you, since Android apps are Gradle projects under the hood
whether you write Kotlin or not.

## 1. Prerequisites

- Node.js + npm installed
- Android Studio installed (this gives you the Android SDK + Gradle automatically —
  you don't need to install Gradle separately, Android Studio bundles a compatible version
  and the generated project uses the Gradle Wrapper, `gradlew`, so version mismatches aren't
  a concern)

## 2. One-time project setup

From the `gymtrainer/` folder (containing `index.html`, `www/`, `package.json`,
`capacitor.config.json`):

```bash
npm install
npx cap add android
```

`cap add android` is the step that actually **generates the Gradle project** — it creates
an `android/` folder containing:
- `android/app/build.gradle` — the module-level Gradle file (this is where you'd add native
  Android dependencies if you ever needed any — you won't for v1)
- `android/build.gradle` — project-level Gradle file
- `android/app/src/main/AndroidManifest.xml` — the real manifest (Capacitor generates and
  maintains this; see section 4 below for what's in it and why)
- `android/app/src/main/assets/public/` — this is where your `www/index.html` gets copied
  during sync

You will likely never need to hand-edit `build.gradle` for this app — Capacitor's Android
plugin wires up the WebView, the `MainActivity.java` (an auto-generated stub, not something
you write), and asset packaging automatically.

## 3. Keeping the web app and the Android project in sync

Every time you edit `index.html`:

```bash
cp index.html www/index.html   # keep www/ mirrored to the godfile
npx cap sync android           # copies www/ into the Android project + updates native deps
```

`npm run sync` does the same two-step for you if you'd rather not remember the flags.

## 4. AndroidManifest.xml — what Capacitor sets up and why

Capacitor auto-generates the manifest, but here's what's in it and why, so you're not flying
blind:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```
Required even for a fully offline app — the WebView component itself needs this permission
to initialize, even though IronLog makes zero network calls.

```xml
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
```
Only needed if you add the `@capacitor/filesystem` plugin to write the weekly `.txt` report
directly to the device's Downloads folder instead of relying on the browser-style download
link in `index.html` (which already works fine inside the Capacitor WebView without any extra
permissions — this is just a nicer-UX upgrade path, not a requirement).

```xml
<application android:allowBackup="true" android:usesCleartextTraffic="false" ...>
```
`usesCleartextTraffic="false"` is intentional and should stay — IronLog never talks to the
network, so there's no reason to weaken this.

You generally will not need to hand-edit the manifest for v1. If you later add the
Filesystem plugin (see section 6), `npx cap sync` adds the necessary permission lines for
you automatically — you still shouldn't need to touch the file by hand.

## 5. Building and running

**Fastest path — open in Android Studio and hit Run:**
```bash
npx cap open android
```
This opens the generated `android/` project in Android Studio. Press the green Run button,
pick an emulator or a plugged-in device. Android Studio handles the Gradle build for you.

**Command-line APK build (no Android Studio UI needed):**
```bash
cd android
./gradlew assembleDebug
```
Output APK lands at `android/app/build/outputs/apk/debug/app-debug.apk` — install it on a
device with `adb install app-debug.apk`, or transfer it manually.

For a signed release build, use `./gradlew assembleRelease` after configuring a signing key
in `android/app/build.gradle` (standard Android release-signing steps — Capacitor doesn't
change this part).

## 6. Optional upgrade: write the weekly report straight to a real file

Right now `exportWeeklyReport()` in `index.html` uses a browser-style Blob download, which
works inside the Capacitor WebView but lands wherever the WebView's default download handler
puts it. If you want the `.txt` file written to a predictable, user-visible folder (e.g.
`Documents/IronLog/`), swap in the `@capacitor/filesystem` plugin:

```bash
npm install @capacitor/filesystem
npx cap sync android
```

Then in `index.html`, replace the Blob-download portion of `exportWeeklyReport()` with:
```js
import { Filesystem, Directory } from '@capacitor/filesystem';
await Filesystem.writeFile({
  path: `IronLog/ironlog_weekly_${new Date().toISOString().slice(0,10)}.txt`,
  data: generateWeeklyReport(),
  directory: Directory.Documents,
  encoding: 'utf8'
});
```
This is a genuinely optional v1.5 step — the current implementation already produces a
working, downloadable `.txt` file with zero extra native dependencies.

## 7. Why this approach over native Kotlin

Everything — onboarding, the progression engine, the recovery engine, the weekly report
generator — is plain, portable JavaScript in `index.html`. Capacitor's entire job is the thin
native shell (WebView + Gradle project + manifest) around it. That means:
- No Gradle/KAPT annotation-processing complexity
- The whole app is testable in any desktop browser before you ever touch Android Studio
- One file stays the actual source of truth — you never have logic duplicated between a
  Kotlin layer and a JS layer
