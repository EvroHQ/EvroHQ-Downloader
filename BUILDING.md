# Building from source

Developer notes for building **EvroHQ Downloader** (Electron + React + Tailwind, packaged with electron-builder).

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- Windows (to produce the `.exe`)

## Install

```bash
npm install
```

## Provide the bundled binaries (required before building)

The app runs `yt-dlp.exe`, `ffmpeg.exe` and `qjs.exe` as bundled binaries. Put all three in `resources/bin/` before building:

```
resources/bin/
  yt-dlp.exe    # https://github.com/yt-dlp/yt-dlp/releases/latest  (the "yt-dlp.exe" file)
  ffmpeg.exe    # https://www.gyan.dev/ffmpeg/builds/  (ffmpeg-release-essentials.zip -> bin/ffmpeg.exe)
  qjs.exe       # https://github.com/quickjs-ng/quickjs/releases/latest  (qjs-windows-x86_64.exe, rename to qjs.exe)
```

They are git-ignored and bundled into the package via electron-builder's `extraResources` (which ships every `*.exe` in `resources/bin`). The release workflow downloads all three automatically.

### qjs — QuickJS-NG JavaScript runtime (required for YouTube)

- YouTube now presents a JavaScript challenge that yt-dlp must solve with an **external JS runtime** (Deno, Node ≥22, or QuickJS). See the [yt-dlp EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS). A machine with none of these installed gets `Process exited with code 1` for most videos.
- We bundle the tiny **QuickJS-NG** engine (`qjs.exe`, ~2 MB) and point yt-dlp at it via `--js-runtimes quickjs:<path>` (see `getJsRuntimeArgs()` in `src/main/index.js`). QuickJS was chosen over Deno/Node because it adds negligible size.
- Download **`qjs-windows-x86_64.exe`** from the [quickjs-ng releases](https://github.com/quickjs-ng/quickjs/releases/latest) and rename it to **`qjs.exe`**. Use a recent release (≥ v0.12.0) — older ones are much slower at solving the challenge.
- The EJS solver scripts themselves are already bundled inside the official `yt-dlp.exe`, so nothing else is needed.

### ffmpeg — use the **essentials** build (not full)

- Download **`ffmpeg-release-essentials.zip`** from https://www.gyan.dev/ffmpeg/builds/ — **do NOT** use `ffmpeg-release-full.zip`. The full build is ~2.3× larger and ships codecs the app never uses.
- Extract **only `bin/ffmpeg.exe`** from the zip. **Do not** include `ffprobe.exe` or `ffplay.exe` — the app never calls them (media duration is parsed from `ffmpeg -i` output).
- The essentials build still contains every encoder the app needs: `libmp3lame` (MP3), `pcm_s16le` (WAV), `aac`, and `libx264`/`libx265` (MP4 video).
- Expected size: **`ffmpeg.exe` ≈ 80–100 MB** (essentials). The full build is ~230 MB.

### yt-dlp — use the **nightly** standalone `.exe` (not the 3 MB zipapp)

- Download the file literally named **`yt-dlp.exe`** from the **nightly** channel: https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest. This is the PyInstaller build (**~17 MB**); it bundles its own Python and runs standalone on any Windows machine.
- **Why nightly, not stable?** YouTube breaks extraction frequently (JS challenges, and the PO Token / SABR `HTTP Error 403` on many videos). Nightly ships the fixes weeks before they reach a stable release — the stable channel was a month behind and already 403'd on lots of videos. Nightly is the same code as `master`, just built daily, and is what yt-dlp recommends when YouTube changes. The in-app updater (`src/main/index.js`) tracks the nightly channel too, so keep them consistent.
- **Do NOT** use the ~3 MB file named `yt-dlp` (no extension). That is a Python *zipapp* and requires Python to be installed on the end user's machine — it will fail for users who don't have Python. The 17 MB standalone exe is intentional: reliability over size.
- Expected size: **`yt-dlp.exe` ≈ 16–18 MB**.

### Expected packaged size (after optimizations)

With the essentials ffmpeg, `compression: maximum`, and the `node_modules` file filters in `electron-builder.yml`, the packaged output in `release/` is roughly:

| Artifact | Before | After |
| --- | --- | --- |
| NSIS installer (`*-Setup-*.exe`) | ~230–350 MB | **~120 MB** |
| Portable (`*-Portable-*.exe`) | ~230–350 MB | **~120 MB** |
| Installed on disk (`win-unpacked`) | ~500–790 MB | **~376 MB** |

Two things dominate and both were fixed:

1. **ffmpeg**: use the essentials build (`ffmpeg.exe` ~98 MB) instead of full (~230 MB).
2. **Don't pack scratch files into `app.asar`**: the CI workflow extracts ffmpeg into
   `ffmpeg_tmp/` (which also contains ffprobe/ffplay/docs) and downloads `ffmpeg.zip`.
   These live in the project root, so if they aren't deleted before packaging,
   electron-builder sweeps them into `app.asar` and the installer balloons to ~310 MB.
   The workflow removes them right after copying `ffmpeg.exe`, and `electron-builder.yml`
   excludes them as defense-in-depth.

`ffmpeg.exe` (~98 MB) and `yt-dlp.exe` (~17 MB) don't compress much further, so ~120 MB is about the floor.

## Run in development

```bash
npm run dev
```

## Build the Windows installer + portable

```bash
npm run build:win
```

Output goes to `release/`:

- `EvroHQ Downloader-Setup-2.3.0.exe` (NSIS installer)
- `EvroHQ Downloader-Portable-2.3.0.exe` (portable)

### Known issue: winCodeSign symlink extraction on Windows

On Windows **without Developer Mode / admin rights**, electron-builder fails while extracting `winCodeSign-2.6.0.7z` with:

```
Cannot create symbolic link : ... darwin/.../libcrypto.dylib
```

Those are macOS-only files, irrelevant to a Windows build. The cleanest fix is to **enable Windows Developer Mode** (Settings → Privacy & security → For developers → Developer Mode) or run the terminal **as Administrator**, then run `npm run build:win`.

If you cannot enable either, the `scripts/` folder contains a no-admin workaround used to produce the current release:

1. `scripts/eb-mirror.py` — a tiny local mirror that serves a symlink-free `winCodeSign` archive and redirects every other artifact to GitHub.
2. `scripts/patch-appbuilder.py` — updates the checksum that `app-builder` expects, so it accepts the cleaned archive (a `.orig` backup is kept).

Workflow (from a fresh, working extraction of winCodeSign placed under `serve/winCodeSign-2.6.0/winCodeSign-2.6.0.7z`):

```bash
python scripts/patch-appbuilder.py
python scripts/eb-mirror.py 8788 &          # start the local mirror
export ELECTRON_BUILDER_BINARIES_MIRROR="http://127.0.0.1:8788/"
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:win
```

> Prefer Developer Mode when possible — it's the officially supported path.

## Publishing a GitHub release

`scripts/gh-release.sh` creates a release and uploads the two installers using the token already stored by git (no interactive login). Assets are >100 MB, so they must go to a Release, not into git.

## Icon

The master icon is the vector file `resources/audio-video-downloader-icon.svg`.
To regenerate the multi-resolution `resources/icon.ico` (16→256 px) after editing it:

```bash
node scripts/make-icon.cjs
```

This uses `sharp` (a devDependency) to rasterize each size from the SVG and pack a
PNG-compressed `.ico`. It also writes `resources/icon-256.png` (also copied to
`src/renderer/src/assets/logo.png` for the in-app header).

## Project structure

```
resources/bin/        yt-dlp.exe + ffmpeg.exe + qjs.exe (you provide)
resources/icon.ico     app icon
src/main/index.js      Electron main: window, IPC, download logic, getBinPath()
src/preload/index.js   contextBridge API
src/renderer/          React + Tailwind UI
electron-builder.yml   packaging config
```
