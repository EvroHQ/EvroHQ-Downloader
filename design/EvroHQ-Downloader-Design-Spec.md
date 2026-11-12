# EvroHQ Downloader 2.6 — Design Spec

The reference implementation is `EvroHQ-Downloader-Prototype.html`. When this document and the prototype disagree, the prototype wins. Use the state picker on the left of the prototype to open every state.

---

## 1. Layout

The window is built from these blocks, top to bottom:

| Block | Height | Notes |
|---|---|---|
| Title bar | 38px | App icon (20px), name, version, PROXY marker, Settings button, window controls (44px wide each) |
| Update banner | 40px | Only shown while an update is available, downloading or ready to install |
| URL bar | 52px field (46px compact) | 14px padding above, 12px below |
| Main area | flex: 1 | Shows one of: empty, reading, error card, single-video layout, list layout |
| Dock | auto | Left: output sentence and More options. Right column: size line, Queue chip, primary button |

Overlays, by z-index:
- **15:** invisible layer that closes popovers when you click outside
- **16:** dock
- **20:** popovers
- **30/31:** Settings scrim and sheet
- **45:** toast
- **50:** What's new

### Window sizes

| Token | Full | Compact |
|---|---|---|
| Window | 1040 × 720 | 880 × 600 |
| Horizontal padding (`padX`) | 24 | 18 |
| URL field height | 52 | 46 |
| List row height | 48 | 42 |
| List columns | `24 28 36 1fr 128 52` | `22 24 30 1fr 104 44` |
| Track thumbnail | 36 | 30 |
| Dock right column | 320 | 280 |
| Single-video thumbnail width (16:9) | 340 | 250 |
| Settings sheet width | 400 | 360 |
| What's new dialog width | 480 | 420 |

The column gap in the list is 12px.

---

## 2. Color tokens

All UI color comes from CSS custom properties on the window root. Switching theme only swaps these values.

| Token | Graphite & Amber (default) | Paper & Rust | Use |
|---|---|---|---|
| `--bg` | `#131313` | `#F2F0EA` | Window background, input wells |
| `--bar` | `#0E0E0E` | `#EAE7DF` | Title bar |
| `--surf` | `#191919` | `#FBFAF7` | Dock, URL field, sheet, cards, row hover |
| `--surf2` | `#222222` | `#ECE9E1` | Secondary buttons, selected segment, menu hover |
| `--pop` | `#242424` | `#FFFFFF` | Popovers, toast base |
| `--line` | `#2A2A2A` | `#DDD9CF` | Hairlines, row dividers |
| `--line2` | `#383838` | `#C9C4B8` | Control borders, window border |
| `--ink` | `#EDEAE4` | `#17160F` | Primary text |
| `--ink2` | `#A3A09A` | `#5D5B53` | Secondary text, mono meta |
| `--ink3` | `#7D7A74` | `#7A776E` | Tertiary text, row numbers |
| `--acc` | `#F5A524` | `#B4471F` | Accent: tokens, primary button, progress |
| `--accInk` | `#1C1303` | `#FFFFFF` | Text on top of the accent |
| `--accSoft` | `rgba(245,165,36,.12)` | `rgba(180,71,31,.08)` | Token pill fill, focus ring, banner |
| `--accLine` | `rgba(245,165,36,.34)` | `rgba(180,71,31,.32)` | Token pill border, active option card |
| `--grn` | `#5BC98A` | `#2E8A56` | Success, saved, PROXY marker |
| `--red` | `#F26D6D` | `#C2362F` | Error |
| `--yel` | `#F2C94C` | `#8F6400` | Warning, paused |
| `--thA` / `--thB` | `#1B1B1B` / `#222222` | `#E3DFD4` / `#ECE9E1` | Striped thumbnail placeholders (135°, 6px stripes) |
| `--skel` | `#232323` | `#E6E2D8` | Skeleton bars |
| `--ov` | `rgba(0,0,0,.55)` | `rgba(23,22,15,.32)` | Modal scrim |

### Other themes

Only the base and accent are listed here. Every other token is in `THEMES` in the prototype.

