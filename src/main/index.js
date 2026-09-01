import { app, shell, BrowserWindow, ipcMain, dialog, net } from 'electron'
import { join, basename, extname } from 'path'
import { existsSync, readdirSync, unlinkSync, mkdirSync, renameSync, createWriteStream, copyFileSync, cpSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import appIcon from '../../resources/icon.ico?asset'

// Track yt-dlp's NIGHTLY channel, not stable. YouTube breaks extraction
// frequently (JS challenges, PO Token / SABR 403s) and the nightly builds ship
// the fixes weeks before they land in a stable release — the stable channel was
// a month behind and already 403'd on many videos. Nightly is the same code as
// master, just built daily, and is what yt-dlp recommends when YouTube changes.
const YTDLP_LATEST_API =
  'https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest'
const YTDLP_DOWNLOAD_URL =
  'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe'
const HTTP_USER_AGENT = 'AudioVideoYouTubeDownloader'
const SC_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Anonymous, privacy-respecting usage telemetry (opt-out). These are the
// project's PUBLIC keys — safe to embed. RLS allows INSERT only (no reads).
const SUPABASE_URL = 'https://nbnqkbmrusijizwwgrtm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Wam8TCU5ZS3ulQswN9eIRg_2IWrTEAQ'

const store = new Store({
  defaults: {
    outputFolder: '',
    telemetryEnabled: true,
    installId: '',
    theme: 'evrohq',
    codec: 'best',
    platform: 'youtube',
    lastSeenVersion: '',
    whatsNewAck: []
  }
})

let mainWindow = null
let currentChild = null
let cancelRequested = false

// Mockup window: 1052 × 752, left column 462, preview 1fr, gap 22, pad 20.
// Extra height vs 697 so Split-by-chapters fits under Trim without clipping.
const WINDOW_WIDTH = 1052
const WINDOW_HEIGHT = 752

const CANCELLED = '__CANCELLED__'

// Forcefully terminate a child process AND its descendants (yt-dlp spawns
// ffmpeg for merging), which a plain child.kill() would leave running on Windows.
function killTree(child) {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGKILL')
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Resolve the absolute path to the *bundled* binary (yt-dlp.exe / ffmpeg.exe).
 * In dev the binaries live in <projectRoot>/resources/bin.
 * In a packaged build they are extracted (via extraResources) to
 * process.resourcesPath/bin.
 */
function isPortableBuild() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE)
}

function portableDownloadUrl(version) {
  const v = String(version || '').replace(/^v/i, '')
  if (!v) return 'https://github.com/EvroHQ/EvroHQ-Downloader/releases/latest'
  return `https://github.com/EvroHQ/EvroHQ-Downloader/releases/download/v${v}/EvroHQ-Downloader-Portable-${v}.exe`
}

function youtubeWatchUrl(value) {
  const raw = String(value == null ? '' : value).trim()
  if (!raw) return null
  if (/^[\w-]{11}$/.test(raw)) return `https://www.youtube.com/watch?v=${raw}`
  let v = raw
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://www.youtube.com/watch?v=${id}` : null
    }
    const allowed = [
      'youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtube-nocookie.com'
    ]
    if (!allowed.includes(host)) return null
    const id =
      u.searchParams.get('v') ||
      (u.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]+)/) || [])[1]
    return id ? `https://www.youtube.com/watch?v=${id}` : null
  } catch (e) {
    return null
  }
}

function youtubeTrackUrls(params) {
  if (!Array.isArray(params?.trackUrls)) return []
  const seen = new Set()
  const out = []
  for (const raw of params.trackUrls) {
    const href = youtubeWatchUrl(raw)
    if (!href || seen.has(href)) continue
    seen.add(href)
    out.push(href)
  }
  return out
}

// Validate that a string is a real YouTube video URL (and not just any site
// yt-dlp happens to support). Lenient about a missing scheme.
function isYouTubeUrl(value) {
  let v = String(value == null ? '' : value).trim()
  if (!v) return false
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const allowed = [
      'youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'youtube-nocookie.com'
    ]
    if (!allowed.includes(host)) return false
    if (host === 'youtu.be') return u.pathname.length > 1
    if (u.pathname === '/watch') return u.searchParams.has('v')
    return /^\/(shorts|live|embed|v)\/[\w-]+/.test(u.pathname)
  } catch (e) {
    return false
  }
}

// A playlist / mix link (as opposed to a single video).
function isPlaylistUrl(value) {
  let v = String(value == null ? '' : value).trim()
  if (!v) return false
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const allowed = [
      'youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'youtube-nocookie.com'
    ]
    if (!allowed.includes(host)) return false
    if (u.pathname === '/playlist' && u.searchParams.has('list')) return true
    return u.searchParams.has('list') || u.searchParams.has('start_radio')
  } catch (e) {
    return false
  }
}

const SC_HOSTS = ['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com', 'soundcloud.app.goo.gl']
const SC_RESERVED = new Set([
  'discover',
  'stream',
  'search',
  'you',
  'pages',
  'charts',
  'upload',
  'signin',
  'login',
  'signup',
  'feed',
  'messages',
  'notifications',
  'settings',
  'pro',
  'premium',
  'jobs',
  'imprint',
  'terms',
  'privacy'
])

function parseHttpUrl(value) {
  let v = String(value == null ? '' : value).trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    return new URL(v)
  } catch (e) {
    return null
  }
}

function isSoundCloudUrl(value) {
  const u = parseHttpUrl(value)
  if (!u) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  return SC_HOSTS.includes(host)
}

function telemetryPlatform(url) {
  if (isSoundCloudUrl(url)) return 'soundcloud'
  if (url) return 'youtube'
  return null
}

// Playlists, albums, artist pages, likes — anything yt-dlp treats as a list.
function isSoundCloudCollectionUrl(value) {
  const u = parseHttpUrl(value)
  if (!u || !isSoundCloudUrl(value)) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'on.soundcloud.com' || host === 'soundcloud.app.goo.gl') return false
  const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (!parts.length) return false
  const joined = parts.join('/').toLowerCase()
  if (parts.includes('sets') || parts.includes('albums') || parts.includes('likes')) return true
  if (parts[0] === 'you') return parts[1] === 'likes' || parts[1] === 'sets' || parts[1] === 'albums'
  if (parts.length === 1) return !SC_RESERVED.has(parts[0].toLowerCase())
  if (parts.length === 2) {
    const second = parts[1].toLowerCase()
    return ['tracks', 'popular-tracks', 'sets', 'albums', 'reposts', 'likes', 'comments'].includes(
      second
    )
  }
  return /\/(sets|albums|likes)(\/|$)/i.test(joined)
}

// A concrete set/album URL (/user/sets/slug), not the user's list of sets.
function isSoundCloudSetUrl(value) {
  const u = parseHttpUrl(value)
  if (!u || !isSoundCloudUrl(value)) return false
  const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  const i = parts.findIndex((p) => p.toLowerCase() === 'sets' || p.toLowerCase() === 'albums')
  return i >= 1 && parts.length > i + 1
}

function getBundledBinPath(name) {
  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(root, 'bin', name)
}

// Writable directory where in-app updated binaries (e.g. a newer yt-dlp) live.
// Program Files is read-only for non-admins, so self-updating the bundled exe
// isn't reliable — instead we drop the newer copy here and prefer it.
function getUserBinDir() {
  return join(app.getPath('userData'), 'bin')
}

// productName used to be "EvroHQ YouTube Downloader" — keep settings / in-app
// yt-dlp updates when the display name changes.
function migrateOldUserData() {
  const dest = app.getPath('userData')
  const destCfg = join(dest, 'config.json')
  if (existsSync(destCfg)) return
  const appData = app.getPath('appData')
  const oldDirs = [
    join(appData, 'EvroHQ YouTube Downloader'),
    join(appData, 'evrohq-youtube-downloader')
  ]
  for (const src of oldDirs) {
    if (src === dest || !existsSync(src)) continue
    mkdirSync(dest, { recursive: true })
    const srcCfg = join(src, 'config.json')
    if (existsSync(srcCfg)) copyFileSync(srcCfg, destCfg)
    const srcBin = join(src, 'bin')
    const destBin = join(dest, 'bin')
    if (existsSync(srcBin) && !existsSync(destBin)) {
      cpSync(srcBin, destBin, { recursive: true })
    }
    return
  }
}

/**
 * Resolve a binary, preferring a user-updated copy (downloaded in-app) over the
 * bundled one. This lets us ship yt-dlp updates without admin rights.
 */
function getBinPath(name) {
  const userCopy = join(getUserBinDir(), name)
  if (existsSync(userCopy)) return userCopy
  return getBundledBinPath(name)
}

/**
 * YouTube now requires solving a JavaScript challenge, which yt-dlp can only do
 * with an external JS runtime (Deno/Node/QuickJS). End-user machines have none,
 * so we bundle QuickJS (qjs.exe) and point yt-dlp at it. Without this, yt-dlp
 * exits with code 1 for most videos. qjs is always the bundled copy (never a
 * user-updated yt-dlp's neighbour), so resolve it from the bundled bin dir.
 */
