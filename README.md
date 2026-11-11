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

Everything is built in — no extra tools, no terminal, no setup. Free, no ads, no account.

## Features

**Download**

- 🎵 **Audio** — WAV (44.1 kHz, uncompressed) or MP3 (320 kbps)
- 🎬 **Video** — MP4 up to **1080p / 2K / 4K** (best available, sound included)
- 🎞️ **Compatible (H.264 + AAC)** — native YouTube streams, 1080p max, no re-encode (works in editors and players that choke on AV1)
- ☁️ **SoundCloud** — tracks and sets, in the original quality or converted to WAV
- 📋 **Playlists** — preview every track, pick the ones you want, download into a folder named after the playlist
- 🧾 **Download queue** — add more videos or playlists while a download is running; they start one after another, each with its own settings
- 📊 **Live progress** — open the queue next to **Stop** to watch the current file fill up and remove anything still waiting
- 🚫 **No duplicates** — the same download can't be queued twice (the same video in another format still can)

**Edit while you download**

- ✂️ **Trim** — download only a time range; an end past the video's length is caught before downloading
- 📑 **Split by chapters** — save each chapter as its own file when the video has chapters
- 🏷️ **Embed metadata & cover art** — write tags into audio files (cover art needs MP3)

**Comfort**

- 🖼️ **Live preview** — thumbnail, title, channel, duration and estimated file size (or the size of your trimmed selection) before you download
- 🔗 **Smart links** — timestamps (`&t=`) and extra params are stripped; Mix and Music albums stay playlists
- 🛡️ **Proxy** — route downloads through a SOCKS5, SOCKS4 or HTTP proxy (Psiphon, Tor, your own…), with optional login and a connection test
- 🪟 **Compact window** — switch between Default and Compact from the header
- 🖱️ **Right-click** the link field for Cut, Copy, Paste and Select all
- 🔔 **Clear notifications** — colored by type; errors stay on screen longer
- 🎨 **Themes** — seven looks (dark and light); your pick is remembered next time
- 🔄 **Updates** — the app and yt-dlp update in place so YouTube downloads keep working
- 📦 **All-in-one** — yt-dlp, ffmpeg and a tiny JS runtime are bundled; nothing else to install

## Download

Get the latest version from the [**Releases page**](https://github.com/EvroHQ/EvroHQ-Downloader/releases/latest) — installer or portable, both identical in features.

## Themes

Open **Themes** in the header to switch. The last choice is restored when you reopen the app.

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

1. **Paste a YouTube or SoundCloud link** (or click the clipboard button). The preview on the right fills in automatically.
2. **Choose the format**:
   - **Audio** → **WAV** (44.1 kHz, uncompressed) or **MP3** (320 kbps). On SoundCloud: **Original** (best available) or **WAV**.
   - **Video** → **1080p**, **2K** or **4K**, then **Best quality** or **Compatible (H.264)** for editors and older players. Video always includes sound.
3. _(Optional)_ Turn on **Trim a specific range** to grab only a portion.
   - Just type the digits — the field formats itself: typing `001030` becomes `00:10:30` (hh:mm:ss).
   - The preview shows the length and estimated size of your selection.
4. _(Optional)_ **Split by chapters** saves one file per chapter when the video has chapters.
5. _(Optional, audio)_ Leave **Embed metadata** on to write title, artist and cover into the file. Cover art is embedded for MP3 only.
6. **Choose the output folder** with **Change** (it's remembered next time). Default is your **Downloads** folder.
7. Click **Download**. Follow progress in the status line and the bar. Need to cancel? Click **Stop**.

### Playlist

1. **Paste a playlist or SoundCloud set link.** The app switches to playlist mode and loads the track list with thumbnails.
2. **Select the tracks** you want (or use **Select all** / **Deselect all**). The footer shows how many are selected, the total length and the estimated size.
3. Pick **Audio** or **Video** as usual. Trim is not available in playlist mode.
4. Click **Download all**. Files land in a **subfolder named after the playlist**. The status line shows `Downloading 2/12` so you always know where you are.

### Queue

While a download is running, paste another link, pick its settings and click **Add to queue**. It starts automatically when the current one finishes. Open the queue button next to **Stop** to see the current file's progress and remove items that haven't started yet.

### Proxy

1. Click **Proxy** in the header.
2. Turn on **Use a proxy**, pick **SOCKS5**, **SOCKS4** or **HTTP**, and enter the address and port. You can also paste a full proxy link like `socks5://user:pass@127.0.0.1:1080` into the address field — every field fills in.
3. _(Optional)_ Open **Authentication** for a username and password (SOCKS5 and HTTP). The password is stored encrypted.
4. Click **Test connection** — `Working` means YouTube is reachable through the proxy.
5. Click **Save**. A dot on the **Proxy** button and `via SOCKS5 …` in the status line show it's active.

All downloads and previews then go through the proxy. With **Psiphon**, use SOCKS5, `127.0.0.1` and the port shown in Psiphon's settings under _Local proxy ports_.

---

## Good to know

- **Nothing else to install** — yt-dlp, ffmpeg and the JS runtime used for YouTube are already inside the app.
- **A video link with `&list=…`** is treated as a playlist. Switch to **Single video** in the preview if you only want that one clip.
- **yt-dlp updates** keep the app working when YouTube changes. When a new yt-dlp (or app) version is available, a banner appears at the top — the rest of the UI is locked until you update.
- **Proxy with a login (SOCKS5)** is used for downloads; app and yt-dlp updates then connect directly. HTTP proxies with a login cover both.
- **DRM-protected SoundCloud tracks** can't be downloaded; the app tells you when that's the case.
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
