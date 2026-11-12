<p align="center">
  <img src="resources/evrohq-icon-1024.svg" alt="EvroHQ Downloader logo" width="128">
</p>

<h1 align="center">EvroHQ Downloader</h1>

<p align="center">
  A clean, modern Windows app to download <b>audio</b> or <b>video</b> from YouTube and SoundCloud — single videos, tracks, or whole playlists.
</p>

<p align="center">
  <a href="https://github.com/EvroHQ/EvroHQ-Downloader/releases/latest"><img src="https://img.shields.io/github/v/release/EvroHQ/EvroHQ-Downloader?label=download&logo=github" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://buymeacoffee.com/evrohq"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support-orange?logo=buymeacoffee&logoColor=white" alt="Buy me a coffee"></a>
</p>

<p align="center">
  Everything is built in — no extra tools, no terminal, no setup. Free, no ads, no account.
</p>

## Features

**Download**

- 🎵 **Audio** — WAV (44.1 kHz, uncompressed) or MP3 (320 kbps)
- 🎬 **Video** — MP4 up to **1080p / 2K / 4K** in **Best quality** (VP9 / AV1, sound included)
- 🎞️ **H.264 + AAC** — native YouTube streams, 1080p max, no re-encode (works in editors and players that choke on AV1)
- ☁️ **SoundCloud** — tracks and sets, in the original quality or converted to WAV; tracks that can't be saved (DRM, Go+ previews, blocked in your country) are marked before you download
- 📋 **Playlists** — preview every track, pick the ones you want, download into a folder named after the playlist
- 🧾 **Download queue** — add more videos or playlists while a download is running; they start one after another, each with its own settings
- 📊 **Live progress** — percentage, size, speed and time left; in a playlist each track shows its own progress
- 🚫 **No duplicates** — the same download can't be queued twice (the same video in another format still can)

**Edit while you download**

- ✂️ **Trim** — download only a time range; an end past the video's length is caught before downloading
- 📑 **Split by chapters** — save each chapter as its own file when the video has chapters
- 🏷️ **Embed metadata & cover art** — write tags into audio files (cover art needs MP3)

**Comfort**

- ✍️ **One sentence** — _Save this as video in 1080p H.264 with metadata into Downloads._ Click any highlighted word to change it
- 🖼️ **Live preview** — thumbnail, title, channel, duration and estimated file size (or the size of your trimmed selection) before you download
- 🔗 **Smart links** — timestamps (`&t=`) and extra params are stripped; Mix and Music albums stay playlists
- 🛡️ **Proxy** — route downloads through a SOCKS5, SOCKS4 or HTTP proxy (Psiphon, Tor, your own…), with optional login and a connection test
- 🪟 **Compact window** — switch between Default and Compact in Settings
- 🖱️ **Right-click** the link field for Cut, Copy, Paste and Select all
- 🔔 **Clear notifications** — colored by type, with the real reason when something fails
- 🎨 **Themes** — seven looks (dark and light), or follow Windows; your pick is remembered next time
- 🔄 **Updates** — yt-dlp updates itself in the background so YouTube downloads keep working; app updates download in place
- 📦 **All-in-one** — yt-dlp, ffmpeg and a tiny JS runtime are bundled; nothing else to install

## Download