function getJsRuntimeArgs() {
  const qjs = getBundledBinPath('qjs.exe')
  return existsSync(qjs) ? ['--js-runtimes', `quickjs:${qjs}`] : []
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    title: 'EvroHQ Downloader',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects the dev server URL in development.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// While a download is running, watch yt-dlp output so we can tell a real
// download from a no-op skip (file already in the output folder).
let skipTracker = null

function beginSkipTracker() {
  skipTracker = { skipped: 0, progressed: false, lastDest: '' }
}

function endSkipTracker() {
  const t = skipTracker
  skipTracker = null
  return t
}

function skippedExistingResult(isPlaylist) {
  const t = endSkipTracker()
  if (t && t.skipped > 0 && !t.progressed) {
    return {
      alreadyDownloaded: true,
      message: isPlaylist ? 'Files already downloaded' : 'File already downloaded'
    }
  }
  return null
}

function alreadyDownloadedLine(line) {
  return /already been downloaded|already been recorded|already fully downloaded|file is already in target format/i.test(
    line
  )
}

// Pin the final extension so --no-overwrites checks the file the user already
// has (Song.wav) instead of the intermediate stream (Song.webm) that -x would
// otherwise fetch again and convert.
function mediaOutputTemplate(playlist, ext) {
  const file = ext ? `%(title)s.${ext}` : '%(title)s.%(ext)s'
  return playlist ? `%(playlist_title)s/${file}` : file
}

const AUDIO_EXTS = ['.m4a', '.mp3', '.aac', '.opus', '.ogg', '.wav', '.flac', '.mp4', '.webm', '.mpga']

function stemKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*._\-–—'’,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function existingOutputForTitle(outputFolder, title, ext) {
  if (!title || !outputFolder || !existsSync(outputFolder)) return null
  const base = sanitizeFilename(title)
  const wanted = ext
    ? [`.${String(ext).replace(/^\./, '').toLowerCase()}`]
    : AUDIO_EXTS
  for (const e of wanted) {
    const p = join(outputFolder, `${base}${e}`)
    if (existsSync(p)) return p
  }
  const want = stemKey(base)
  if (!want) return null
  try {
    for (const name of readdirSync(outputFolder)) {
      const e = extname(name).toLowerCase()
      if (!wanted.includes(e)) continue
      if (stemKey(basename(name, e)) === want) return join(outputFolder, name)
    }
  } catch (e) {
    // ignore unreadable folders
  }
  return null
}

function sendLog(line) {
  if (skipTracker) {
    if (alreadyDownloadedLine(line)) {
      skipTracker.skipped += 1
    } else if (/\[download\].*Destination:/i.test(line)) {
      skipTracker.lastDest = line
    } else if (/\[download\]\s+(\d+(?:\.\d+)?)%/i.test(line)) {
      // Cover-art / thumbnail fetches also print [download] % — those are not
      // a real media download and must not hide the "already downloaded" toast.
      if (!/\.(jpe?g|png|webp)/i.test(skipTracker.lastDest || '')) {
        skipTracker.progressed = true
      }
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-log', `[${timestamp()}] ${line}`)
  }
}

function sendComplete(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-complete', payload)
  }
}

function sendAppUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update', payload)
  }
}

// ---------------------------------------------------------------------------
// Network + version helpers (yt-dlp self-update)
// ---------------------------------------------------------------------------