| Theme | `--bg` | `--acc` | `--accInk` |
|---|---|---|---|
| EvroHQ | `#09090B` | `#A02368` (gradient, see below) | `#FFFFFF` |
| Carbon & Cyan | `#0F1214` | `#22D3EE` | `#04181C` |
| Obsidian & Violet | `#111016` | `#A78BFA` | `#150D2B` |
| Charcoal & Red | `#151413` | `#F2555A` | `#1A0405` |
| Bone & Forest | `#EEEBE3` | `#2F6B45` | `#FFFFFF` |

The app ships 7 themes in total: Graphite & Amber (default) and Paper & Rust in the table above, plus the 5 here.

#### EvroHQ (the original theme)

EvroHQ is not in `THEMES` in the prototype, so all its tokens are listed here. They come from the current app (`[data-theme='evrohq']` in `index.css`).

It is the only theme whose accent is a **gradient**. Fill the primary button, the progress bar and the selected segment with `--accGrad`. Use the solid `--acc` where a single color is needed (borders, focus ring, icons). For accent **text** on the dark background (output-sentence tokens, links), use `--accText`: `#A02368` alone is too dark to read on `#09090B`.

| Token | EvroHQ |
|---|---|
| `--bg` | `#09090B` |
| `--bar` | `#070709` |
| `--surf` | `#18181C` |
| `--surf2` | `#2C2C32` |
| `--pop` | `#1C1C20` |
| `--line` | `rgba(255,255,255,.12)` |
| `--line2` | `rgba(255,255,255,.22)` |
| `--ink` | `#D4D4D8` |
| `--ink2` | `#A1A1AA` |
| `--ink3` | `#71717A` |
| `--acc` | `#A02368` |
| `--accGrad` | `linear-gradient(100deg, #5618A7 0%, #DB2736 100%)` |
| `--accText` | `#E65A9C` |
| `--accInk` | `#FFFFFF` |
| `--accSoft` | `rgba(86,24,167,.18)` |
| `--accLine` | `rgba(160,35,104,.45)` |
| `--grn` / `--red` / `--yel` | same as Graphite & Amber |
| `--thA` / `--thB` | `#141418` / `#1A1A1F` |
| `--skel` | `#1C1C20` |
| `--ov` | `rgba(0,0,0,.6)` |

**System** follows `prefers-color-scheme`: light uses Paper & Rust, dark uses Graphite & Amber.

### App icon

The icon looks the same in every theme:
- tile `#1C1C1C` with a `#3A3A3A` border
- cream "U" tray `#EDEAE4`
- amber downward triangle `#F5A524`

Replace the CSS placeholder with the real icon asset.

### Tinted surfaces

Toasts, the paused pill and the PROXY marker are tinted with the state color:
- fill: `color-mix(in srgb, <state> 13–16%, var(--pop) or transparent)`
- border: `color-mix(in srgb, <state> 40–55%, transparent)`

---

## 3. Typography

| Family | Weights | Use |
|---|---|---|
| **Bricolage Grotesque** (Google Fonts, `opsz 12..96`) | 400, 500, 600, 650, 700, 750, 800 | All UI text |
| **Geist Mono** (Google Fonts) | 400, 500, 600 | Machine data: URLs, sizes, durations, kickers, keyboard hints |

| Style | Family | Size (full / compact) | Weight | Letter spacing | Line height |
|---|---|---|---|---|---|
| Hero ("Paste a link. Get the file.") | Bricolage | 40 / 33 | 750 | -0.04em | 1.0 |
| Single-video title | Bricolage | 32 / 25 | 750 | -0.035em | 1.02, `text-wrap: balance` |
| List header headline | Bricolage | 26 / 22 | 750 | -0.035em | 1.0 |
| Settings title | Bricolage | 24 | 750 | -0.035em | — |
| Error card title | Bricolage | 23 | 750 | -0.03em | 1.1 |
| What's new title | Bricolage | 22 | 750 | -0.03em | — |
| Output sentence | Bricolage | 21 / 18 | 500 (count 750, tokens 650) | -0.02em | 1.85 |
| Single-video status headline | Bricolage | 20 | 700 | -0.02em | — |
| Body and lead text | Bricolage | 15 | 400–500 | 0 | 1.5 |
| Primary button | Bricolage | 15.5 | 750 | -0.01em | — |
| Menu option label | Bricolage | 15 | 600 | -0.01em | 1.3 |
| Track row | Bricolage | 14.5 | artist 650, title 400 in `--ink2` | 0 | — |
| Secondary button | Bricolage | 13–13.5 | 600 | 0 | — |
| Kicker / section label | Geist Mono | 10–11, uppercase | 500 | 0.10–0.12em | — |
| Meta line (sizes, speed) | Geist Mono | 12 | 400 | 0 | 1.5 |
| URL input | Geist Mono | 14 | 400 | 0 | — |
| Menu option description | Geist Mono | 10.5 | 400 | 0 | 1.4 |

