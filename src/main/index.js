import { app, shell, BrowserWindow, ipcMain, dialog, net } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, unlinkSync, mkdirSync, renameSync, createWriteStream } from 'fs'
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
    codec: 'best'
  }
})

let mainWindow = null
let currentChild = null
let cancelRequested = false

// Mockup window: 1052 × 697, left column 462, preview 1fr, gap 22, pad 20.
const WINDOW_WIDTH = 1052
const WINDOW_HEIGHT = 697

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
    title: 'EvroHQ Youtube Downloader',
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

function sendLog(line) {
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
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: 'follow' })
    request.setHeader('User-Agent', HTTP_USER_AGENT)
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
    args.push('--windows-filenames', '--trim-filenames', '200')
    args.push('-o', '%(title)s.%(ext)s', url)
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
        '-o',
        '%(title)s.%(ext)s',
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

// Download selected tracks of a playlist in a single yt-dlp pass. Files land in
// a subfolder named after the playlist (%(playlist_title)s). `playlistItems` is
// a comma list of 1-based positions (e.g. "1,2,4"); empty means all items.
async function handlePlaylistDownload(params) {
  const { url } = params
  if (!isPlaylistUrl(url)) {
    throw new Error('Please paste a valid YouTube playlist link.')
  }
  const format = params.format === 'video' ? 'video' : 'audio'
  const audioFormat = params.audioFormat === 'mp3' ? 'mp3' : 'wav'
  const videoQuality = ['4k', '2k', '1080'].includes(params.videoQuality)
    ? params.videoQuality
    : '1080'
  const codec = videoCodecPref(params)
  const embedMeta = params.embedMeta !== false
  const playlistItems =
    typeof params.playlistItems === 'string' ? params.playlistItems.trim() : ''

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
    '--yes-playlist',
    '--ignore-errors',
    '--ffmpeg-location',
    ffmpeg,
    '--windows-filenames',
    '--trim-filenames',
    '200'
  ]
  if (playlistItems) args.push('--playlist-items', playlistItems)

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
  args.push('-o', '%(playlist_title)s/%(title)s.%(ext)s', url)

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
  return {
    outputFolder: store.get('outputFolder') || app.getPath('downloads'),
    version: app.getVersion(),
    telemetryEnabled: store.get('telemetryEnabled') !== false,
    theme: THEME_IDS.includes(theme) ? theme : 'evrohq',
    codec: store.get('codec') === 'h264' ? 'h264' : 'best'
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
    sendLog(`Starting ${params.format} download...`)
    await handleDownload(params)
    sendLog('Download finished successfully.')
    sendComplete({ success: true, message: 'Download complete!' })
    sendTelemetry('download', { ...details, success: true })
    return { success: true }
  } catch (err) {
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
    sendLog('Starting playlist download...')
    await handlePlaylistDownload(params)
    sendLog('Playlist download finished.')
    sendComplete({ success: true, message: 'Playlist download complete!' })
    sendTelemetry('download', { ...details, success: true })
    return { success: true }
  } catch (err) {
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

  // Don't actually pull down an installer while developing.
  autoUpdater.autoDownload = app.isPackaged
  autoUpdater.autoInstallOnAppQuit = true

  // Everything below is silent — the only user-visible signal is the banner,
  // which appears only when an update is actually available/downloaded.
  autoUpdater.on('update-available', (info) => {
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
      sendLog('Ready. Binaries detected. Paste a YouTube URL to begin.')
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