// GET a URL and resolve with its body as text. Uses Electron's net module so
// it honours the system proxy and follows redirects automatically.
function fetchText(url, { ua = HTTP_USER_AGENT, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: 'follow' })
    request.setHeader('User-Agent', ua)
    for (const [key, value] of Object.entries(headers)) {
      if (value) request.setHeader(key, value)
    }
    request.on('response', (response) => {
      let data = ''
      response.on('data', (c) => (data += c.toString('utf-8')))
      response.on('end', () => resolve({ status: response.statusCode, body: data }))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

// A persistent, random, anonymous identifier for this install (no personal
// data). Generated once and stored locally so we can count unique installs.
function getInstallId() {
  let id = store.get('installId')
  if (!id) {
    id = randomUUID()
    store.set('installId', id)
  }
  return id
}

// Fire-and-forget usage telemetry ping. Never throws and never blocks the app —
// failures are silently ignored. `extra` carries per-event details.
function sendTelemetry(event, extra = {}) {
  try {
    if (store.get('telemetryEnabled') === false) return
    const payload = {
      install_id: getInstallId(),
      event,
      app_version: app.getVersion(),
      locale: app.getLocale() || null,
      ...extra
    }
    const request = net.request({ method: 'POST', url: `${SUPABASE_URL}/rest/v1/app_events` })
    request.setHeader('apikey', SUPABASE_ANON_KEY)
    request.setHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
    request.setHeader('Content-Type', 'application/json')
    request.setHeader('Prefer', 'return=minimal')
    request.on('response', (res) => {
      res.on('data', () => {})
      res.on('end', () => {})
    })
    request.on('error', () => {})
    request.write(JSON.stringify(payload))
    request.end()
  } catch (e) {
    // ignore — telemetry must never affect the app
  }
}

// Download a URL to `dest`, streaming progress to the renderer. Writes to a
// temporary file first and only swaps it in once complete, so an interrupted
// download can never corrupt the existing binary.
function downloadFile(url, dest, label = 'file') {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.download`
    const request = net.request({ url, redirect: 'follow' })
    request.setHeader('User-Agent', HTTP_USER_AGENT)
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed (HTTP ${response.statusCode})`))
        return
      }
      const clHeader = response.headers['content-length']
      const total = parseInt(Array.isArray(clHeader) ? clHeader[0] : clHeader || '0', 10)
      let received = 0
      let lastPct = -1
      const file = createWriteStream(tmp)
      response.on('data', (chunk) => {
        received += chunk.length
        file.write(chunk)
        if (total) {
          const pct = Math.round((received / total) * 100)
          if (pct !== lastPct) {
            lastPct = pct
            sendLog(`Downloading ${label}... ${pct}%`)
          }
        }
      })
      response.on('end', () => {
        file.end(() => {
          try {
            if (existsSync(dest)) unlinkSync(dest)
            renameSync(tmp, dest)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

// Run a binary just to capture its stdout (e.g. `yt-dlp --version`) without
// streaming to the renderer log. Resolves null if it can't be run.
function getProcessOutput(binPath, args) {
  return new Promise((resolve) => {
    if (!existsSync(binPath)) return resolve(null)
    const child = spawn(binPath, args, { windowsHide: true })
    let out = ''
    child.stdout.on('data', (c) => (out += c.toString('utf-8')))
    child.on('error', () => resolve(null))
    child.on('close', () => resolve(out.trim() || null))
  })
}

// Compare yt-dlp's date-based versions ("2024.08.06"). Returns >0 if a>b.
function compareYtdlpVersions(a, b) {
  const pa = String(a).split(/[.\-]/).map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split(/[.\-]/).map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

// Parse a flexible time string into seconds. Accepts "ss", "mm:ss",
// "hh:mm:ss" and optional decimals (e.g. "1:23.5"). Returns null if invalid.
function parseTimeToSeconds(value) {
  const str = String(value == null ? '' : value).trim()
  if (!str) return null
  const parts = str.split(':')
  if (parts.length > 3) return null
  let seconds = 0
  for (const part of parts) {
    if (!/^\d*\.?\d+$/.test(part)) return null
    seconds = seconds * 60 + parseFloat(part)
  }
  return seconds
}

// Normalize seconds into an ffmpeg-friendly hh:mm:ss(.ms) string.
function secondsToStamp(totalSeconds) {
  const whole = Math.floor(totalSeconds)
  const ms = Math.round((totalSeconds - whole) * 1000)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const pad = (n) => String(n).padStart(2, '0')
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`
  return ms ? `${base}.${String(ms).padStart(3, '0')}` : base
}

// Compact stamp for filenames (no ":" — invalid on Windows).
function safeStamp(value) {
  const secs = parseTimeToSeconds(value)
  if (secs == null) return '0'
  return secondsToStamp(secs).replace(/[:.]/g, '')
}

// Make an arbitrary string safe to use as a Windows file/folder name:
// strip forbidden characters (<>:"/\|?*), control chars, collapse whitespace,
// drop trailing dots/spaces, and cap the length.
function sanitizeFilename(name, fallback = 'file') {
  let s = String(name == null ? '' : name)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/[. ]+$/g, '')
  if (!s) s = fallback
  return s.slice(0, 120).trim() || fallback
}

// Ask yt-dlp (without downloading) for the video title and its chapter list.
// Returns { title, chapters:[{start,end,title}] } — chapters is [] when none.
async function fetchChapters(ytdlp, url) {
  const out = await getProcessOutput(ytdlp, [
    ...getJsRuntimeArgs(),
    '--skip-download',
    '--no-playlist',
    '--no-warnings',
    '--print',
    '%(chapters)j',
    '--print',
    '%(title)s',
    url
  ])
  if (!out) return { title: null, chapters: [] }
  const lines = out.split(/\r?\n/)
  const chaptersRaw = (lines[0] || '').trim()
  const title = lines.slice(1).join(' ').trim() || null
  let chapters = []
  try {
    const parsed = JSON.parse(chaptersRaw)
    if (Array.isArray(parsed)) {
      chapters = parsed
        .map((c) => ({
          start: Number(c.start_time),
          end: c.end_time == null ? null : Number(c.end_time),
          title: c.title ? String(c.title) : null
        }))
        .filter((c) => Number.isFinite(c.start))
    }
  } catch (e) {
    chapters = []
  }
  return { title, chapters }
}

// Ask yt-dlp (without downloading) for a single video's display metadata.
// Returns { id, title, channel, views, duration, thumbnail, uploadDate } or null.
async function fetchVideoInfo(ytdlp, url) {
  const out = await getProcessOutput(ytdlp, [
    ...getJsRuntimeArgs(),
    '--skip-download',
    '--no-playlist',
    '--no-warnings',
    '--print',
    '%(.{id,title,channel,uploader,view_count,duration,thumbnail,upload_date})j',
    url
  ])
  if (!out) return null
  const line = out.split(/\r?\n/).find((l) => l.trim().startsWith('{'))
  if (!line) return null
  try {
    const j = JSON.parse(line)
    return {
      id: j.id || null,
      title: j.title || null,
      channel: j.channel || j.uploader || null,
      views: Number.isFinite(j.view_count) ? j.view_count : null,
      duration: Number.isFinite(j.duration) ? j.duration : null,
      thumbnail: j.thumbnail || null,
      uploadDate: j.upload_date || null
    }
  } catch (e) {
    return null
  }
}

// Ask yt-dlp for a playlist's title and (flat) track list — fast, no per-video
// resolution. Returns { title, count, tracks:[{id,url,title,duration}] } or null.
async function fetchPlaylistInfo(ytdlp, url) {
  const out = await getProcessOutput(ytdlp, [
    ...getJsRuntimeArgs(),
    '--skip-download',
    '--flat-playlist',
    '--no-warnings',
    '--dump-single-json',
    url
  ])
  if (!out) return null
  // Best thumbnail URL for a flat playlist entry: prefer yt-dlp's own list,
  // otherwise rebuild it from the video id (flat entries always carry one).
  const thumbFor = (e) => {
    if (Array.isArray(e.thumbnails) && e.thumbnails.length) {
      const t = e.thumbnails[e.thumbnails.length - 1]
      if (t?.url) return t.url
    }
    if (e.thumbnail) return e.thumbnail
    if (e.id) return `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`
    return null
  }
  try {
    const j = JSON.parse(out)
    const entries = Array.isArray(j.entries) ? j.entries : []
    const tracks = entries.map((e, i) => ({
      id: e.id || String(i),
      url: e.url || e.webpage_url || e.id || null,
      title: e.title || `Track ${i + 1}`,
      duration: Number.isFinite(e.duration) ? e.duration : null,
      thumbnail: thumbFor(e)
    }))
    return {
      title: j.title || 'Playlist',
      count: tracks.length,
      cover: tracks[0]?.thumbnail || null,
      tracks
    }
  } catch (e) {
    return null
  }
}

// SoundCloud's "-original" size often 404s; t500x500 is the reliable large art.
function upgradeSoundCloudArt(url) {
  if (!url || typeof url !== 'string') return url
  let next = url.trim()
  if (next.startsWith('//')) next = `https:${next}`
  else if (next.startsWith('http://')) next = `https://${next.slice(7)}`
  return next.replace(
    /-(tiny|small|badge|mini|t50x50|t67x67|t120x120|t200x200|t300x300|large|crop|original)(\.(?:jpg|jpeg|png|webp))(?:\?.*)?$/i,
    '-t500x500$2'
  )
}

function soundCloudThumb(entry) {
  if (!entry) return null
  const urls = []
  if (Array.isArray(entry.thumbnails)) {
    for (const t of entry.thumbnails) {
      if (t?.url) urls.push(t.url)
    }
  }
  if (entry.thumbnail) urls.push(entry.thumbnail)
  if (entry.artwork_url) urls.push(entry.artwork_url)
  if (!urls.length) return null

  const score = (u) => {
    if (/artworks/i.test(u) && /t500x500/i.test(u)) return 80
    if (/artworks/i.test(u)) return 70
    if (/t500x500/i.test(u)) return 50
    if (/t300x300|crop/i.test(u)) return 40
    if (/-large/i.test(u)) return 30
    if (/-original/i.test(u)) return 5
    return 20
  }
  urls.sort((a, b) => score(b) - score(a))
  return upgradeSoundCloudArt(urls[0])
}

// SoundCloud's public playlist page lists every track; yt-dlp's full extract
// drops items that 403 / have no anonymous stream. We read the same hydration
// blob the website uses, then fill stub entries via api-v2 /tracks?ids=.
let scClientId = null

function parseSoundCloudHydration(html) {
  if (!html) return null
  const m = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch (e) {
    return null
  }
}

async function soundCloudClientId(html) {
  if (scClientId) return scClientId
  const fromPage = html && html.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/)
  if (fromPage) {
    scClientId = fromPage[1]
    return scClientId
  }
  const srcs = html
    ? [...html.matchAll(/src="(https:\/\/(?:a-v2\.sndcdn\.com|soundcloud\.com)\/[^"]+\.js[^"]*)"/gi)].map(
        (m) => m[1]
      )
    : []
  for (const src of srcs) {
    try {
      const res = await fetchText(src, { ua: SC_BROWSER_UA })
      const hit = res.body && res.body.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/)
      if (hit) {
        scClientId = hit[1]
        return scClientId
      }
    } catch (e) {
      // try the next bundle
    }
  }
  return null
}

async function soundCloudHydrateTracks(clientId, ids) {
  const map = new Map()
  const unique = [...new Set(ids.map((id) => String(id)).filter(Boolean))]
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const url =
      `https://api-v2.soundcloud.com/tracks?ids=${chunk.join(',')}&client_id=${encodeURIComponent(clientId)}`
    try {
      const res = await fetchText(url, {
        ua: SC_BROWSER_UA,
        headers: { Accept: 'application/json', Referer: 'https://soundcloud.com/' }
      })
      if (res.status === 401 || res.status === 403) {
        scClientId = null
        return map
      }
      const arr = JSON.parse(res.body)
      if (!Array.isArray(arr)) continue
      for (const t of arr) {
        if (t?.id != null) map.set(String(t.id), t)
      }
    } catch (e) {
      // keep whatever we already hydrated
    }
  }
  return map
}

function soundCloudProtocol(t) {
  return String(t?.format?.protocol || '')
}

function soundCloudIsEncryptedProtocol(proto) {
  return /encrypted|^cbc-|^ctr-/i.test(proto)
}

function soundCloudClearTranscodings(track) {
  return ((track?.media && track.media.transcodings) || []).filter(
    (t) => t?.url && !soundCloudIsEncryptedProtocol(soundCloudProtocol(t))
  )
}

async function soundCloudClearStreamResolves(clientId, transcoding) {
  const sep = transcoding.url.includes('?') ? '&' : '?'
  const url = `${transcoding.url}${sep}client_id=${encodeURIComponent(clientId)}`
  try {
    const res = await fetchText(url, {
      ua: SC_BROWSER_UA,
      headers: { Accept: 'application/json', Referer: 'https://soundcloud.com/' }
    })
    if (res.status !== 200 || !res.body) return false
    const j = JSON.parse(res.body)
    return Boolean(j?.url)
  } catch (e) {
    return false
  }
}

// Major-label / GO+ tracks often list fake mp3 transcodings that 404; the only
// working streams are FairPlay/Widevine HLS. Those cannot be saved.
async function soundCloudTrackIsProtected(clientId, track) {
  const trans = (track?.media && track.media.transcodings) || []
  if (!trans.length) return false
  const clear = soundCloudClearTranscodings(track)
  const encrypted = trans.some((t) => soundCloudIsEncryptedProtocol(soundCloudProtocol(t)))
  if (!encrypted) return false
  if (!clear.length) return true
  if (!clientId) return true
  for (const t of clear) {
    if (await soundCloudClearStreamResolves(clientId, t)) return false
  }
  return true
}

function soundCloudTrackFromApi(e, i) {
  const user = e.user || {}
  const ms = Number.isFinite(e.duration) ? e.duration : null
  return soundCloudTrackFromEntry(
    {
      id: e.id,
      title: e.title,
      uploader: user.username || user.full_name || e.publisher_metadata?.artist,
      duration: ms == null ? null : ms / 1000,
      artwork_url: e.artwork_url || user.avatar_url,
      thumbnail: e.artwork_url,
      webpage_url: e.permalink_url,
      url: e.permalink_url,
      view_count: e.playback_count,
      play_count: e.playback_count
    },
    i
  )
}

async function fetchSoundCloudSetFromWeb(url) {
  const res = await fetchText(url, {
    ua: SC_BROWSER_UA,
    headers: { Accept: 'text/html', Referer: 'https://soundcloud.com/' }
  })
  if (!res?.body) return null
  const hydration = parseSoundCloudHydration(res.body)
  const pl = hydration?.find((x) => x?.hydratable === 'playlist')?.data
  const raw = Array.isArray(pl?.tracks) ? pl.tracks.filter((t) => t?.id != null) : []
  if (!raw.length) return null

  const clientId = await soundCloudClientId(res.body)
  if (clientId) {
    const extra = await soundCloudHydrateTracks(
      clientId,
      raw.map((t) => t.id)
    )
    for (const t of raw) {
      const full = extra.get(String(t.id))
      if (full) Object.assign(t, full)
    }
  }

  const protectedFlags = await Promise.all(
    raw.map((t) => soundCloudTrackIsProtected(clientId, t))
  )

  const tracks = raw.map((e, i) => ({
    ...soundCloudTrackFromApi(e, i),
    protected: !!protectedFlags[i]
  }))
  const totalPlays = tracks.reduce((n, t) => n + (t.plays || 0), 0)
  return {
    kind: 'playlist',
    title: pl.title || 'Playlist',
    artist: pl.user?.username || pl.user?.full_name || null,
    count: tracks.length,
    plays: Number.isFinite(pl.playback_count) ? pl.playback_count : totalPlays || null,
    cover: soundCloudThumb(pl) || tracks[0]?.thumbnail || null,
    tracks
  }
}

function parseYtdlpJson(out) {
  if (!out) return null
  const jsonText = out.replace(/^[^{[]+/, '').trim()
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    return null
  }
}

function soundCloudPlays(e) {
  if (!e) return null
  if (Number.isFinite(e.view_count)) return e.view_count
  if (Number.isFinite(e.play_count)) return e.play_count
  if (Number.isFinite(e.playback_count)) return e.playback_count
  return null
}

function soundCloudTrackFromEntry(e, i) {
  const title = e.title && e.title !== 'NA' ? e.title : `Track ${i + 1}`
  return {
    id: e.id != null && e.id !== '' ? String(e.id) : e.ie_key && e.url ? `${e.ie_key}:${e.url}` : String(i),
    url: e.url || e.webpage_url || e.id || null,
    title,
    artist: e.uploader || e.artist || e.creator || null,
    duration: Number.isFinite(e.duration) ? e.duration : null,
    thumbnail: soundCloudThumb(e),
    plays: soundCloudPlays(e)
  }
}

function mergeSoundCloudPlaylist(flat, full) {
  const richById = new Map()
  const rich = (full?.entries || []).filter(Boolean)
  for (const e of rich) {
    if (e.id != null) richById.set(String(e.id), e)
    const href = e.webpage_url || e.url
    if (href) richById.set(String(href).replace(/\/+$/, ''), e)
  }
  const stubsFlat = (flat?.entries || []).filter(Boolean)
  const stubs = stubsFlat.length >= rich.length ? stubsFlat : rich
  const tracks = stubs.map((e, i) => {
    const href = (e.webpage_url || e.url || '').replace(/\/+$/, '')
    const extra = (e.id != null && richById.get(String(e.id))) || (href && richById.get(href)) || {}
    return soundCloudTrackFromEntry({ ...e, ...extra }, i)
  })
  const src = full || flat || {}
  const totalPlays = tracks.reduce((n, t) => n + (t.plays || 0), 0)
  return {
    kind: 'playlist',
    title: src.title || src.playlist_title || flat?.title || 'Playlist',
    artist: src.uploader || src.playlist_uploader || src.channel || null,
    count: tracks.length,
    plays: Number.isFinite(src.view_count) ? src.view_count : totalPlays || null,
    cover: soundCloudThumb(src) || tracks[0]?.thumbnail || null,
    tracks
  }
}

async function dumpSoundCloudJson(ytdlp, url, extraArgs = []) {
  return parseYtdlpJson(
    await getProcessOutput(ytdlp, [
      ...getJsRuntimeArgs(),
      '--skip-download',
      '--yes-playlist',
      '--ignore-errors',
      '--no-warnings',
      ...extraArgs,
      '--dump-single-json',
      url
    ])
  )
}

// SoundCloud track or playlist metadata. Sets are read from the public page so
// we keep every track the website shows — yt-dlp's full dump drops items that
// fail format extraction (geo / GO+ / 403), which is why a set can look short.
async function fetchSoundCloudMeta(ytdlp, url) {
  if (isSoundCloudSetUrl(url)) {
    try {
      const fromWeb = await fetchSoundCloudSetFromWeb(url)
      if (fromWeb?.tracks?.length) return fromWeb
    } catch (e) {
      // fall through to yt-dlp
    }
  }

  const collection = isSoundCloudCollectionUrl(url)
  const fullP = dumpSoundCloudJson(ytdlp, url)
  const flatP = collection
    ? dumpSoundCloudJson(ytdlp, url, ['--flat-playlist'])
    : Promise.resolve(null)
  const [full, flat] = await Promise.all([fullP, flatP])
  if (!full && !flat) return null

  const src = full || flat
  const entries = Array.isArray(src.entries) ? src.entries.filter(Boolean) : []
  const asPlaylist =
    src._type === 'playlist' ||
    (entries.length > 0 && collection) ||
    (flat && Array.isArray(flat.entries) && flat.entries.length > 1)

  if (asPlaylist) return mergeSoundCloudPlaylist(flat, full)

  return {
    kind: 'track',
    id: src.id || null,
    title: src.title || null,
    artist: src.uploader || src.artist || src.creator || src.channel || null,
    duration: Number.isFinite(src.duration) ? src.duration : null,
    thumbnail: soundCloudThumb(src),
    genre: src.genre || null,
    plays: soundCloudPlays(src)
  }
}

function soundCloudPlaylistItems(params) {
  if (Array.isArray(params?.selectedTracks) && params.selectedTracks.length) {
    return params.selectedTracks
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0)
      .join(',')
  }
  if (typeof params?.playlistItems === 'string') return params.playlistItems.trim()
  return ''
}

function isSoundCloudTrackUrl(value) {
  const u = parseHttpUrl(value)
  if (!u) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'api-v2.soundcloud.com' || host === 'api.soundcloud.com') {
    return /\/tracks\/\d+/i.test(u.pathname)
  }
  return isSoundCloudUrl(value)
}

function soundCloudTrackUrls(params) {
  if (!Array.isArray(params?.trackUrls)) return []
  return params.trackUrls.map((u) => String(u || '').trim()).filter((u) => isSoundCloudTrackUrl(u))
}

function soundCloudPlaylistOutputTemplate(params, ext) {
  const file = ext ? `%(title)s.${ext}` : '%(title)s.%(ext)s'
  const folder = sanitizeFilename(params?.title, 'playlist').replace(/%/g, '_')
  return `${folder}/${file}`
}

/**
 * Spawn a bundled binary and stream stdout/stderr line by line to the renderer.
 * Resolves with the process exit code.
 */
function runBinary(binPath, args, cwd) {
  return new Promise((resolve, reject) => {
    if (!existsSync(binPath)) {
      reject(new Error(`Binary not found: ${binPath}`))
      return
    }

    sendLog(`$ ${binPath.split(/[\\/]/).pop()} ${args.join(' ')}`)

    const child = spawn(binPath, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
    currentChild = child

    let stdoutBuffer = ''
    let stderrBuffer = ''

    const flush = (buffer, chunk, isErr) => {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split(/\r?\n/)
      const remainder = lines.pop()
      for (const line of lines) {
        if (line.trim().length) sendLog(isErr ? line : line)
      }
      return remainder
    }

    // yt-dlp emits carriage-return progress updates on stdout; split on \r too.
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf-8')
      const parts = text.split(/[\r\n]+/)
      stdoutBuffer = ''
      for (const part of parts) {
        if (part.trim().length) sendLog(part.trim())
      }
    })

    child.stderr.on('data', (chunk) => {
      stderrBuffer = flush(stderrBuffer, chunk, true)
    })

    child.on('error', (err) => {
      currentChild = null
      reject(err)
    })

    child.on('close', (code) => {
      currentChild = null
      if (stderrBuffer.trim().length) sendLog(stderrBuffer.trim())
      if (cancelRequested) {
        reject(new Error(CANCELLED))
      } else if (code === 0) {
        resolve(code)
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })
  })
}

function findTempFile(folder, extensions) {
  const files = readdirSync(folder)
  for (const f of files) {
    if (f.startsWith('temp_') && extensions.some((ext) => f.toLowerCase().endsWith(ext))) {
      return join(folder, f)
    }
  }
  return null
}

// Remove every leftover temp_* file (full downloads AND yt-dlp .part fragments)
// from the output folder. Called in a finally block so nothing is left behind
// even when a trim fails or the user cancels mid-download.
function cleanupTempFiles(folder) {
  try {
    for (const f of readdirSync(folder)) {
      if (f.startsWith('temp_')) {
        try {
          unlinkSync(join(folder, f))
          sendLog(`Removed temp file: ${f}`)
        } catch (e) {
          // file may be locked/gone — ignore
        }
      }
    }
  } catch (e) {
    // folder unreadable — ignore
  }
}

// Probe a media file's duration (seconds) by parsing ffmpeg's stderr banner.
// Returns null if it can't be determined. ffmpeg exits non-zero here because
// no output is specified, which is expected — we only want the banner.
function getMediaDuration(ffmpegPath, file) {
  return new Promise((resolve) => {
    if (!existsSync(ffmpegPath)) {
      resolve(null)
      return
    }
    const child = spawn(ffmpegPath, ['-i', file], { windowsHide: true })
    let buf = ''
    child.stderr.on('data', (c) => (buf += c.toString('utf-8')))
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const m = buf.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!m) return resolve(null)
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]))
    })
  })
}