---

## 4. Spacing, radius, borders and shadows

**Spacing scale (px):** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28.
- Groups of controls use `gap`, not margins.
- Dock padding: `12 padX 14`.
- Right column padding: `12 14 14`.

**Radius**

| Radius | Used on |
|---|---|
| 4px | Checkboxes, track thumbnails, keyboard caps |
| 5–6px | Small buttons, segment items, inputs, window × |
| 7px | Tokens, secondary buttons |
| 8px | Primary button, Queue chip, segmented containers, theme tiles, thumbnails |
| 10px | URL field, window, popovers, toasts, option cards |
| 12px | Error card, queue popover |
| 14px | What's new dialog |
| 999px | Pills (paused notice) |

**Borders:** always 1px.
- `--line` for dividers.
- `--line2` for controls and containers.
- The URL field turns red on error.
- Exceptions: checkbox 1.5px, active list status ring 2px.

**Shadows**

| Shadow | Used on |
|---|---|
| `0 30px 70px -30px rgba(0,0,0,.6)` | Window |
| `0 18px 44px rgba(0,0,0,.45)` | Popovers |
| `0 14px 34px rgba(0,0,0,.35)` | Toast |
| `0 30px 60px rgba(0,0,0,.45)` | What's new dialog |
| `-20px 0 40px rgba(0,0,0,.3)` | Settings sheet |
| `0 0 0 3px var(--accSoft)` | Token hover ring |

**Motion**
- Toggle knob: `left .15s`.
- More options chevron: `rotate 0 → 90deg, .15s`.
- Reading line: 40% bar, `translateX(-100% → 260%)`, 1.1s, ease-in-out, infinite.
- Active and paused dots: opacity pulse `1 → .3`, 1–1.4s.

---

## 5. Components and behavior

### 5.1 URL bar

**Source chip** (left of the field):

| State | Label | Dot color |
|---|---|---|
| No link | `NO LINK` | `--ink3` |
| Reading | `READING…` | `--acc` |
| Error | `UNREADABLE` | `--red` |
| YouTube playlist | `YOUTUBE · PLAYLIST` | `--grn` |
| YouTube video | `YOUTUBE · VIDEO` | `--grn` |
| SoundCloud | `SOUNDCLOUD · SET` | `--grn` |

**Placeholder:**
- `Paste a YouTube or SoundCloud link…`
- While a download is running or the queue is waiting: `Paste another link to add it to the queue…`

**Buttons:**
- **×** (only when the field has text): clears the field. Goes back to the empty screen, or to the running download if there is one.
- **Paste `CTRL V`**: reads the clipboard and starts reading the link.

**Input:**
- **Enter** reads the link.
- **Ctrl+V** anywhere outside a text input reads the pasted link.

**Link detection:**

| Link | Result |
|---|---|
| Not youtube.com, youtu.be or soundcloud.com | Error: unsupported |
| Private or deleted | Error: private |
| `soundcloud.com/…` | SoundCloud set |
| `watch?v=…&list=…` or `youtu.be/…?list=` | Single video with the playlist switch |
| `list=` | Playlist |
| Anything else | Single video |

### 5.2 Main states

**Empty**
- Icon (56px), then `Paste a link.` with `Get the file.` in the accent color.
- Lead: `Videos, playlists, tracks and sets from YouTube and SoundCloud, saved straight to your folder.`
- Hint: `Ctrl` `V` `works anywhere in this window`
- Link: `Try an example playlist →`

**Reading**
- Headline: `Reading link…`
- Kicker: `CHECKING WHAT'S AT THIS ADDRESS`
- Indeterminate line and 6 skeleton rows.

**Error card** (max-width 600, centered)
- Kicker: `COULDN'T READ THIS LINK`

