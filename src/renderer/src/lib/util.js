/* -------------------------------------------------------------------------- */
/*  Links                                                                     */
/* -------------------------------------------------------------------------- */

const YT_HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com']
const SC_HOSTS = ['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com', 'soundcloud.app.goo.gl']
const SC_RESERVED = new Set(['discover', 'stream', 'search', 'you', 'pages', 'charts', 'upload', 'signin', 'login', 'signup', 'feed', 'messages', 'notifications', 'settings'])

export function toUrl(value) {
  let v = String(value ?? '').trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    return new URL(v)
  } catch {
    return null
  }
}

const hostOf = (u) => u.hostname.toLowerCase().replace(/^www\./, '')

export function isSoundCloudUrl(value) {
  const u = toUrl(value)
  return !!u && SC_HOSTS.includes(hostOf(u))
}

export function isSoundCloudCollectionUrl(value) {
  const u = toUrl(value)
  if (!u || !isSoundCloudUrl(value)) return false
  const host = hostOf(u)
  if (host === 'on.soundcloud.com' || host === 'soundcloud.app.goo.gl') return false
  const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (!parts.length) return false
  if (parts.includes('sets') || parts.includes('albums') || parts.includes('likes')) return true
  if (parts[0] === 'you') return parts[1] === 'likes' || parts[1] === 'sets' || parts[1] === 'albums'
  if (parts.length === 1) return !SC_RESERVED.has(parts[0].toLowerCase())
  if (parts.length === 2) {
    return ['tracks', 'popular-tracks', 'sets', 'albums', 'reposts', 'likes', 'comments'].includes(parts[1].toLowerCase())
  }
  return /\/(sets|albums|likes)(\/|$)/i.test(parts.join('/'))
}

function youTubeVideoId(u) {
  const host = hostOf(u)
  if (host === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0] || null
  if (u.pathname === '/watch') return u.searchParams.get('v')
  const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([\w-]+)/)
  return m ? m[2] : null
}

/**
 * What a pasted link points to (spec §5.1 "Link detection").
 * kind: 'unsupported' | 'vid' | 'plvid' | 'pl' | 'sc' | 'sctrack'
 *  - videoUrl: a clean single-video link (no list, no start time)
 *  - listUrl:  the playlist link, when there is one
 */
export function detectLink(raw) {
  const value = String(raw ?? '').trim()
  const u = toUrl(value)
  if (!u) return { kind: 'unsupported', url: value }
  const host = hostOf(u)
  if (SC_HOSTS.includes(host)) {
    return { kind: isSoundCloudCollectionUrl(value) ? 'sc' : 'sctrack', url: value }
  }
  if (!YT_HOSTS.includes(host)) return { kind: 'unsupported', url: value }
  const id = youTubeVideoId(u)
  const list = u.searchParams.get('list')
  // A YouTube Mix (list=RD…, start_radio) can't be opened as /playlist?list=
  // ("This playlist type is unviewable"); it only exists next to its video.
  const isMix = !!list && (/^RD/i.test(list) || u.searchParams.has('start_radio'))
  const listUrl = list
    ? isMix && id
      ? `https://www.youtube.com/watch?v=${id}&list=${list}`
      : `https://www.youtube.com/playlist?list=${list}`
    : null
  const videoUrl = id ? (host === 'youtu.be' ? `https://youtu.be/${id}` : `https://www.youtube.com/watch?v=${id}`) : null
  if (id && list) return { kind: 'plvid', url: value, videoUrl, listUrl }
  if (list) return { kind: 'pl', url: value, listUrl }
  if (id) return { kind: 'vid', url: value, videoUrl }
  return { kind: 'unsupported', url: value }
}

/* -------------------------------------------------------------------------- */
/*  Time                                                                      */
/* -------------------------------------------------------------------------- */

// 4360 → "1:12:40", 185 → "3:05"
export const hms = (s) => {
  s = Math.max(0, Math.round(Number(s) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const x = s % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + String(x).padStart(2, '0')
}

// 4360 → "01:12:40" (trim fields)
export const hms6 = (s) => {
  s = Math.max(0, Math.round(Number(s) || 0))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':')
}

export const parseT = (t) => {
  const [h, m, x] = String(t || '00:00:00').split(':').map(Number)
  return { sec: (h || 0) * 3600 + (m || 0) * 60 + (x || 0), bad: m > 59 || x > 59 }
}

// Trim input: digits only, last 6, padded, shifting in from the right.
export const fmtT = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(-6).padStart(6, '0')
  return `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4, 6)}`
}