// ---------------------------------------------------------------------------
// Download orchestration
// ---------------------------------------------------------------------------
function videoCodecPref(params) {
  return params?.codec === 'h264' ? 'h264' : 'best'
}

function videoFormatSelector(maxHeight, codec) {
  if (codec === 'h264') {
    const h = Math.min(maxHeight, 1080)
    return (
      `bv[vcodec^=avc1][height<=${h}]+ba[acodec^=mp4a]/` +
      `bv[vcodec^=avc1][height<=${h}]+ba/` +
      `b[vcodec^=avc1][height<=${h}]`
    )
  }
  return `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`
}

function codecLogLine(codec) {
  return codec === 'h264'
    ? 'Codec: H.264 + AAC (NLE-compatible · 1080p max)'
    : 'Codec: Best available (AV1/VP9 + Opus)'
}

async function handleDownload(params) {
  const { url, format, useRange, start, end } = params
  const byChapters = !!params.byChapters
  // Write tags (and, for MP3, cover art) into the file. Defaults on.
  const embedMeta = params.embedMeta !== false

  if (!isYouTubeUrl(url)) {
    throw new Error('Please paste a valid YouTube link (youtube.com or youtu.be).')
  }
  const audioFormat = params.audioFormat === 'mp3' ? 'mp3' : 'wav'
  const videoQuality = ['4k', '2k', '1080'].includes(params.videoQuality)
    ? params.videoQuality
    : '1080'
  const codec = videoCodecPref(params)
  const ytdlp = getBinPath('yt-dlp.exe')
  const ffmpeg = getBinPath('ffmpeg.exe')
  // Prepended to every yt-dlp call so it can solve YouTube's JS challenge.
  const jsArgs = getJsRuntimeArgs()

  const outputFolder = store.get('outputFolder') || app.getPath('downloads')

  if (!existsSync(ytdlp)) {
    throw new Error(
      'yt-dlp.exe could not be found. If you have antivirus software, it may have ' +
        'quarantined it (a common false positive) — restore/allow the file, or reinstall the app.'
    )
  }

  // Max height per selected quality (yt-dlp picks the best available up to it).
  // YouTube has no native H.264 above 1080p — never re-encode, just cap.
  const requestedHeight = videoQuality === '4k' ? 2160 : videoQuality === '2k' ? 1440 : 1080
  const maxHeight = codec === 'h264' ? Math.min(requestedHeight, 1080) : requestedHeight
  const videoSelector = videoFormatSelector(maxHeight, codec)

  // ffmpeg audio encode args for the chosen audio format.
  const audioEncodeArgs =
    audioFormat === 'mp3'
      ? ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k']
      : ['-vn', '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2']
  const audioExt = audioFormat === 'mp3' ? 'mp3' : 'wav'

  if (format === 'audio') {
    sendLog(`Audio format: ${audioFormat === 'mp3' ? 'MP3 320 kbps' : 'WAV 44.1 kHz stereo'}`)
  } else {
    sendLog(`Video quality: up to ${maxHeight}p (best available), with audio → MP4`)
    sendLog(codecLogLine(codec))
  }

  // Validate & normalize the trim range up front so bad input fails clearly
  // instead of silently producing a tiny/empty file.
  let startSec = 0
  let endSec = 0
  if (useRange) {
    startSec = parseTimeToSeconds(start)
    endSec = parseTimeToSeconds(end)
    if (startSec == null) {
      throw new Error(`Invalid Start time "${start}". Use hh:mm:ss, mm:ss or seconds.`)
    }
    if (endSec == null) {
      throw new Error(`Invalid End time "${end}". Use hh:mm:ss, mm:ss or seconds.`)
    }
    if (endSec <= startSec) {
      throw new Error(
        `End (${secondsToStamp(endSec)}) must be greater than Start (${secondsToStamp(startSec)}).`
      )
    }
    sendLog(
      `Trim range: ${secondsToStamp(startSec)} → ${secondsToStamp(endSec)} ` +
        `(${secondsToStamp(endSec - startSec)} long)`
    )
  }

  const startStamp = secondsToStamp(startSec)
  const endStamp = secondsToStamp(endSec)
  const stamp = `${safeStamp(start)}-${safeStamp(end)}`

  // Warn (and clamp end) if the requested range exceeds the media length.
  const checkRangeAgainstMedia = async (file) => {
    const dur = await getMediaDuration(ffmpeg, file)
    if (dur == null) return endStamp
    sendLog(`Source length: ${secondsToStamp(dur)}`)
    if (startSec >= dur) {
      throw new Error(
        `Start (${startStamp}) is past the end of the media (${secondsToStamp(dur)}). ` +
          `Nothing to trim — check your time values (fields are hh:mm:ss).`
      )
    }
    if (endSec > dur + 0.5) {
      sendLog(
        `WARNING: End (${endStamp}) is beyond the media length (${secondsToStamp(dur)}). ` +
          `Clamping to ${secondsToStamp(dur)}.`
      )
      return secondsToStamp(dur)
    }
    return endStamp
  }

  // Chapter split: download the full media ONCE, then slice each chapter into
  // its own file with ffmpeg. Mutually exclusive with trim (guarded here + UI).
  if (byChapters && !useRange) {
    if (!existsSync(ffmpeg)) throw new Error('ffmpeg.exe is missing from the bundled resources.')
    sendLog('Fetching chapter list...')
    const { title, chapters } = await fetchChapters(ytdlp, url)
    if (cancelRequested) throw new Error(CANCELLED)
    if (!chapters.length) {
      throw new Error('This video has no chapters to split.')
    }
    sendLog(`Found ${chapters.length} chapters. Downloading the full ${format} once...`)

    // 1. download the full media once to a temp file
    if (format === 'audio') {
      await runBinary(ytdlp, [...jsArgs, '-f', '251', '--no-playlist', '-o', 'temp_%(id)s.%(ext)s', url], outputFolder)
    } else {
      await runBinary(
        ytdlp,
        [
          ...jsArgs,
          '-f',
          videoSelector,
          '--no-playlist',
          '--merge-output-format',
          'mp4',
          '--ffmpeg-location',
          ffmpeg,
          '-o',
          'temp_%(id)s.%(ext)s',
          url
        ],
        outputFolder
      )
    }

    try {
      const temp = findTempFile(
        outputFolder,
        format === 'audio' ? ['.webm', '.m4a', '.opus'] : ['.mp4', '.mkv', '.webm']
      )
      if (!temp) throw new Error('Could not locate the downloaded temp file.')
      const source = temp
      const dur = await getMediaDuration(ffmpeg, source)

      const destDir = join(outputFolder, sanitizeFilename(title, 'chapters'))
      mkdirSync(destDir, { recursive: true })

      const ext = format === 'audio' ? audioExt : 'mp4'
      const encodeArgs = format === 'audio' ? audioEncodeArgs : ['-c', 'copy']
      const width = String(chapters.length).length

      for (let i = 0; i < chapters.length; i++) {
        if (cancelRequested) throw new Error(CANCELLED)
        const ch = chapters[i]
        const startS = ch.start
        let endS = ch.end
        if (endS == null || !(endS > startS)) {
          endS = i + 1 < chapters.length ? chapters[i + 1].start : dur != null ? dur : startS
        }
        if (dur != null && endS > dur) endS = dur
        if (!(endS > startS)) continue

        const num = String(i + 1).padStart(width, '0')
        const chTitle = sanitizeFilename(ch.title, `Chapter ${i + 1}`)
        const outName = join(destDir, `${num} - ${chTitle}.${ext}`)
        const pct = Math.round(((i + 1) / chapters.length) * 100)
        sendLog(
          `Splitting chapter ${i + 1}/${chapters.length}: ${ch.title || `Chapter ${i + 1}`} (${pct}%)`
        )
        await runBinary(
          ffmpeg,
          ['-y', '-i', source, '-ss', secondsToStamp(startS), '-to', secondsToStamp(endS), ...encodeArgs, outName],
          outputFolder
        )
      }
      sendLog(`Saved ${chapters.length} chapter files to: ${destDir}`)
    } finally {
      cleanupTempFiles(outputFolder)
    }
    return
  }

  if (format === 'audio' && !useRange) {
    const already = existingOutputForTitle(outputFolder, params.title, audioFormat)
    if (already) {
      sendLog(`${already} has already been downloaded`)
      return
    }
    // Direct audio extraction to the chosen format.
    const args = [...jsArgs, '-x', '--no-playlist', '--audio-format', audioFormat, '--ffmpeg-location', ffmpeg]
    if (audioFormat === 'mp3') {
      args.push('--audio-quality', '320K')
    } else {
      // WAV: force 44.1 kHz / 16-bit stereo.
      args.push('--postprocessor-args', 'ffmpeg:-ar 44100 -ac 2 -c:a pcm_s16le')
    }
    if (embedMeta) {
      // Tags (title/artist/etc.) for both; cover art only for MP3 — the WAV
      // (RIFF) container can't reliably carry an embedded picture.
      args.push('--embed-metadata')
      if (audioFormat === 'mp3') args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg')
      sendLog(`Embedding metadata${audioFormat === 'mp3' ? ' + cover art' : ''}.`)
    }
    args.push('--windows-filenames', '--trim-filenames', '200', '--no-overwrites')
    args.push('-o', mediaOutputTemplate(false, audioFormat), url)
    await runBinary(ytdlp, args, outputFolder)
    return
  }

  if (format === 'audio' && useRange) {
    // 1. download best audio stream to a temp file
    await runBinary(ytdlp, [...jsArgs, '-f', '251', '--no-playlist', '-o', 'temp_%(id)s.%(ext)s', url], outputFolder)
    try {
      // 2. locate temp file
      const temp = findTempFile(outputFolder, ['.webm', '.m4a', '.opus'])
      if (!temp) throw new Error('Could not locate the downloaded temp audio file.')
      // 3. trim + convert to the chosen audio format
      const outName = join(outputFolder, `audio_${stamp}.${audioExt}`)
      if (!existsSync(ffmpeg)) throw new Error('ffmpeg.exe is missing from the bundled resources.')
      const effectiveEnd = await checkRangeAgainstMedia(temp)
      await runBinary(
        ffmpeg,
        ['-y', '-i', temp, '-ss', startStamp, '-to', effectiveEnd, ...audioEncodeArgs, outName],
        outputFolder
      )
    } finally {
      // 4. cleanup — always, even on error/cancel
      cleanupTempFiles(outputFolder)
    }
    return
  }

  if (format === 'video' && !useRange) {
    const already = existingOutputForTitle(outputFolder, params.title, 'mp4')
    if (already) {
      sendLog(`${already} has already been downloaded`)
      return
    }
    await runBinary(
      ytdlp,
      [
        ...jsArgs,
        '-f',
        videoSelector,
        '--no-playlist',
        '--ffmpeg-location',
        ffmpeg,
        '--merge-output-format',
        'mp4',
        '--windows-filenames',
        '--trim-filenames',
        '200',
        '--no-overwrites',
        '-o',
        mediaOutputTemplate(false, 'mp4'),
        url
      ],
      outputFolder
    )
    return
  }

  if (format === 'video' && useRange) {
    await runBinary(
      ytdlp,
      [
        ...jsArgs,
        '-f',
        videoSelector,
        '--no-playlist',
        '--merge-output-format',
        'mp4',
        '--ffmpeg-location',
        ffmpeg,
        '-o',
        'temp_%(id)s.%(ext)s',
        url
      ],
      outputFolder
    )
    try {
      const temp = findTempFile(outputFolder, ['.mp4', '.mkv', '.webm'])
      if (!temp) throw new Error('Could not locate the downloaded temp video file.')
      const outName = join(outputFolder, `video_${stamp}.mp4`)
      if (!existsSync(ffmpeg)) throw new Error('ffmpeg.exe is missing from the bundled resources.')
      const effectiveEnd = await checkRangeAgainstMedia(temp)
      await runBinary(
        ffmpeg,
        ['-y', '-i', temp, '-ss', startStamp, '-to', effectiveEnd, '-c', 'copy', outName],
        outputFolder
      )
    } finally {
      cleanupTempFiles(outputFolder)
    }
    return
  }

  throw new Error('Invalid download parameters.')
}