| | Private / deleted | Unsupported |
|---|---|---|
| Title | `This playlist is private, or it doesn't exist.` | `That isn't a YouTube or SoundCloud link.` |
| Body | `Check that it's set to Public or Unlisted and that the link is complete. If YouTube is blocked on your network, route downloads through a proxy.` | `This app reads links from youtube.com, youtu.be and soundcloud.com. Check the link you pasted.` |
| Raw line (mono) | `ERROR: [youtube:tab] <id>: The playlist does not exist or is private.` | `ERROR: Unsupported URL: <url>` |

- Buttons:
  - `Try again` (primary)
  - `Set up a proxy` (opens Settings)
  - `Copy error log` (text button; toast `Error log copied`)

**List layout** (playlists and SoundCloud sets)

The header changes with the state:

| State | Kicker | Headline | Meta | Actions |
|---|---|---|---|---|
| Ready | `YOUTUBE PLAYLIST` / `SOUNDCLOUD SET` | Playlist title | `6 tracks · 24:11 · up to 1080p` (SoundCloud: `audio only`) | — |
| Downloading | Playlist title, uppercase | `Downloading ` + **`47%`** (accent) | `track 3 of 6 · 266 MB / ~566 MB · 4.2 MB/s · 1:06 left` | — |
| Paused | Playlist title | `Paused at ` + **`47%`** (yellow) | `track 3 of 6 · 266 MB / ~566 MB` | `Resume now` (primary), `Set up a proxy` |
| Between items | `UP NEXT · 1 IN QUEUE` | `Next download in ` + **`5 s`** | `<title> · <summary>` | `Start now` |
| Done | Playlist title | `Saved. ` + **`6 tracks, 566 MB`** (green) | `→ C:\Users\EvroHQ\Downloads` | `Open folder` (ink-filled), `New download` |

- **Paused pill:** `Queue paused · YouTube bot check · resuming in 30 s` (yellow, pulsing dot).
- **Table header:**
  - Ready: `6 OF 6 SELECTED`, `EST. SIZE`, `TIME`
  - Otherwise: `TITLE`, `STATUS`, `TIME`
- **Select-all checkbox:** filled with ✓ when all are selected, shows `–` when some are, empty when none.
- **Track row:** status icon, `01`, thumbnail, **Artist** — Title, status, duration.

| Row status | Icon | Status column |
|---|---|---|
| Ready, selected | Accent checkbox with ✓ | `~96 MB` |
| Ready, not selected | Empty checkbox, row at 45% opacity | `~96 MB` |
| Waiting | Dashed circle | `waiting` |
| Downloading | Accent ring with pulsing dot | 48px bar + `63%` |
| Paused | Yellow ring with pause bars | Yellow bar + percentage |
| Saved | Green filled ✓ | `saved` |

- Clicking a row toggles it, but only in Ready. Hover fills the row with `--surf`.

**Single-video layout**
- Thumbnail (16:9, duration badge) beside: kicker (`YOUTUBE VIDEO`), title, channel, then the status.
- Ready meta: `1:12:40 · up to 1440p · 21 chapters`
- Downloading:
  - Status: `Downloading 62%`
  - Meta: `1.1 GB / ~1.7 GB · 4.2 MB/s · 2:31 left` (no track count)
  - A 4px bar underneath.
- A video from a playlist link adds the switch **`Whole playlist` | `This video only`** (default: This video only). Choosing Whole playlist switches to the list layout and keeps the switch.

### 5.3 Output sentence (dock)

**Label above the sentence** (mono, 10px):

| Situation | Label |
|---|---|
| No link | `OUTPUT · PASTE A LINK TO START` |
| Editable | `OUTPUT · CLICK A HIGHLIGHTED WORD TO CHANGE IT` |
| Editing a new link while something downloads | `NEXT IN QUEUE · KEEPS ITS OWN SETTINGS` |
| Downloading | `OUTPUT · LOCKED WHILE THIS RUNS` |
| Done | `OUTPUT · LAST DOWNLOAD` |

**Grammar:**
```
Save <N tracks | this> as [video|audio] in [quality], [encoding]
     [, from [hh:mm:ss] to [hh:mm:ss]] [, split into 21 chapters]
     , [with metadata], into [folder].
```
- Audio from YouTube: `… as [audio] in [WAV 44.1 kHz], …` (no encoding token).
- SoundCloud: `… as [audio] in [original quality | WAV], …`
- No link: `Save everything as video in 1080p, H.264, with metadata, into Downloads.` shown at 45% opacity.