// Spec §5.4 trim errors (null when the range is fine or trim is off).
export function trimError(cfg, duration) {
  if (!cfg.trimOn) return null
  const a = parseT(cfg.tStart)
  const b = parseT(cfg.tEnd)
  if (a.bad || b.bad) return 'Minutes and seconds only go up to 59.'
  if (duration > 0 && b.sec > duration) return `The range runs past the end. This video is ${hms(duration)} long.`
  if (a.sec >= b.sec) return 'End must be after start.'
  return null
}

/* -------------------------------------------------------------------------- */
/*  Sizes                                                                     */
/* -------------------------------------------------------------------------- */

// MB (Windows-style, 1024-based) → "566 MB" / "1.7 GB"
export const fmtMB = (m) => (m >= 1024 ? `${(m / 1024).toFixed(1)} GB` : m < 10 ? `${Math.max(0, m).toFixed(1)} MB` : `${Math.round(m)} MB`)

// Spec §5.3 "File size estimates", MB per minute.
export function ratePerMin(isSc, cfg) {
  if (isSc) return cfg.scfmt === 'wav' ? 10.1 : 2.3
  if (cfg.format === 'audio') return cfg.afmt === 'wav' ? 10.1 : 2.4
  return ({ 1080: 23.4, 1440: 46, 2160: 98 }[cfg.res] || 23.4) * (cfg.codec === 'best' ? 0.8 : 1)
}

// Container shown next to sizes.
export function containerOf(isSc, cfg) {
  if (isSc) return cfg.scfmt === 'wav' ? 'WAV' : 'M4A'
  if (cfg.format === 'audio') return cfg.afmt === 'wav' ? 'WAV' : 'MP3'
  return 'MP4'
}

// Short quality text for summaries: "1080p · H.264", "WAV", "Original".
export function qualityText(isSc, cfg) {
  if (isSc) return cfg.scfmt === 'wav' ? 'WAV' : 'Original'
  if (cfg.format === 'audio') return cfg.afmt === 'wav' ? 'WAV' : 'MP3 320'
  return `${cfg.res}p · ${cfg.codec === 'h264' ? 'H.264' : 'Best quality'}`
}

// "Artist - Title" → { a, t }; a title without a separator stays whole.
export function splitTitle(title, uploader) {
  const s = String(title || '').trim()
  const m = s.match(/^(.{1,60}?)\s+[-–—]\s+(.+)$/)
  if (m) return { a: m[1], t: m[2] }
  return { a: s || uploader || 'Untitled', t: '' }
}

/* -------------------------------------------------------------------------- */
/*  yt-dlp progress line → live stats                                         */
/* -------------------------------------------------------------------------- */

/* e.g. "[download]  12.3% of ~ 120.50MiB at  2.31MiB/s ETA 00:45 (frag 3/40)" */
const DL_UNITS = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, KB: 1e3, MB: 1e6, GB: 1e9 }

export function parseDlStats(line) {
  const m = line.match(
    /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)(?:\s+at\s+(?:([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)\/s|Unknown))?(?:\s+ETA\s+([\d:]+))?/
  )
  if (!m) return null
  const total = parseFloat(m[2]) * DL_UNITS[m[3]]
  return {
    done: (parseFloat(m[1]) / 100) * total,
    total,
    estimated: /\bof\s+~/.test(line),
    speed: m[4] ? parseFloat(m[4]) * DL_UNITS[m[5]] : null
  }
}

/* yt-dlp's speed is instantaneous and jumpy. Average it over time (memory
   grows 0.3 s → 3 s over the first seconds, so a silly first reading is
   forgotten fast, then it stays calm). */
export function smoothSpeed(prev, speed, now = Date.now()) {
  if (speed == null) return prev
  if (!prev) return { t: now, t0: now, speed }
  const dt = Math.max(0, (now - prev.t) / 1000)
  const tau = Math.min(3, Math.max(0.3, (now - prev.t0) / 1000))
  const k = 1 - Math.exp(-dt / tau)
  return { t: now, t0: prev.t0, speed: prev.speed + k * (speed - prev.speed) }
}

/* -------------------------------------------------------------------------- */
/*  Versions / What's new                                                     */
/* -------------------------------------------------------------------------- */

export function cmpVer(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}