// Download selected tracks of a playlist. Files land in a subfolder named after
// the playlist. Prefer explicit watch URLs — `--playlist-items` is the YouTube
// playlist index, which drifts when videos are private/deleted and is why the
// UI selection used to download the wrong tracks.
async function handlePlaylistDownload(params) {
  const { url } = params
  const trackUrls = youtubeTrackUrls(params)
  if (!trackUrls.length && !isPlaylistUrl(url)) {
    throw new Error('Please paste a valid YouTube playlist link.')
  }
  const format = params.format === 'video' ? 'video' : 'audio'
  const audioFormat = params.audioFormat === 'mp3' ? 'mp3' : 'wav'
  const videoQuality = ['4k', '2k', '1080'].includes(params.videoQuality)
    ? params.videoQuality
    : '1080'
  const codec = videoCodecPref(params)
  const embedMeta = params.embedMeta !== false

  const ytdlp = getBinPath('yt-dlp.exe')
  const ffmpeg = getBinPath('ffmpeg.exe')
  const jsArgs = getJsRuntimeArgs()
  const outputFolder = store.get('outputFolder') || app.getPath('downloads')

  if (!existsSync(ytdlp)) {
    throw new Error(
      'yt-dlp.exe could not be found. If you have antivirus software, it may have ' +
        'quarantined it (a common false positive) — restore/allow the file, or reinstall the app.'
    )
  }
  if (!existsSync(ffmpeg)) {
    throw new Error('ffmpeg.exe is missing from the bundled resources.')
  }

  const requestedHeight = videoQuality === '4k' ? 2160 : videoQuality === '2k' ? 1440 : 1080
  const maxHeight = codec === 'h264' ? Math.min(requestedHeight, 1080) : requestedHeight
  const videoSelector = videoFormatSelector(maxHeight, codec)

  const args = [
    ...jsArgs,
    trackUrls.length ? '--no-playlist' : '--yes-playlist',
    '--ignore-errors',
    '--ffmpeg-location',
    ffmpeg,
    '--windows-filenames',
    '--trim-filenames',
    '200',
    '--no-overwrites'
  ]

  if (format === 'audio') {
    args.push('-x', '--audio-format', audioFormat)
    if (audioFormat === 'mp3') {
      args.push('--audio-quality', '320K')
    } else {
      args.push('--postprocessor-args', 'ffmpeg:-ar 44100 -ac 2 -c:a pcm_s16le')
    }
    if (embedMeta) {
      args.push('--embed-metadata')
      if (audioFormat === 'mp3') args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg')
    }
    sendLog(
      `Playlist audio: ${audioFormat === 'mp3' ? 'MP3 320 kbps' : 'WAV 44.1 kHz'}` +
        `${embedMeta ? ' · embedding metadata' : ''}`
    )
  } else {
    args.push('-f', videoSelector, '--merge-output-format', 'mp4')
    sendLog(`Playlist video: up to ${maxHeight}p (best available) → MP4`)
    sendLog(codecLogLine(codec))
  }

  // Subfolder named after the playlist, one file per track inside it.
  const folder = sanitizeFilename(params?.title, 'playlist').replace(/%/g, '_')
  const ext = format === 'audio' ? audioFormat : 'mp4'
  args.push('-o', `${folder}/%(title)s.${ext}`)

  let batchFile = null
  if (trackUrls.length) {
    batchFile = join(app.getPath('temp'), `evrohq-pl-${Date.now()}.txt`)
    writeFileSync(batchFile, `${trackUrls.join('\n')}\n`, 'utf8')
    args.push('--batch-file', batchFile)
    sendLog(`Downloading ${trackUrls.length} selected track${trackUrls.length === 1 ? '' : 's'}.`)
  } else {
    args.push(url)
  }

  try {
    await runBinary(ytdlp, args, outputFolder)
  } catch (err) {
    if (err.message === CANCELLED || cancelRequested) throw err
    // With --ignore-errors, a non-zero exit means some items were skipped
    // (private/deleted/region-locked). Treat that as completed-with-warnings.
    if (/exited with code/i.test(err.message)) {
      sendLog('Some items could not be downloaded and were skipped — see the log above.')
      return
    }
    throw err
  } finally {
    if (batchFile) {
      try {
        unlinkSync(batchFile)
      } catch (e) {
        // temp file
      }
    }
  }
}