**Token**
- Default: inline-flex, height 1.5em, padding `0 7 0 9`, radius 7, background `--accSoft`, 1px `--accLine` border, text `--acc` at weight 650, followed by a `▼` at 0.6em and 80% opacity.
- Hover: border `--acc` and a 3px `--accSoft` ring.
- Open: background and border `--acc`, text `--accInk`.
- Locked: no fill, border or chevron, text `--ink`, not clickable.

**Menus**
- Open upward, 300px wide, with a mono title and one row per option: dot (accent when selected), label, mono description.
- Open toward the right by default. If there isn't 310px of room to the right of the token, align to the token's right edge instead.
- Close on outside click or after a pick.
- Disabled options: label at 40% opacity, the reason in place of the description, `not-allowed` cursor, nothing happens on click.

| Token | Menu title | Options (label — description) |
|---|---|---|
| video / audio | FORMAT | **Video** — `MP4 or MKV · up to 1080p`. On SoundCloud it is disabled: `SoundCloud is audio only`.<br>**Audio only** — `WAV or MP3 · no picture` (SoundCloud: `Original or WAV`) |
| 1080p | QUALITY | **1080p** — `Full HD`<br>**1440p** — `2K` (with H.264: `2K · switches to Best quality`)<br>**2160p** — `4K`<br>Above the source's maximum: disabled, `This video tops out at 1440p` / `This playlist tops out at 1080p` |
| H.264 / best quality | ENCODING | **H.264** — `Plays everywhere · max 1080p · MP4`. Above 1080p: `… · drops to 1080p`.<br>**Best quality** — `VP9 / AV1 · smaller files · MKV` |
| WAV 44.1 kHz | AUDIO FORMAT | **WAV 44.1 kHz** — `Lossless · ~10 MB per minute`<br>**MP3 320 kbps** — `Plays anywhere · ~2.4 MB per minute` |
| original quality | SOUNDCLOUD QUALITY | **Original** — `Best available · no re-encoding`<br>**WAV** — `Converted to WAV · lossless container` |
| with metadata | METADATA | **With metadata** — `Title, artist and cover art embedded`<br>**Without metadata** — `Clean file · nothing embedded` |
| Downloads | SAVE TO | Downloads, Music, Videos, DJ Sets (each shows its full path)<br>**Choose folder…** — `Opens the system folder picker` |
| 00:10:30 / 00:14:00 / split… | — | No menu: clicking opens More options |

Rules between the options:
- Picking 1440p or 2160p while H.264 is selected switches to Best quality.
- Picking H.264 above 1080p drops the quality to 1080p.

**File size estimates** (MB per minute):

| Output | MB/min |
|---|---|
| 1080p H.264 | 23.4 |
| 1440p | 46 |
| 2160p | 98 |
| Best quality | × 0.8 of the above |
| WAV | 10.1 |
| MP3 320 | 2.4 |
| SoundCloud original | 2.3 |

Show estimates with `~` or `≈`. Container: MP4 (H.264), MKV (Best quality), WAV, MP3, M4A (SoundCloud original).

### 5.4 More options

- A text button `▶ More options` in `--ink2` (hover `--ink`). The chevron rotates when open. Closed by default.
- When closed and an option is on, a summary appears after the label in the accent color:
  - `· Trim 00:10:30–00:14:00`
  - `· Split into 21 chapters`
- Not shown for locked sentences.
- Playlists show only: `Trim and split by chapters work on single videos. Paste a video link to use them.`

**Trim a range** (card with a toggle)
- **Start** and **End** fields, mono, 84px wide.
- Input keeps digits only, takes the last 6, pads with leading zeros and formats as `hh:mm:ss`. Typing shifts digits in from the right.
- Editing either field turns Trim on and Split off.
- Info line:
  - Off: `Video length 1:12:40`
  - On: `Selection 3:30 · ≈ 82 MB`
- Errors (red text, red card and End field border, primary button disabled with `Fix the time range`):
  - `Minutes and seconds only go up to 59.`
  - `The range runs past the end. This video is 1:12:40 long.`
  - `End must be after start.`