Get the latest version from the [**Releases page**](https://github.com/EvroHQ/EvroHQ-Downloader/releases/latest) — installer or portable, both identical in features.

## Themes

Open **Settings** → **Appearance** to switch, or pick **System** to follow Windows' light or dark mode. The last choice is restored when you reopen the app.

### Dark

|                        EvroHQ                        |                            Graphite & Amber                            |
| :--------------------------------------------------: | :--------------------------------------------------------------------: |
| <img src="docs/evrohq.png" alt="EvroHQ" width="480"> | <img src="docs/graphite-amber.png" alt="Graphite & Amber" width="480"> |

|                          Carbon & Cyan                           |                            Obsidian & Violet                             |
| :--------------------------------------------------------------: | :----------------------------------------------------------------------: |
| <img src="docs/carbon-cyan.png" alt="Carbon & Cyan" width="480"> | <img src="docs/obsidian-violet.png" alt="Obsidian & Violet" width="480"> |

|                           Charcoal & Signal Red                           |
| :-----------------------------------------------------------------------: |
| <img src="docs/charcoal-red.png" alt="Charcoal & Signal Red" width="480"> |

### Light

|                          Paper & Rust                          |                          Bone & Forest                           |
| :------------------------------------------------------------: | :--------------------------------------------------------------: |
| <img src="docs/paper-rust.png" alt="Paper & Rust" width="480"> | <img src="docs/bone-forest.png" alt="Bone & Forest" width="480"> |

---

## How to use

### Single video or track

1. **Paste a YouTube or SoundCloud link** — press **Ctrl+V** anywhere in the window, or click **Paste**. The preview fills in automatically.
2. **Read the sentence at the bottom**, e.g. _Save this as video in 1080p H.264 with metadata into Downloads._ Click any highlighted word to change it:
   - **video / audio** — Audio gives **WAV** (44.1 kHz) or **MP3** (320 kbps). On SoundCloud: **Original** (best available) or **WAV**.
   - **1080p / 1440p / 2160p** — 2K and 4K need **Best quality**.
   - **H.264 / Best quality** — H.264 plays everywhere (1080p max); Best quality (VP9 / AV1) goes up to 4K with smaller files.
   - **with / without metadata** — title, artist and cover art written into the file.
   - **Downloads** — your Downloads, Music or Videos folder, a recent folder, or **Choose folder…** (remembered next time).
3. _(Optional)_ Open **More options**:
   - **Trim a range** — type the start and end; `001030` becomes `00:10:30` (hh:mm:ss). The size of your selection updates as you type.
   - **Split by chapters** — one file per chapter, named after the chapter titles.
4. Click **Download video**. Progress, speed and time left show in the preview; **Cancel** stops it.
5. When it's done, **Open folder** shows the file. The settings stay editable, so you can grab another quality or the audio without pasting the link again.

### Playlist

1. **Paste a playlist or SoundCloud set link.** A video link with `&list=…` opens the whole playlist; use **This video only** to keep just that clip.
2. **Pick the tracks** — click rows to select them, or use the checkbox in the header for all / none. The sentence and the button show how many are selected and the estimated size.
3. Click **Download N tracks**. Files land in a **subfolder named after the playlist**, and each row shows its own progress.

### Queue

While a download is running, paste another link, set it up and click **Add to queue**. It starts by itself when the current one finishes, keeping its own settings. Once something is waiting, a **Queue** button appears next to the progress: open it to see what's coming and remove items that haven't started yet.

### Proxy

1. Open **Settings** → **Network proxy**.
2. Turn it on, pick **SOCKS5**, **SOCKS4** or **HTTP**, and enter the address and port — or paste a full link like `socks5://user:pass@127.0.0.1:1080` and every field fills in.
3. _(Optional)_ Add a username and password (SOCKS5 and HTTP). The password is stored encrypted.
4. Click **Test connection** — it tells you whether YouTube is reachable through the proxy. Changes are saved automatically.

All downloads and previews then go through the proxy. With **Psiphon**, use SOCKS5, `127.0.0.1` and the port shown in Psiphon's settings under _Local proxy ports_.

---

## Good to know

- **Nothing else to install** — yt-dlp, ffmpeg and the JS runtime used for YouTube are already inside the app.
- **A video link with `&list=…`** opens as a playlist. Switch to **This video only** in the preview if you only want that one clip.
- **yt-dlp updates itself** at startup and every few hours while nothing is downloading, so the app keeps working when YouTube changes. App updates show a banner at the top.
- **Proxy with a login (SOCKS5)** is used for downloads; app and yt-dlp updates then connect directly. HTTP proxies with a login cover both.
- **Some SoundCloud tracks can't be downloaded** — DRM-protected ones, Go+ tracks (only a 30-second preview streams) and tracks blocked in your country. They're marked in the list and skipped.
- **YouTube sometimes asks to confirm you're not a bot.** The app waits and tries again on its own; if it keeps happening, a proxy helps.
- **Antivirus false positives**: some antivirus software flags download tools. The app is safe; if needed, allow it in your antivirus.
- Downloading copyrighted content may be against YouTube's and SoundCloud's Terms of Service — use responsibly and only for content you have the right to download.

---

## Support

If this app is useful to you, you can support its development: [**☕ Buy me a coffee**](https://buymeacoffee.com/evrohq) or leave a ⭐ on GitHub. Thank you!

---

## Credits

Made by [@EvroHQ](https://github.com/EvroHQ). Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org/).

Developers: see [BUILDING.md](BUILDING.md) to build from source.

## License

MIT