async function handleSoundCloudDownload(params, { playlist } = { playlist: false }) {
  const url = params?.url
  if (!isSoundCloudUrl(url)) {
    throw new Error('Please paste a valid SoundCloud link.')
  }

  const format = params?.format === 'wav' ? 'wav' : 'original'
  const ytdlp = getBinPath('yt-dlp.exe')
  const ffmpeg = getBinPath('ffmpeg.exe')
  const jsArgs = getJsRuntimeArgs()
  const outputFolder = store.get('outputFolder') || app.getPath('downloads')

  if (!existsSync(ytdlp)) {
    throw new Error(
      'yt-dlp.exe could not be found. If you have antivirus software, it may have ' +
        'quarantined it (a common false positive) — restore/allow the file, or reinstall the app.'
    )
  }
  if (format === 'wav' && !existsSync(ffmpeg)) {
    throw new Error('ffmpeg.exe is missing from the bundled resources.')
  }

  if (!playlist) {
    let already = existingOutputForTitle(
      outputFolder,
      params.title,
      format === 'wav' ? 'wav' : null
    )
    if (!already && format !== 'wav') {
      const printed = await getProcessOutput(ytdlp, [
        ...jsArgs,
        '--windows-filenames',
        '--trim-filenames',
        '200',
        '--no-playlist',
        '-f',
        'bestaudio',
        '-o',
        mediaOutputTemplate(false, null),
        '--skip-download',
        '--print',
        'filename',
        url
      ])
      const rel = (printed || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !/^ERROR/i.test(l) && !l.startsWith('{'))
      if (rel && existsSync(join(outputFolder, rel))) already = join(outputFolder, rel)
    }
    if (already) {
      sendLog(`${already} has already been downloaded`)
      return
    }
  }

  sendLog('Platform: SoundCloud')
  const skippedNames = Array.isArray(params?.skippedTracks)
    ? params.skippedTracks.map((s) => String(s || '').trim()).filter(Boolean)
    : []
  if (playlist && skippedNames.length) {
    sendLog(
      `${skippedNames.length} track${skippedNames.length === 1 ? '' : 's'} skipped — DRM-protected on SoundCloud (not downloadable): ${skippedNames.join(', ')}`
    )
  }
  const label = params?.title
    ? params.artist
      ? `${params.title} by ${params.artist}`
      : params.title
    : null
  if (playlist) {
    const n = Number.isFinite(params?.itemCount) ? params.itemCount : null
    sendLog(
      `Downloading: ${label || 'playlist'}${n ? ` (${n} track${n === 1 ? '' : 's'})` : ''}...`
    )
  } else {
    sendLog(`Downloading: ${label || 'SoundCloud track'}...`)
  }
  sendLog(format === 'wav' ? 'Format: WAV uncompressed' : 'Format: Original · best available')

  const args = [
    ...jsArgs,
    '--windows-filenames',
    '--trim-filenames',
    '200',
    '--no-overwrites'
  ]

  const trackUrls = playlist ? soundCloudTrackUrls(params) : []

  if (playlist && trackUrls.length) {
    // Permalinks, not playlist indexes: yt-dlp's set extract uses api-v2
    // /tracks/ID for stubs, and those 403 even when the public page streams.
    args.push('--no-playlist', '--ignore-errors')
  } else if (playlist) {
    args.push('--yes-playlist', '--ignore-errors')
    const items = soundCloudPlaylistItems(params)
    if (items) args.push('--playlist-items', items)
  } else {
    args.push('--no-playlist')
  }

  if (format === 'wav') {
    args.push('-x', '--audio-format', 'wav', '--ffmpeg-location', ffmpeg)
    args.push('--postprocessor-args', 'ffmpeg:-ar 44100 -ac 2 -c:a pcm_s16le')
  } else {
    args.push('-f', 'bestaudio/best')
  }

  const outTmpl = playlist
    ? soundCloudPlaylistOutputTemplate(params, format === 'wav' ? 'wav' : null)
    : mediaOutputTemplate(false, format === 'wav' ? 'wav' : null)
  args.push('-o', outTmpl)
  if (playlist && trackUrls.length) args.push(...trackUrls)
  else args.push(url)

  try {
    await runBinary(ytdlp, args, outputFolder)
  } catch (err) {
    if (err.message === CANCELLED || cancelRequested) throw err
    if (playlist && /exited with code/i.test(err.message)) {
      sendLog('Some items could not be downloaded and were skipped — see the log above.')
      return
    }
    throw err
  }
}