**Split by chapters**
- Only shown when the video has chapters.
- Text: `Split into 21 chapters, one file each`
- Note: `Uses the chapter titles as file names`
- Trim and Split can't both be on. Turning one on turns the other off, and each card says so: `Turns off Split` / `Turns off Trim`.

### 5.5 Right column: size line, Queue chip and primary button

**Size line** (mono, 10.5px)

| State | Left | Right |
|---|---|---|
| Ready, playlist | `6 OF 6 · 24:11` | `≈ 566 MB MP4` |
| Ready, single | `1:12:40` or `TRIMMED · 3:30` | `≈ …` |
| Running | `THIS DOWNLOAD` | `~566 MB MP4` |

**Primary button** (52px tall, flex: 1)

| State | Appearance and label |
|---|---|
| No link | Disabled: `Paste a link first` |
| Reading | Disabled: `Reading link…` |
| Nothing selected | Disabled: `Select at least one track` |
| Trim range invalid | Disabled: `Fix the time range` |
| Ready, nothing running | Accent: `Download 6 tracks ↓` / `Download video ↓` / `Download audio ↓` |
| Ready, something running | Accent: `Add to queue +` |
| Downloading | Progress bar: `--acc` fill at 24% across the width so far, plus a 3px solid line along the bottom. Text `47%` / `track 3 of 6`, button `Cancel` |
| Paused | Yellow progress bar: `Paused` / `47% · bot check`, button `Resume` |
| Between items | `Next in 5 s` / `1 waiting`, button `Start now` |
| Done | Accent: `Download again ↻` |

Disabled buttons use `--surf2` with `--ink2` text. Accent hover is `brightness(1.08)`.

**Queue chip** (left of the button)
- Shown while something is downloading or waiting.
- Line 1: `Queue · 2` (running + waiting).
- Line 2 (mono): `47%`, `paused`, or `next in 5 s`.
- Clicking opens the queue popover. While open, the chip has an accent border and soft fill.

**Queue popover** (360px, opens upward, right-aligned)
- Header: `Queue · 2`, with `EACH ITEM KEEPS ITS SETTINGS` on the right.
- Current item:
  - `1 · <title>`, the percentage, a 3px bar.
  - Meta: `6 tracks · 1080p · H.264 · ~566 MB`; when paused it starts with `Paused · YouTube bot check · `.
- Note while waiting between items: `Next download in 5 s`
- Waiting items: number, title, summary (`1 video · 1440p · Best quality · ~2.7 GB`, plus `· trimmed` if trimmed), and a **×** button (`Remove from queue`).
- Empty: `Nothing waiting. Paste a link while this runs to add it.`
- Footer: `Clear queue` in red text. Shows the toast `Queue cleared`.

**Queue behavior**
1. While something downloads, a pasted link opens in the editor. The button reads **Add to queue**, and the chip keeps showing the running download.
2. **Add to queue** saves a copy of that link's selection and settings, returns to the running download, and shows the toast `Added to queue (N)`.
3. When an item finishes and the queue isn't empty, the next one starts after **5 seconds**. **Start now** skips the wait.
4. **Cancel** stops the current item. If the queue isn't empty, the 5-second countdown starts. If it's empty, the item reopens in the editor with its settings.
5. If YouTube shows a bot check, the queue pauses and resumes on its own after 30 s. You can press **Resume now** or set up a proxy.

### 5.6 Toasts

- Position: top center, 12px below the title bar (or below the update banner).
- Width fits the text, max 78% of the window. Padding `8 8 8 10`, radius 10, a 20px round icon, and a × button.
- Disappear after **3.8 s**. A new toast replaces the current one.

| Type | Color | Icon | Copy |
|---|---|---|---|
| Success | `--grn` | ✓ | `Download complete` |
| Info | `--acc` | i | `Added to queue (2)` · `Proxy on · SOCKS5 127.0.0.1:1080` · `Proxy off` · `Queue cleared` · `Error log copied` · `Opened C:\Users\EvroHQ\Downloads` · `Filled every proxy field from the link` |
| Warning | `--yel` | ! | `YouTube is blocking this connection as a bot. Try again in 30 seconds.` |
| Error | `--red` | × | `Couldn't save to D:\Library\DJ Sets. The folder is read-only.` |