async function runSoundCloudIpc(params, { playlist }) {
  cancelRequested = false
  const itemCount = playlist
    ? Number.isFinite(params?.itemCount)
      ? params.itemCount
      : Array.isArray(params?.selectedTracks)
        ? params.selectedTracks.length
        : null
    : 1
  const details = {
    platform: telemetryPlatform(params?.url),
    url: params?.url || null,
    format: params?.format === 'wav' ? 'wav' : 'original',
    quality: params?.format === 'wav' ? 'wav' : 'original',
    codec: null,
    playlist: !!playlist,
    item_count: itemCount || 1,
    trim: false,
    by_chapters: false,
    chapter_count: null
  }
  try {
    beginSkipTracker()
    await handleSoundCloudDownload(params, { playlist })
    sendLog(playlist ? 'Playlist download finished.' : 'Download finished successfully.')
    const skipped = skippedExistingResult(playlist)
    sendComplete({
      success: true,
      message: skipped?.message || (playlist ? 'Playlist download complete!' : 'Download complete!'),
      alreadyDownloaded: !!skipped
    })
    sendTelemetry('download', { ...details, success: true })
    return { success: true }
  } catch (err) {
    endSkipTracker()
    if (err.message === CANCELLED || cancelRequested) {
      sendLog(playlist ? 'Playlist download cancelled by user.' : 'Download cancelled by user.')
      sendComplete({ success: false, cancelled: true, message: 'Download cancelled' })
      sendTelemetry('download', { ...details, success: false, error: 'cancelled' })
      return { success: false, cancelled: true }
    }
    sendLog(`ERROR: ${err.message}`)
    sendComplete({ success: false, message: err.message })
    sendTelemetry('download', { ...details, success: false, error: err.message })
    return { success: false, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  const folder = result.filePaths[0]
  store.set('outputFolder', folder)
  return folder
})

const THEME_IDS = [
  'evrohq',
  'graphite-amber',
  'carbon-cyan',
  'paper-rust',
  'bone-forest',
  'obsidian-violet',
  'charcoal-red'
]

ipcMain.handle('get-config', () => {
  const theme = store.get('theme')
  const platform = store.get('platform')
  return {
    outputFolder: store.get('outputFolder') || app.getPath('downloads'),
    version: app.getVersion(),
    telemetryEnabled: store.get('telemetryEnabled') !== false,
    theme: THEME_IDS.includes(theme) ? theme : 'evrohq',
    codec: store.get('codec') === 'h264' ? 'h264' : 'best',
    platform: platform === 'soundcloud' ? 'soundcloud' : 'youtube',
    lastSeenVersion: typeof store.get('lastSeenVersion') === 'string' ? store.get('lastSeenVersion') : '',
    whatsNewAck: Array.isArray(store.get('whatsNewAck')) ? store.get('whatsNewAck').filter((id) => typeof id === 'string') : [],
    portable: isPortableBuild()
  }
})

ipcMain.handle('set-config', (_event, cfg) => {
  if (cfg && typeof cfg.outputFolder === 'string') {
    store.set('outputFolder', cfg.outputFolder)
  }
  if (cfg && typeof cfg.telemetryEnabled === 'boolean') {
    store.set('telemetryEnabled', cfg.telemetryEnabled)
  }
  if (cfg && typeof cfg.theme === 'string' && THEME_IDS.includes(cfg.theme)) {
    store.set('theme', cfg.theme)
  }
  if (cfg && (cfg.codec === 'best' || cfg.codec === 'h264')) {
    store.set('codec', cfg.codec)
  }
  if (cfg && (cfg.platform === 'youtube' || cfg.platform === 'soundcloud')) {
    store.set('platform', cfg.platform)
  }
  if (cfg && typeof cfg.lastSeenVersion === 'string') {
    store.set('lastSeenVersion', cfg.lastSeenVersion)
  }
  if (cfg && Array.isArray(cfg.whatsNewAck)) {
    store.set(
      'whatsNewAck',
      cfg.whatsNewAck.filter((id) => typeof id === 'string')
    )
  }
  return true
})

ipcMain.handle('track-link', (_event, which) => {
  if (which === 'madeby' || which === 'coffee' || which === 'star') {
    sendTelemetry('link_click', { link: which })
  }
  return true
})

ipcMain.handle('start-download', async (_event, params) => {
  cancelRequested = false
  const details = {
    platform: telemetryPlatform(params?.url),
    url: params?.url || null,
    format: params?.format || null,
    quality: params?.format === 'audio' ? params?.audioFormat || null : params?.videoQuality || null,
    codec: params?.format === 'video' ? (params?.codec === 'h264' ? 'h264' : 'best') : null,
    playlist: false,
    item_count: 1,
    trim: !!params?.useRange,
    by_chapters: !!params?.byChapters,
    chapter_count: Number.isFinite(params?.chapterCount) ? params.chapterCount : null
  }
  try {
    beginSkipTracker()
    sendLog(`Starting ${params.format} download...`)
    await handleDownload(params)
    sendLog('Download finished successfully.')
    const skipped = skippedExistingResult(false)
    sendComplete({
      success: true,
      message: skipped?.message || 'Download complete!',
      alreadyDownloaded: !!skipped
    })
    sendTelemetry('download', { ...details, success: true })
    return { success: true }
  } catch (err) {
    endSkipTracker()
    if (err.message === CANCELLED || cancelRequested) {
      sendLog('Download cancelled by user.')
      sendComplete({ success: false, cancelled: true, message: 'Download cancelled' })
      sendTelemetry('download', { ...details, success: false, error: 'cancelled' })
      return { success: false, cancelled: true }
    }
    sendLog(`ERROR: ${err.message}`)
    sendComplete({ success: false, message: err.message })
    sendTelemetry('download', { ...details, success: false, error: err.message })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('start-playlist-download', async (_event, params) => {
  cancelRequested = false
  const itemCount = Number.isFinite(params?.itemCount)
    ? params.itemCount
    : typeof params?.playlistItems === 'string'
      ? params.playlistItems.split(',').filter((s) => s.trim()).length
      : null
  const details = {
    platform: telemetryPlatform(params?.url),
    url: params?.url || null,
    format: params?.format || null,
    quality:
      params?.format === 'audio' ? params?.audioFormat || null : params?.videoQuality || null,
    codec: params?.format === 'video' ? (params?.codec === 'h264' ? 'h264' : 'best') : null,
    playlist: true,
    item_count: itemCount || null,
    trim: false,
    by_chapters: false,
    chapter_count: null
  }
  try {
    beginSkipTracker()
    sendLog('Starting playlist download...')
    await handlePlaylistDownload(params)
    sendLog('Playlist download finished.')
    const skipped = skippedExistingResult(true)
    sendComplete({
      success: true,
      message: skipped?.message || 'Playlist download complete!',
      alreadyDownloaded: !!skipped
    })
    sendTelemetry('download', { ...details, success: true })
    return { success: true }
  } catch (err) {
    endSkipTracker()
    if (err.message === CANCELLED || cancelRequested) {
      sendLog('Playlist download cancelled by user.')
      sendComplete({ success: false, cancelled: true, message: 'Download cancelled' })
      sendTelemetry('download', { ...details, success: false, error: 'cancelled' })
      return { success: false, cancelled: true }
    }
    sendLog(`ERROR: ${err.message}`)
    sendComplete({ success: false, message: err.message })
    sendTelemetry('download', { ...details, success: false, error: err.message })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('cancel-download', () => {
  cancelRequested = true
  if (currentChild) {
    sendLog('Stopping download...')
    killTree(currentChild)
  }
  return true
})

// Fetch the video's chapter list (without downloading) so the renderer can
// offer a "split by chapters" option only when chapters actually exist.
ipcMain.handle('get-chapters', async (_event, url) => {
  try {
    if (!isYouTubeUrl(url)) return { title: null, chapters: [] }
    const ytdlp = getBinPath('yt-dlp.exe')
    if (!existsSync(ytdlp)) return { title: null, chapters: [] }
    return await fetchChapters(ytdlp, url)
  } catch (e) {
    return { title: null, chapters: [], error: e.message }
  }
})

// Fetch a single video's display metadata (title, channel, duration, thumbnail)
// so the renderer can show a real preview before downloading.
ipcMain.handle('get-video-info', async (_event, url) => {
  try {
    if (!isYouTubeUrl(url)) return null
    const ytdlp = getBinPath('yt-dlp.exe')
    if (!existsSync(ytdlp)) return null
    return await fetchVideoInfo(ytdlp, url)
  } catch (e) {
    return { error: e.message }
  }
})

// Fetch a playlist's title and flat track list for the preview panel.
ipcMain.handle('get-playlist-info', async (_event, url) => {
  try {
    if (!isPlaylistUrl(url)) return null
    const ytdlp = getBinPath('yt-dlp.exe')
    if (!existsSync(ytdlp)) return null
    return await fetchPlaylistInfo(ytdlp, url)
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('fetch-metadata', async (_event, params) => {
  try {
    const url = params?.url
    const platform = params?.platform === 'soundcloud' ? 'soundcloud' : 'youtube'
    const ytdlp = getBinPath('yt-dlp.exe')
    if (!existsSync(ytdlp)) return { error: 'yt-dlp is missing.' }

    if (platform === 'soundcloud') {
      if (!isSoundCloudUrl(url)) return { error: 'Please paste a valid SoundCloud link.' }
      const meta = await fetchSoundCloudMeta(ytdlp, url)
      if (!meta) return { error: 'Could not load SoundCloud details.' }
      return meta
    }

    if (isPlaylistUrl(url)) {
      const info = await fetchPlaylistInfo(ytdlp, url)
      if (!info) return { error: 'Could not load playlist details.' }
      return { kind: 'playlist', ...info }
    }
    if (!isYouTubeUrl(url)) return { error: 'Please paste a valid YouTube link.' }
    const info = await fetchVideoInfo(ytdlp, url)
    if (!info) return { error: 'Could not load video details.' }
    return { kind: 'track', ...info, artist: info.channel }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('start-soundcloud-download', (_event, params) =>
  runSoundCloudIpc(params, { playlist: false })
)

ipcMain.handle('start-soundcloud-playlist-download', (_event, params) =>
  runSoundCloudIpc(params, { playlist: true })
)

// Compare the bundled/updated yt-dlp version against the latest GitHub release.
ipcMain.handle('check-ytdlp-update', async () => {
  try {
    const current = await getProcessOutput(getBinPath('yt-dlp.exe'), ['--version'])
    const res = await fetchText(YTDLP_LATEST_API)
    let latest = null
    try {
      latest = JSON.parse(res.body)?.tag_name || null
    } catch (e) {
      latest = null
    }
    const updateAvailable = !!(current && latest && compareYtdlpVersions(latest, current) > 0)
    return { current, latest, updateAvailable }
  } catch (e) {
    return { current: null, latest: null, updateAvailable: false, error: e.message }
  }
})

// Download the latest yt-dlp.exe into the writable user bin dir (preferred by
// getBinPath). Works without admin rights and survives app reinstalls.
ipcMain.handle('update-ytdlp', async () => {
  try {
    const dir = getUserBinDir()
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, 'yt-dlp.exe')
    sendLog('Updating yt-dlp...')
    await downloadFile(YTDLP_DOWNLOAD_URL, dest, 'yt-dlp')
    const version = await getProcessOutput(dest, ['--version'])
    sendLog(`yt-dlp updated to ${version || 'latest'}.`)
    return { success: true, version }
  } catch (e) {
    sendLog(`ERROR updating yt-dlp: ${e.message}`)
    return { success: false, error: e.message }
  }
})

// Quit and install a downloaded app update (electron-updater).
ipcMain.handle('install-update', () => {
  if (isPortableBuild()) return false
  autoUpdater.quitAndInstall()
  return true
})

// ---------------------------------------------------------------------------
// App auto-update (electron-updater, published via GitHub Releases)
// ---------------------------------------------------------------------------
function setupAutoUpdater() {
  // In a packaged (nsis) build this runs for real. In dev, electron-updater
  // normally no-ops — we force it with a dev config so the update-check flow
  // (and its logging) can be exercised with `npm run dev` too.
  if (!app.isPackaged) {
    try {
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.updateConfigPath = join(app.getAppPath(), 'dev-app-update.yml')
    } catch (e) {
      return
    }
  }

  // Silence electron-updater's built-in console logger (it dumps full stack
  // traces / HTTP headers to the terminal). We surface a clean one-liner to the
  // in-app log via the 'error' handler below instead.
  autoUpdater.logger = null

  const portable = isPortableBuild()
  // Packaged NSIS can download + install. Portable must not pull the Setup
  // installer — that would install the app, which is the opposite of portable.
  autoUpdater.autoDownload = app.isPackaged && !portable
  autoUpdater.autoInstallOnAppQuit = !portable

  // Everything below is silent — the only user-visible signal is the banner,
  // which appears only when an update is actually available/downloaded.
  autoUpdater.on('update-available', (info) => {
    if (portable) {
      sendAppUpdate({
        status: 'portable-available',
        version: info?.version,
        downloadUrl: portableDownloadUrl(info?.version)
      })
      return
    }
    sendAppUpdate({ status: 'available', version: info?.version })
  })
  autoUpdater.on('update-not-available', () => {
    sendAppUpdate({ status: 'none' })
  })
  autoUpdater.on('download-progress', (p) => {
    sendAppUpdate({ status: 'downloading', percent: Math.round(p?.percent || 0) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    sendAppUpdate({ status: 'downloaded', version: info?.version })
  })
  autoUpdater.on('error', () => {
    // Silently ignore (no network / no release yet / etc.).
  })

  autoUpdater.checkForUpdates().catch(() => {
    // no network / no release yet — ignore
  })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  migrateOldUserData()
  // Ensures Windows uses our icon (not the default Electron one) in the taskbar.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.evrohq.ytdownloader')
  }

  createWindow()

  // Silent startup check that both binaries exist.
  const ytdlp = getBinPath('yt-dlp.exe')
  const ffmpeg = getBinPath('ffmpeg.exe')
  setTimeout(() => {
    if (!existsSync(ytdlp)) {
      sendLog('ERROR: yt-dlp.exe not found at ' + ytdlp + ' — the build is incomplete.')
    }
    if (!existsSync(ffmpeg)) {
      sendLog('ERROR: ffmpeg.exe not found at ' + ffmpeg + ' — the build is incomplete.')
    }
    if (existsSync(ytdlp) && existsSync(ffmpeg)) {
      sendLog('Ready. Binaries detected. Paste a YouTube or SoundCloud URL to begin.')
    }
  }, 800)

  // Check for an app update (electron-updater / GitHub Releases).
  setupAutoUpdater()

  // Anonymous launch ping (opt-out). Fire-and-forget, never blocks startup.
  sendTelemetry('launch')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (currentChild) {
    try {
      currentChild.kill()
    } catch (e) {
      // ignore
    }
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