Use toasts for short messages. The full error card is only for links that can't be read at all.

### 5.7 Update banner

40px tall, `--accSoft` background, `--accLine` bottom border, with a dot in the accent color.

| Step | Text | Buttons |
|---|---|---|
| Available | **`Version 2.6.0 available`** `· queue, trim & chapters, six themes` | `Update now` (accent), `×` |
| Downloading | **`Downloading update 2.6.0`** + a bar (max 260px) + `38%` | — |
| Ready | **`2.6.0 is ready.`** `Restart to install. Downloads in progress will resume.` | `Restart to install` (accent), `Later` |

After the restart, the What's new dialog opens.

### 5.8 What's new dialog

- Scrim `--ov`, with 36px vertical padding around the dialog.
- The dialog's max-height is the window minus that padding. The header and footer are fixed, and the card list scrolls in between, so **Got it** is always visible.
- Header: icon (40px), `What's new in 2.6`, `UPDATED FROM 2.5.4`.

Cards (kicker / title / body):
1. `QUEUE` / `Line up downloads` / `While something is downloading, paste another link and press Add to queue. Each item keeps its own settings.`
2. `TRIM & CHAPTERS` / `Download only the part you need` / `Open More options to set a start and end time, or to split a video into one file per chapter.`
3. `THEMES` / `Six themes, dark by default` / `Graphite & Amber is the new default. For a light look, choose Paper & Rust or Bone & Forest.`
4. `PROXY` / `Test your proxy before you download` / `Paste one socks5:// link to fill in every field, then press Test connection to check it.`

Footer button: `Got it` (accent).

### 5.9 Settings sheet

- Opens from the title bar **Settings** button, from **Set up a proxy** in the error card, or from the paused state.
- Slides in from the right, below the title bar.
- Closes with **×** or a click on the scrim.
- Section labels are mono, 10px.

**APPEARANCE**
- 2-column grid of 40px tiles: a 22px swatch (background with an accent dot) and the theme name.
- Order: Graphite & Amber, Carbon & Cyan, Obsidian & Violet, Charcoal & Red, Paper & Rust, Bone & Forest, System.
- Selected tile: accent border and `--accSoft` fill. Applies immediately.

**WINDOW**
- Segmented control: `Full` / `1040 × 720` and `Compact` / `880 × 600`.

**NETWORK PROXY**
- Toggle, with the subtitle `Route every download through a proxy`.
- When on:
  - Type segmented control: `SOCKS5` · `SOCKS4` · `HTTP`.
  - `Address` (placeholder `host or socks5://…`) and `Port` (84px, digits only, max 5).
  - `Username · optional` and `Password · optional`. Hidden for SOCKS4.
  - Hint: `Paste socks5://user:pass@host:port into Address to fill every field.` Pasting a full link fills every field (type, host, port, user, password). Missing port defaults: 1080 (SOCKS), 8080 (HTTP).
  - `Test connection` button. Result line:
    - `Testing…`
    - `Working · 76 ms` (green)
    - `Connection refused. Nothing is listening on 10.0.0.5:9999.` (red)
    - `Enter a host and a port between 1 and 65535.` (red)
  - Editing any field clears the last test result.
- The title bar shows a `PROXY` marker while the proxy is on. Turning it on or off shows a toast.

**ENGINE**
- `yt-dlp 2026.10.22` / `ffmpeg 7.1` and `Check for updates`.
- Result: `Checking…`, then `yt-dlp and ffmpeg are up to date`.

**ABOUT**
- `EvroHQ Downloader v2.6.0`, `Made by @EvroHQ`.
- `★ Star on GitHub` (ink-filled) and `Buy me a coffee` (outlined).

---

## 6. Accessibility notes

- Text contrast is at least 4.5:1 on its own background in both reference themes. Accent text on `--accSoft` meets that ratio for the token sizes used (18px and up).
- All controls are real `<button>` and `<input>` elements. Give tokens `aria-haspopup="listbox"` and `aria-expanded`, and give menu options `role="option"` and `aria-disabled`.
- Esc should close popovers, the sheet and dialogs (not wired up in the prototype).
- Toasts should go in an `aria-live="polite"` region; errors in an assertive one.
