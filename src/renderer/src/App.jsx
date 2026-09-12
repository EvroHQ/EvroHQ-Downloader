import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import {
  Download,
  Clipboard,
  Music,
  Video,
  FolderOpen,
  Loader2,
  Check,
  Coffee,
  Star,
  Film,
  Square,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  Scissors,
  Lock,
  Sparkles,
  Maximize2,
  Minimize2
} from 'lucide-react'

const spring = { type: 'spring', stiffness: 420, damping: 34 }

const THEMES = [
  { id: 'evrohq', name: 'EvroHQ' },
  { id: 'graphite-amber', name: 'Graphite & Amber' },
  { id: 'carbon-cyan', name: 'Carbon & Cyan' },
  { id: 'obsidian-violet', name: 'Obsidian & Violet' },
  { id: 'charcoal-red', name: 'Charcoal & Signal Red' },
  { id: 'paper-rust', name: 'Paper & Rust' },
  { id: 'bone-forest', name: 'Bone & Forest' }
]

const LIGHT_THEMES = new Set(['paper-rust', 'bone-forest'])

/* What’s New — one block per app version. Add a new `{ id, version, items }`
   whenever package.json is bumped. Shown until Got it; ids already in
   whatsNewAck are skipped. Restart-to-update must not count as seen. */
const WHATS_NEW = [
  {
    id: '2.3.2-soundcloud',
    version: '2.3.0',
    items: [
      {
        title: 'SoundCloud',
        body: 'Paste a SoundCloud track or playlist in the same field as YouTube.'
      },
      {
        title: 'New name',
        body: 'The app is now EvroHQ Downloader — same app, YouTube plus SoundCloud.'
      }
    ]
  },
  {
    id: '2.3.4',
    version: '2.3.4',
    items: [
      {
        title: 'Compact window',
        body: 'Switch Default or Compact from the header icons. Embed and Split by chapters now share one row.'
      },
      {
        title: 'Right-click',
        body: 'Right-click the URL field for Cut, Copy, Paste, and Select All.'
      },
      {
        title: 'About',
        body: 'Open About next to Themes to read who I am, what this project is, and how to support it.'
      }
    ]
  }
]

function cmpVer(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

function unseenWhatsNew(ackIds, current) {
  if (!current) return []
  const seen = new Set(Array.isArray(ackIds) ? ackIds : [])
  return WHATS_NEW.filter((n) => !seen.has(n.id) && cmpVer(current, n.version) >= 0)
}

/* -------------------------------------------------------------------------- */
/*  URL helpers                                                               */
/* -------------------------------------------------------------------------- */

const YT_HOSTS = [
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com'
]

function toUrl(value) {
  let v = String(value ?? '').trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    return new URL(v)
  } catch {
    return null
  }
}

// A real single YouTube video link (lenient about a missing scheme).
function isYouTubeUrl(value) {
  const u = toUrl(value)
  if (!u) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (!YT_HOSTS.includes(host)) return false
  if (host === 'youtu.be') return u.pathname.length > 1
  if (u.pathname === '/watch') return u.searchParams.has('v')
  return /^\/(shorts|live|embed|v)\/[\w-]+/.test(u.pathname)
}

// A playlist / mix link.
function isPlaylistUrl(value) {
  const u = toUrl(value)
  if (!u) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (!YT_HOSTS.includes(host)) return false
  if (u.pathname === '/playlist' && u.searchParams.has('list')) return true
  return u.searchParams.has('list') || u.searchParams.has('start_radio')
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
  'settings'
])

function isSoundCloudUrl(value) {
  const u = toUrl(value)
  if (!u) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  return SC_HOSTS.includes(host)
}

function isSoundCloudCollectionUrl(value) {
  const u = toUrl(value)
  if (!u || !isSoundCloudUrl(value)) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'on.soundcloud.com' || host === 'soundcloud.app.goo.gl') return false
  const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (!parts.length) return false
  if (parts.includes('sets') || parts.includes('albums') || parts.includes('likes')) return true
  if (parts[0] === 'you') return parts[1] === 'likes' || parts[1] === 'sets' || parts[1] === 'albums'
  if (parts.length === 1) return !SC_RESERVED.has(parts[0].toLowerCase())
  if (parts.length === 2) {
    const second = parts[1].toLowerCase()
    return ['tracks', 'popular-tracks', 'sets', 'albums', 'reposts', 'likes', 'comments'].includes(second)
  }
  return /\/(sets|albums|likes)(\/|$)/i.test(parts.join('/'))
}

// YouTube Mix / radio (list=RD…) and Music albums (list=OLAK…) — keep as playlist.
function keepAsPlaylist(u) {
  const list = u.searchParams.get('list') || ''
  return u.searchParams.has('start_radio') || /^RD/i.test(list) || /^OLAK/i.test(list)
}

// Strip leftover extras from a watch URL so it stays a single video:
// playlist leftovers (watch?v=…&list=PLxxx), start time (?t=74s), share junk.
// Mix/radio, Music albums, and /playlist?list= are left alone.
function cleanYouTubeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return raw
  const work = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(work)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (!YT_HOSTS.includes(host)) return raw
    if (u.pathname === '/playlist') return raw
    if (keepAsPlaylist(u)) return raw
    const extraKeys = [...u.searchParams.keys()].filter((k) => k !== 'v')
    const hasJunk = extraKeys.length > 0 || (u.hash && u.hash.length > 1)
    if (!hasJunk) return raw
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v')
      return id ? `https://www.youtube.com/watch?v=${id}` : raw
    }
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://youtu.be/${id}` : raw
    }
    const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([\w-]+)/)
    if (m) return `https://www.youtube.com/${m[1]}/${m[2]}`
    return raw
  } catch {
    return raw
  }
}

function urlCleanNote(raw, cleaned) {
  if (!raw || raw === cleaned) return null
  const u = toUrl(raw)
  if (!u) return 'Extra parameters removed from the link.'
  if (u.searchParams.has('list') || u.searchParams.has('index')) {
    return 'Mix/playlist extras removed — this video only.'
  }
  if (
    u.searchParams.has('t') ||
    u.searchParams.has('start') ||
    u.searchParams.has('time_continue') ||
    /^#t=/i.test(u.hash || '')
  ) {
    return 'Start time removed from the link.'
  }
  return 'Extra parameters removed from the link.'
}

/* -------------------------------------------------------------------------- */
/*  Duration + size helpers                                                   */
/* -------------------------------------------------------------------------- */

const pad2 = (n) => String(n).padStart(2, '0')

function fmtClock(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

function fmtLong(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}h ${pad2(m)}min` : `${m}min`
}

// Auto-insert colons as the user types digits: "001030" -> "00:10:30".
function formatTimeInput(raw) {
  const d = String(raw).replace(/\D/g, '').slice(0, 6)
  if (d.length > 4) return `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4)}`
  if (d.length > 2) return `${d.slice(0, 2)}:${d.slice(2)}`
  return d
}

function parseTimeToSeconds(value) {
  const str = String(value ?? '').trim()
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

function trimRangeError(startValue, endValue) {
  const startSec = parseTimeToSeconds(startValue || '00:00:00')
  const endSec = parseTimeToSeconds(endValue || '00:00:00')
  if (startSec == null) return `Invalid Start time "${startValue}". Use hh:mm:ss, mm:ss or seconds.`
  if (endSec == null) return `Invalid End time "${endValue}". Use hh:mm:ss, mm:ss or seconds.`
  if (endSec <= startSec) {
    return `End (${fmtClock(endSec)}) must be greater than Start (${fmtClock(startSec)}).`
  }
  return null
}

// Compact view/like counts: 1200000 -> "1.2M".
function formatCount(n) {
  if (n == null || !Number.isFinite(n)) return null
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

// yt-dlp upload_date is "YYYYMMDD" — turn it into a rough "x months ago".
function relativeDate(yyyymmdd) {
  const s = String(yyyymmdd ?? '')
  if (!/^\d{8}$/.test(s)) return null
  const then = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
  const days = Math.floor((Date.now() - then.getTime()) / 86400000)
  if (days < 0) return null
  if (days < 1) return 'today'
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return `${w} week${w > 1 ? 's' : ''} ago`
  }
  if (days < 365) {
    const mo = Math.floor(days / 30)
    return `${mo} month${mo > 1 ? 's' : ''} ago`
  }
  const y = Math.floor(days / 365)
  return `${y} year${y > 1 ? 's' : ''} ago`
}

/* -------------------------------------------------------------------------- */
/*  App                                                                       */
/* -------------------------------------------------------------------------- */

export default function App() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('single') // 'single' | 'playlist'
  const [format, setFormat] = useState('audio')
  const [audioFormat, setAudioFormat] = useState('wav')
  const [videoQuality, setVideoQuality] = useState('1080')
  const [codec, setCodec] = useState('best')
  const [useRange, setUseRange] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [chapters, setChapters] = useState([])
  const [byChapters, setByChapters] = useState(false)
  const [urlCleaned, setUrlCleaned] = useState(false)
  const [urlCleanMsg, setUrlCleanMsg] = useState('')
  const [embedMeta, setEmbedMeta] = useState(true)
  const [outputFolder, setOutputFolder] = useState('')
  const [version, setVersion] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [playlistPos, setPlaylistPos] = useState(null)
  const [ytdlpUpdate, setYtdlpUpdate] = useState(null)
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false)
  const [appUpdate, setAppUpdate] = useState(null)
  const [theme, setTheme] = useState('evrohq')
  const [windowSize, setWindowSize] = useState('default')
  const [aboutOpen, setAboutOpen] = useState(false)
  const themeReady = useRef(false)
  const [whatsNew, setWhatsNew] = useState(null)
  const seenVersionRef = useRef('')
  const whatsNewAckRef = useRef([])
  const [scFormat, setScFormat] = useState('original')
  const [dlUi, setDlUi] = useState(null)
  const dlStreamsRef = useRef(1)

  // Real metadata for the preview panel (fetched via yt-dlp).
  const [videoInfo, setVideoInfo] = useState(null)
  const [playlistInfo, setPlaylistInfo] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [selected, setSelected] = useState(() => new Set())

  const previewReq = useRef(0)
  const chapterReq = useRef(0)
  const playlistPosRef = useRef(playlistPos)
  const dlPassRef = useRef(1)
  const dlLastPctRef = useRef(0)
  const dlShownRef = useRef(0)
  const extraDlRef = useRef(false)
  playlistPosRef.current = playlistPos

  const resetDownloadProgress = () => {
    dlPassRef.current = 1
    dlLastPctRef.current = 0
    dlShownRef.current = 0
    extraDlRef.current = false
    setProgress(0)
  }

  const urlState = useMemo(() => {
    if (!url.trim()) return null
    if (isSoundCloudUrl(url)) return isSoundCloudCollectionUrl(url) ? 'playlist' : 'single'
    if (isPlaylistUrl(url)) return 'playlist'
    if (isYouTubeUrl(url)) return 'single'
    return 'invalid'
  }, [url])
  const isSc = Boolean(url.trim()) && isSoundCloudUrl(url)

  /* --- lifecycle --------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false
    window.api?.getConfig().then((cfg) => {
      if (cancelled) return
      if (cfg?.outputFolder) setOutputFolder(cfg.outputFolder)
      if (cfg?.version) setVersion(cfg.version)
      if (cfg?.theme) setTheme(cfg.theme)
      if (cfg?.windowSize === 'compact' || cfg?.windowSize === 'default') setWindowSize(cfg.windowSize)
      if (cfg?.codec === 'h264' || cfg?.codec === 'best') setCodec(cfg.codec)
      themeReady.current = true
      const pending = unseenWhatsNew(cfg?.whatsNewAck, cfg?.version)
      if (pending.length) {
        seenVersionRef.current = cfg.version
        whatsNewAckRef.current = Array.isArray(cfg.whatsNewAck) ? cfg.whatsNewAck : []
        setWhatsNew({
          items: pending.flatMap((n) => n.items),
          ids: pending.map((n) => n.id)
        })
      }
    })

    const applyProgress = (value) => {
      const next = Math.min(99.9, Math.max(0, value))
      if (next + 0.05 < dlShownRef.current) return
      dlShownRef.current = next
      setProgress(next)
    }

    const offLog = window.api?.onLog((line) => {
      const item = line.match(/Downloading (?:item|video) (\d+) of (\d+)/i)
      if (item) {
        setPlaylistPos({ current: Number(item[1]), total: Number(item[2]) })
        playlistPosRef.current = { current: Number(item[1]), total: Number(item[2]) }
        dlPassRef.current = 1
        dlLastPctRef.current = 0
        extraDlRef.current = false
      }

      const streams = dlStreamsRef.current

      // yt-dlp video = video stream then audio stream, each 0–100%. A later
      // Destination (thumbnail, etc.) must not start a 3rd pass.
      if (/\[download\].*Destination:/i.test(line) && dlLastPctRef.current > 8) {
        if (dlPassRef.current < streams) {
          dlPassRef.current += 1
          dlLastPctRef.current = 0
        } else {
          extraDlRef.current = true
        }
      }

      const chapterPct = line.match(/Splitting chapter .*?\((\d+(?:\.\d+)?)%\)/)
      if (chapterPct) {
        applyProgress(parseFloat(chapterPct[1]))
      } else if (!extraDlRef.current) {
        const dl = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
        if (dl) {
          const raw = parseFloat(dl[1])
          if (
            raw + 12 < dlLastPctRef.current &&
            dlLastPctRef.current > 55 &&
            dlPassRef.current < streams
          ) {
            dlPassRef.current += 1
          }
          dlLastPctRef.current = raw
          const pass = Math.min(Math.max(dlPassRef.current, 1), streams)
          const within = (pass - 1 + raw / 100) / streams
          const pos = playlistPosRef.current
          const overall =
            pos && pos.total > 0
              ? ((Math.max(pos.current, 1) - 1 + within) / pos.total) * 100
              : within * 100
          applyProgress(overall)
        }
      }
      if (/^ERROR:/.test(line) && /not found/.test(line)) {
        toast.error(line.replace(/^ERROR:\s*/, ''))
      } else if (/were skipped/.test(line)) {
        toast.warning('Some items could not be downloaded and were skipped')
      }
    })

    const offComplete = window.api?.onComplete((payload) => {
      setDownloading(false)
      setStopping(false)
      setDlUi(null)
      const finished = payload.success && !payload.alreadyDownloaded
      dlShownRef.current = finished ? 100 : 0
      setProgress(finished ? 100 : 0)
      setPlaylistPos(null)
      if (payload.cancelled) toast.info(payload.message || 'Download cancelled', { id: 'dl' })
      else if (payload.alreadyDownloaded) toast.info(payload.message || 'File already downloaded', { id: 'dl' })
      else if (payload.success) toast.success(payload.message || 'Download complete', { id: 'dl' })
      else toast.error(payload.message || 'Download failed', { id: 'dl' })
    })

    const offAppUpdate = window.api?.onAppUpdate((payload) => {
      setAppUpdate(payload)
      if (payload?.status === 'available' && payload.version) {
        toast.info(`App update ${payload.version} available`)
      } else if (payload?.status === 'downloaded' && payload.version) {
        toast.success(`Version ${payload.version} ready — restart to install`)
      }
    })

    window.api?.checkYtdlpUpdate().then((res) => {
      if (res?.updateAvailable) setYtdlpUpdate(res)
    })

    return () => {
      cancelled = true
      offLog && offLog()
      offComplete && offComplete()
      offAppUpdate && offAppUpdate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = LIGHT_THEMES.has(theme) ? 'light' : 'dark'
    if (themeReady.current) window.api?.setConfig({ theme })
  }, [theme])

  useEffect(() => {
    if (themeReady.current) window.api?.setConfig({ codec })
  }, [codec])

  const selectCodec = (next) => {
    setCodec(next)
    if (next === 'h264' && (videoQuality === '2k' || videoQuality === '4k')) {
      setVideoQuality('1080')
    }
  }

  // Follow the pasted URL into the matching preview mode.
  useEffect(() => {
    if (urlState === 'playlist') setMode('playlist')
    else if (urlState === 'single') setMode('single')
  }, [urlState])

  // Detect chapters on single videos only (debounced). Trim and chapter-split
  // are mutually exclusive.
  useEffect(() => {
    setChapters([])
    setByChapters(false)
    if (urlState !== 'single' || isSoundCloudUrl(url)) return
    const reqId = ++chapterReq.current
    const t = setTimeout(async () => {
      const res = await window.api?.getChapters(url.trim())
      if (chapterReq.current !== reqId) return
      setChapters(Array.isArray(res?.chapters) ? res.chapters : [])
    }, 600)
    return () => clearTimeout(t)
  }, [url, urlState])

  useEffect(() => {
    if (useRange) setByChapters(false)
  }, [useRange])

  const applyUrl = (raw) => {
    const next = String(raw ?? '').trim()
    if (isSoundCloudUrl(next)) {
      setUrl(next)
      setUrlCleaned(false)
      setUrlCleanMsg('')
      return
    }
    const cleaned = cleanYouTubeUrl(next)
    setUrl(cleaned)
    const note = urlCleanNote(next, cleaned)
    setUrlCleaned(Boolean(note))
    setUrlCleanMsg(note || '')
  }

  // Fetch real preview metadata whenever a valid URL settles (debounced, with a
  // request guard so a slow response can't overwrite a newer URL).
  useEffect(() => {
    const reqId = ++previewReq.current
    setPreviewError(null)
    if (urlState !== 'single' && urlState !== 'playlist') {
      setVideoInfo(null)
      setPlaylistInfo(null)
      setPreviewLoading(false)
      return
    }
    setPreviewLoading(true)
    if (urlState === 'single') {
      setVideoInfo(null)
    } else {
      setPlaylistInfo(null)
      setSelected(new Set())
    }

    const link = url.trim()
    const t = setTimeout(async () => {
      try {
        if (isSoundCloudUrl(link)) {
          const info = await window.api?.fetchMetadata({ platform: 'soundcloud', url: link })
          if (previewReq.current !== reqId) return
          if (info && !info.error && info.kind === 'playlist' && info.tracks?.length) {
            setPlaylistInfo(info)
            setVideoInfo(null)
            setSelected(new Set(info.tracks.filter((tr) => !tr.protected).map((tr) => tr.id)))
            setMode('playlist')
          } else if (info && !info.error && info.kind !== 'playlist') {
            setVideoInfo({
              id: info.id,
              title: info.title,
              channel: info.artist,
              duration: info.duration,
              thumbnail: info.thumbnail,
              genre: info.genre || null,
              views: info.plays ?? null,
              source: 'soundcloud'
            })
            setPlaylistInfo(null)
            setMode('single')
          } else {
            setPreviewError(info?.error || 'Could not load SoundCloud details.')
          }
        } else if (urlState === 'single') {
          const info = await window.api?.getVideoInfo(link)
          if (previewReq.current !== reqId) return
          if (info && !info.error) setVideoInfo(info)
          else setPreviewError('Could not load video details.')
        } else {
          const info = await window.api?.getPlaylistInfo(link)
          if (previewReq.current !== reqId) return
          if (info && !info.error && info.tracks?.length) {
            setPlaylistInfo(info)
            setSelected(new Set(info.tracks.map((tr) => tr.id)))
          } else {
            setPreviewError('Could not load playlist details.')
          }
        }
      } catch (e) {
        if (previewReq.current === reqId) setPreviewError(e.message)
      } finally {
        if (previewReq.current === reqId) setPreviewLoading(false)
      }
    }, 550)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, urlState])

  useEffect(() => {
    if (!isSc) return
    setFormat('audio')
    setUseRange(false)
    setByChapters(false)
  }, [isSc])

  /* --- derived ----------------------------------------------------------- */
  const perHourMB = isSc
    ? scFormat === 'wav'
      ? 620
      : 58
    : format === 'video'
      ? videoQuality === '4k'
        ? 6000
        : videoQuality === '2k'
          ? 2800
          : 1400
      : audioFormat === 'wav'
        ? 620
        : 145

  const formatLabel = isSc
    ? scFormat === 'wav'
      ? 'WAV'
      : 'Original'
    : format === 'video'
      ? 'MP4'
      : audioFormat === 'wav'
        ? 'WAV'
        : 'MP3'

  const estSizeLabel = (seconds) => {
    const mb = (seconds / 3600) * perHourMB
    const gb = mb / 1024
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(mb)} MB`
  }

  const playlistTracks = playlistInfo?.tracks ?? []
  const totalSecs = playlistTracks.reduce((a, t) => a + (t.duration || 0), 0)
  const selectedSecs = playlistTracks
    .filter((t) => selected.has(t.id))
    .reduce((a, t) => a + (t.duration || 0), 0)

  const singleValid = Boolean(url.trim()) && (isYouTubeUrl(url) || isSoundCloudUrl(url))
  const canDownload =
    mode === 'playlist' ? selected.size > 0 && !downloading : singleValid && !downloading

  const formatWord = formatLabel
  const statusText = downloading
    ? stopping
      ? 'Stopping…'
      : dlUi?.platform === 'soundcloud'
        ? dlUi.playlist
          ? `Downloading ${playlistPos ? `${playlistPos.current}/${playlistPos.total}` : `0/${dlUi.selectedCount}`} · ${dlUi.formatWord}`
          : `Downloading · ${dlUi.converting}`
        : mode === 'playlist'
          ? `Downloading ${playlistPos ? `${playlistPos.current}/${playlistPos.total}` : `0/${selected.size}`} · ${formatWord}`
          : `Downloading · ${format === 'video'
            ? 'preparing MP4'
            : audioFormat === 'wav'
              ? 'converting to WAV'
              : 'converting to MP3'
          }`
    : 'Idle — ready to download'

  const activeBanner =
    appUpdate?.status === 'downloading'
      ? {
        key: 'app-dl',
        title: 'Downloading update…',
        subtitle: `Version ${appUpdate.version || ''} — installing automatically when ready.`.trim(),
        progress: appUpdate.percent ?? 0
      }
      : appUpdate?.status === 'downloaded'
        ? {
          key: 'app',
          title: 'App update ready',
          subtitle: `Version ${appUpdate.version} downloaded — restart to install.`,
          actionLabel: 'Restart now',
          onAction: () => window.api?.installUpdate()
        }
        : appUpdate?.status === 'portable-available'
          ? {
            key: 'app-portable',
            title: 'App update available',
            subtitle: `Version ${appUpdate.version || ''} — download the portable .exe. This build will not install.`.trim(),
            actionLabel: 'Download',
            onAction: () => {
              const href =
                appUpdate.downloadUrl ||
                'https://github.com/EvroHQ/EvroHQ-Downloader/releases/latest'
              window.open(href, '_blank', 'noopener,noreferrer')
            }
          }
          : ytdlpUpdate
            ? {
              key: 'ytdlp',
              title: 'yt-dlp update available',
              subtitle: `Installed ${ytdlpUpdate.current} · latest ${ytdlpUpdate.latest} — keeps YouTube downloads working.`,
              actionLabel: updatingYtdlp ? 'Updating…' : 'Update now',
              busy: updatingYtdlp,
              onAction: handleUpdateYtdlp
            }
            : null

  /* --- handlers ---------------------------------------------------------- */
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) applyUrl(text)
    } catch {
      toast.error('Could not read clipboard')
    }
  }

  const handleChangeFolder = async () => {
    const folder = await window.api?.selectFolder()
    if (folder) setOutputFolder(folder)
  }

  const handleDownload = async () => {
    if (!canDownload) return
    const link = url.trim()

    if (isSc) {
      const scWord = scFormat === 'wav' ? 'WAV' : 'Original'
      dlStreamsRef.current = 1
      setDlUi({
        platform: 'soundcloud',
        playlist: mode === 'playlist',
        formatWord: scWord,
        converting: scFormat === 'wav' ? 'converting to WAV' : 'downloading original',
        selectedCount: selected.size
      })
      if (mode === 'playlist') {
        const chosen = playlistTracks.filter((t) => selected.has(t.id) && !t.protected)
        const selectedTracks = playlistTracks
          .map((t, i) => (selected.has(t.id) && !t.protected ? i + 1 : null))
          .filter(Boolean)
        const trackUrls = chosen
          .map((t) => {
            if (typeof t.url === 'string' && /^https?:\/\//i.test(t.url)) return t.url
            if (t.id && /^\d+$/.test(String(t.id))) {
              return `https://api-v2.soundcloud.com/tracks/${t.id}`
            }
            return null
          })
          .filter(Boolean)
        const skippedTracks = playlistTracks.filter((t) => t.protected).map((t) => t.title)
        setDownloading(true)
        setStopping(false)
        resetDownloadProgress()
        setPlaylistPos({ current: 0, total: selectedTracks.length })
        await window.api?.startSoundCloudPlaylistDownload({
          platform: 'soundcloud',
          url: link,
          format: scFormat,
          selectedTracks,
          trackUrls,
          skippedTracks,
          itemCount: selectedTracks.length,
          title: playlistInfo?.title,
          artist: playlistInfo?.artist
        })
        return
      }
      setDownloading(true)
      setStopping(false)
      resetDownloadProgress()
      await window.api?.startSoundCloudDownload({
        platform: 'soundcloud',
        url: link,
        format: scFormat,
        title: videoInfo?.title,
        artist: videoInfo?.channel
      })
      return
    }

    if (mode === 'single' && useRange && !byChapters) {
      const err = trimRangeError(start, end)
      if (err) {
        toast.error(err)
        return
      }
    }
    if (mode === 'playlist') {
      const chosen = playlistTracks.filter((t) => selected.has(t.id))
      const trackUrls = chosen
        .map((t) => {
          if (t.url && /^https?:\/\//i.test(t.url)) return t.url
          return t.id ? `https://www.youtube.com/watch?v=${t.id}` : null
        })
        .filter(Boolean)
      if (!trackUrls.length) {
        toast.error('Could not resolve the selected tracks.')
        return
      }
      setDownloading(true)
      setStopping(false)
      resetDownloadProgress()
      dlStreamsRef.current = format === 'video' ? 2 : 1
      setDlUi(null)
      setPlaylistPos({ current: 0, total: trackUrls.length })
      await window.api?.startPlaylistDownload({
        url: url.trim(),
        trackUrls,
        title: playlistInfo?.title,
        itemCount: trackUrls.length,
        format,
        audioFormat,
        videoQuality,
        codec,
        embedMeta
      })
      return
    }
    setDownloading(true)
    setStopping(false)
    resetDownloadProgress()
    dlStreamsRef.current = format === 'video' ? 2 : 1
    setDlUi(null)
    await window.api?.startDownload({
      url: url.trim(),
      format,
      audioFormat,
      videoQuality,
      codec,
      useRange: useRange && !byChapters,
      byChapters: byChapters && !useRange,
      chapterCount: chapters.length,
      embedMeta,
      start: start || '00:00:00',
      end: end || '00:00:00',
      title: videoInfo?.title
    })
  }

  const handleStop = async () => {
    setStopping(true)
    await window.api?.cancelDownload()
  }

  async function handleUpdateYtdlp() {
    setUpdatingYtdlp(true)
    toast.loading('Updating yt-dlp…', { id: 'ytdlp-update' })
    const res = await window.api?.updateYtdlp()
    setUpdatingYtdlp(false)
    if (res?.success) {
      setYtdlpUpdate(null)
      toast.success(`yt-dlp updated to ${res.version || 'latest'}`, { id: 'ytdlp-update' })
    } else {
      toast.error('yt-dlp update failed', { id: 'ytdlp-update' })
    }
  }

  const toggleTrack = (id) => {
    const track = playlistTracks.find((t) => t.id === id)
    if (track?.protected) {
      toast.error('This track is DRM-protected on SoundCloud and can’t be downloaded.')
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () =>
    setSelected(new Set(playlistTracks.filter((t) => !t.protected).map((t) => t.id)))
  const deselectAll = () => setSelected(new Set())

  const dismissWhatsNew = () => {
    const ids = whatsNew?.ids || []
    setWhatsNew(null)
    const v = seenVersionRef.current || version
    const ack = [...new Set([...(whatsNewAckRef.current || []), ...ids])]
    whatsNewAckRef.current = ack
    window.api?.setConfig({
      ...(v ? { lastSeenVersion: v } : {}),
      whatsNewAck: ack
    })
  }

  const selectWindowSize = (next) => {
    setWindowSize(next)
    window.api?.setWindowSize(next)
  }

  const compact = windowSize === 'compact'
  const spec = true

  const urlRing =
    urlState === null
      ? 'var(--border)'
      : urlState === 'invalid'
        ? 'rgba(239,68,68,0.45)'
        : 'var(--accent)'

  const downloadLabel =
    mode === 'playlist'
      ? selected.size > 0
        ? `Download all (${selected.size} tracks)`
        : 'Select tracks to download'
      : 'Download'

  // Embed toggle is available for audio (single) and playlists.
  const showEmbed = !isSc && ((mode === 'single' && format === 'audio') || mode === 'playlist')

  /* ---------------------------------------------------------------------- */
  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-base text-text-primary">
      {/* Ambient background */}
      <div className="amb">
        <span className="blob blob1" />
        <span className="blob blob2" />
        <span className="blob blob3" />
      </div>
      <div className="grain" />

      <div className={`relative z-10 flex min-h-0 flex-1 flex-col ${compact ? 'gap-2 p-2.5' : 'gap-3 p-5'}`}>
        {/* Update banner */}
        <AnimatePresence>
          {activeBanner && <UpdateBanner key={activeBanner.key} {...activeBanner} />}
        </AnimatePresence>

        {/* Everything below the banner is blocked while an update is pending */}
        <div className={`relative flex min-h-0 flex-1 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          <AnimatePresence>
            {activeBanner && appUpdate?.status !== 'portable-available' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`absolute z-20 cursor-not-allowed bg-black/72 backdrop-blur-[4px] ${compact ? '-inset-3' : '-inset-5'}`}
              />
            )}
          </AnimatePresence>

          {/* Top bar — brand on the left, version on the right */}
          <header className="flex shrink-0 items-center gap-3">
            <AppLogo />
            <div className="min-w-0">
              <h1 className={`text-[17px] font-bold leading-tight tracking-[-0.3px] ${LIGHT_THEMES.has(theme) ? 'text-black' : 'text-white'}`}>
                EvroHQ Downloader
              </h1>
              <p className="text-[12px] font-normal text-[var(--text-dim)]">
                YouTube &amp; SoundCloud · powered by yt-dlp &amp; ffmpeg
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <WindowSizeMenu value={windowSize} onChange={selectWindowSize} />
              <ThemeMenu value={theme} onChange={setTheme} />
              <button
                type="button"
                onClick={() => {
                  setAboutOpen(true)
                  window.api?.trackLink('about')
                }}
                className="chrome-chip px-2.5 py-1 text-[11px] font-medium transition-colors hover:text-[var(--text)]"
              >
                About
              </button>
              {version && (
                <span className="chrome-chip self-center px-2.5 py-1 font-mono text-[11px] font-medium">
                  v{version}
                </span>
              )}
            </div>
          </header>

          <div className={`grid min-h-0 flex-1 ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-[462px_minmax(0,1fr)] gap-[22px]'}`}>
            {/* LEFT — controls. Compact stacks everything (no scrollbar). */}
            <div className={`flex min-h-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
              <div className={`flex min-h-0 flex-col overflow-hidden ${compact ? 'gap-2' : 'flex-1 gap-3'}`}>
                {/* URL field */}
                <div>
                  <div
                    className={`flex items-center gap-2.5 px-4 transition-colors ${compact ? 'py-1.5' : 'py-2'} ${spec ? 'rounded-[10px] bg-[var(--surface)]' : 'rounded-2xl bg-white/[0.04] focus-within:bg-white/[0.06]'
                      }`}
                    style={{ border: `1px solid ${urlRing}` }}
                  >
                    <input
                      value={url}
                      onChange={(e) => applyUrl(e.target.value)}
                      placeholder="Paste a YouTube or SoundCloud link…"
                      className={`flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none ${spec ? 'font-mono text-[13px]' : 'text-sm'}`}
                    />
                    <button
                      onClick={handlePaste}
                      title="Paste from clipboard"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--sunken)] text-[var(--text-dim)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    >
                      <Clipboard size={15} />
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {urlCleaned && (
                      <motion.p
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--text-dim)]"
                      >
                        <Scissors size={11} className="shrink-0 text-accentMid" />
                        {urlCleanMsg}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Format */}
                <div>
                  <SectionLabel compact={compact}>Format</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <FormatCard
                      spec={spec}
                      compact={compact}
                      active={format === 'audio'}
                      onClick={() => setFormat('audio')}
                      icon={<Music size={compact ? 14 : 16} />}
                      title="Audio"
                      subtitle={
                        isSc
                          ? scFormat === 'wav'
                            ? 'WAV · uncompressed'
                            : 'Original · best available'
                          : audioFormat === 'wav'
                            ? 'WAV · 44.1 kHz'
                            : 'MP3 · 320 kbps'
                      }
                    />
                    <FormatCard
                      spec={spec}
                      compact={compact}
                      active={format === 'video'}
                      disabled={isSc}
                      hint={isSc ? 'SoundCloud is audio only' : undefined}
                      onClick={() => setFormat('video')}
                      icon={<Video size={compact ? 14 : 16} />}
                      title="Video"
                      subtitle={isSc ? 'Audio only' : codec === 'h264' ? 'MP4 · up to 1080p' : 'MP4 · up to 4K'}
                    />
                  </div>
                </div>

                {/* Quality pills */}
                {format === 'audio' ? (
                  spec ? (
                    <div className="flex rounded-[8px] border border-[var(--border)] bg-[var(--sunken)] p-[3px]">
                      {isSc ? (
                        <>
                          <Pill spec compact={compact} group="audio" active={scFormat === 'original'} onClick={() => setScFormat('original')}>
                            Original · best available
                          </Pill>
                          <Pill spec compact={compact} group="audio" active={scFormat === 'wav'} onClick={() => setScFormat('wav')}>
                            WAV · uncompressed
                          </Pill>
                        </>
                      ) : (
                        <>
                          <Pill spec compact={compact} group="audio" active={audioFormat === 'wav'} onClick={() => setAudioFormat('wav')}>
                            WAV · uncompressed
                          </Pill>
                          <Pill spec compact={compact} group="audio" active={audioFormat === 'mp3'} onClick={() => setAudioFormat('mp3')}>
                            MP3 · 320 kbps
                          </Pill>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {isSc ? (
                        <>
                          <Pill group="a" active={scFormat === 'original'} onClick={() => setScFormat('original')}>
                            Original · best available
                          </Pill>
                          <Pill group="a" active={scFormat === 'wav'} onClick={() => setScFormat('wav')}>
                            WAV · uncompressed
                          </Pill>
                        </>
                      ) : (
                        <>
                          <Pill group="a" active={audioFormat === 'wav'} onClick={() => setAudioFormat('wav')}>
                            WAV · uncompressed
                          </Pill>
                          <Pill group="a" active={audioFormat === 'mp3'} onClick={() => setAudioFormat('mp3')}>
                            MP3 · 320 kbps
                          </Pill>
                        </>
                      )}
                    </div>
                  )
                ) : spec ? (
                  <div className="flex rounded-[8px] border border-[var(--border)] bg-[var(--sunken)] p-[3px]">
                    <Pill spec compact={compact} group="quality" active={videoQuality === '1080'} onClick={() => setVideoQuality('1080')}>
                      1080p
                    </Pill>
                    <Pill
                      spec
                      compact={compact}
                      group="quality"
                      active={videoQuality === '2k'}
                      disabled={codec === 'h264'}
                      title={codec === 'h264' ? 'H.264 on YouTube tops out at 1080p' : undefined}
                      onClick={() => setVideoQuality('2k')}
                    >
                      2K · 1440p
                    </Pill>
                    <Pill
                      spec
                      compact={compact}
                      group="quality"
                      active={videoQuality === '4k'}
                      disabled={codec === 'h264'}
                      title={codec === 'h264' ? 'H.264 on YouTube tops out at 1080p' : undefined}
                      onClick={() => setVideoQuality('4k')}
                    >
                      4K · 2160p
                    </Pill>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <Pill group="v" active={videoQuality === '1080'} onClick={() => setVideoQuality('1080')}>
                      1080p
                    </Pill>
                    <Pill
                      group="v"
                      active={videoQuality === '2k'}
                      disabled={codec === 'h264'}
                      title={codec === 'h264' ? 'H.264 on YouTube tops out at 1080p' : undefined}
                      onClick={() => setVideoQuality('2k')}
                    >
                      2K · 1440p
                    </Pill>
                    <Pill
                      group="v"
                      active={videoQuality === '4k'}
                      disabled={codec === 'h264'}
                      title={codec === 'h264' ? 'H.264 on YouTube tops out at 1080p' : undefined}
                      onClick={() => setVideoQuality('4k')}
                    >
                      4K · 2160p
                    </Pill>
                  </div>
                )}

                {format === 'video' && (
                  spec ? (
                    <div className="flex rounded-[8px] border border-[var(--border)] bg-[var(--sunken)] p-[3px]">
                      <Pill
                        spec
                        compact={compact}
                        group="codec"
                        active={codec === 'best'}
                        onClick={() => selectCodec('best')}
                        title="AV1/VP9 · best resolution"
                      >
                        Best quality
                      </Pill>
                      <Pill
                        spec
                        compact={compact}
                        group="codec"
                        active={codec === 'h264'}
                        onClick={() => selectCodec('h264')}
                        title="H.264 + AAC · native YouTube streams, 1080p max"
                      >
                        Compatible (H.264)
                      </Pill>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Pill
                        group="c"
                        active={codec === 'best'}
                        onClick={() => selectCodec('best')}
                        title="AV1/VP9 · best resolution"
                      >
                        Best quality
                      </Pill>
                      <Pill
                        group="c"
                        active={codec === 'h264'}
                        onClick={() => selectCodec('h264')}
                        title="H.264 + AAC · native YouTube streams, 1080p max"
                      >
                        Compatible (H.264)
                      </Pill>
                    </div>
                  )
                )}

                {mode === 'single' && !isSc && (
                  <div className="grid grid-cols-2 gap-2">
                    <SwitchRow
                      label="Embed metadata"
                      on={embedMeta}
                      onToggle={() => setEmbedMeta((v) => !v)}
                      ariaLabel="Toggle embed metadata and cover art"
                      compact={compact}
                    />
                    <SwitchRow
                      label="Split by chapters"
                      extra={chapters.length > 0 ? `· ${chapters.length}` : null}
                      on={byChapters}
                      disabled={chapters.length === 0}
                      onToggle={() => {
                        setUseRange(false)
                        setByChapters((v) => !v)
                      }}
                      ariaLabel="Toggle split by chapters"
                      compact={compact}
                    />
                  </div>
                )}
                {mode === 'playlist' && showEmbed && (
                  <SwitchRow
                    label="Embed metadata"
                    on={embedMeta}
                    onToggle={() => setEmbedMeta((v) => !v)}
                    ariaLabel="Toggle embed metadata and cover art"
                    compact={compact}
                  />
                )}
                {mode === 'single' && !isSc && (
                  <div className={`flex w-full items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] ${compact ? 'h-9 px-3' : 'h-[42px] px-4'} ${byChapters ? 'pointer-events-none opacity-40' : ''}`}>
                    <div className="flex min-w-0 flex-1 items-center">
                      <AnimatePresence mode="wait" initial={false}>
                        {useRange ? (
                          <motion.div
                            key="range"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16 }}
                            className="grid h-7 w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center rounded-[8px] bg-[var(--sunken)] p-[3px] ring-1 ring-inset ring-[var(--border)]"
                          >
                            <RangeInput value={start} onChange={setStart} ariaLabel="Start time" />
                            <span className="h-3 w-px shrink-0 bg-[var(--border)]" />
                            <RangeInput value={end} onChange={setEnd} ariaLabel="End time" />
                          </motion.div>
                        ) : (
                          <motion.span
                            key="label"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.14 }}
                            className="text-sm font-medium"
                          >
                            Trim a specific range
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseRange((v) => !v)}
                      aria-label="Toggle trim range"
                      className="inline-flex shrink-0 appearance-none items-center border-0 bg-transparent p-0"
                    >
                      <Switch on={useRange} />
                    </button>
                  </div>
                )}

              </div>

              {/* Output + download pinned to bottom */}
              <div className={`flex shrink-0 flex-col ${compact ? 'mt-auto gap-2' : 'gap-3'}`}>
                <div>
                  <SectionLabel compact={compact}>Output folder</SectionLabel>
                  <div className={`flex items-center gap-2 rounded-[10px] px-3 ${compact ? 'py-1.5' : 'py-2'} ${spec ? 'border border-[var(--border)] bg-[var(--sunken)]' : 'glass-soft rounded-2xl'}`}>
                    <FolderOpen size={15} className="shrink-0 text-text-secondary" />
                    <input
                      readOnly
                      value={outputFolder}
                      className={`flex-1 truncate bg-transparent focus:outline-none ${spec ? 'font-mono text-[12px] text-[var(--text)] opacity-80' : 'text-sm text-text-secondary'}`}
                    />
                    <button
                      onClick={handleChangeFolder}
                      className={`px-3 py-1.5 text-[12px] font-medium ${spec
                        ? 'rounded-[7px] border border-[var(--border)] bg-[var(--control)] text-[var(--text)]'
                        : 'rounded-xl border border-white/10 bg-white/5 text-xs text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary'
                        }`}
                    >
                      Change
                    </button>
                  </div>
                </div>

                {downloading ? (
                  <div className="flex gap-2">
                    <div className={`glass-soft flex flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold tracking-wide text-text-secondary ${compact ? 'h-10' : 'h-[46px]'}`}>
                      <Loader2 size={16} className="animate-spin" />
                      DOWNLOADING…
                    </div>
                    <button
                      onClick={handleStop}
                      disabled={stopping}
                      className={`flex items-center justify-center gap-2 rounded-[10px] border px-5 text-sm font-medium ${compact ? 'h-10' : 'h-[46px]'} ${stopping
                        ? 'cursor-not-allowed border-[var(--border)] bg-[var(--sunken)] text-[var(--text-faint)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:border-error/60 hover:text-error'
                        }`}
                    >
                      <Square size={13} />
                      {stopping ? 'Stopping…' : 'Stop'}
                    </button>
                  </div>
                ) : (
                  <motion.button
                    whileTap={canDownload ? { scale: 0.985 } : {}}
                    onClick={handleDownload}
                    disabled={!canDownload}
                    className={`flex w-full items-center justify-center gap-2 rounded-[8px] font-bold tracking-wide transition-[filter] ${compact ? 'h-10 text-[13px]' : 'h-[46px] text-[15px]'} ${canDownload
                      ? 'bg-accent-gradient text-[var(--on-accent)] hover:brightness-110'
                      : 'glass-soft cursor-not-allowed text-text-muted'
                      }`}
                  >
                    <Download size={16} />
                    <span>{downloadLabel}</span>
                  </motion.button>
                )}
              </div>
            </div>

            {/* RIGHT — preview */}
            <div className={`flex min-h-0 flex-col overflow-hidden ${compact ? 'p-2.5' : 'p-5'} ${spec ? 'rounded-[12px] bg-[var(--panel)] ring-1 ring-[var(--border)]' : 'rounded-2xl glass'}`}>
              <div className={`flex h-8 shrink-0 items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
                <SectionLabel className="mt-2 flex h-full items-center leading-none">Preview</SectionLabel>
                <div className={`flex h-full items-center p-[3px] text-[12px] font-medium ${spec
                  ? 'rounded-[8px] border border-[var(--border)] bg-[var(--sunken)]'
                  : 'rounded-full border border-white/10 bg-white/5 text-[11px]'
                  }`}>
                  <ModeTab spec={spec} active={mode === 'single'} onClick={() => setMode('single')}>
                    {isSc ? 'Track' : 'Single video'}
                  </ModeTab>
                  <ModeTab spec={spec} active={mode === 'playlist'} onClick={() => setMode('playlist')}>
                    Playlist
                  </ModeTab>
                </div>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {mode === 'single' ? (
                  <motion.div
                    key="single"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <SinglePreview
                      info={videoInfo}
                      loading={previewLoading}
                      error={previewError}
                      empty={urlState === null}
                      soundcloud={isSc}
                      compact={compact}
                      sizeLabel={
                        videoInfo?.duration
                          ? `~${estSizeLabel(videoInfo.duration)} ${formatLabel}`
                          : null
                      }
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="playlist"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <PlaylistPreview
                      info={playlistInfo}
                      loading={previewLoading}
                      error={previewError}
                      empty={urlState === null}
                      selected={selected}
                      onToggle={toggleTrack}
                      onSelectAll={selectAll}
                      onDeselectAll={deselectAll}
                      totalSecs={totalSecs}
                      selectedSecs={selectedSecs}
                      sizeLabel={`~${estSizeLabel(selectedSecs)} ${formatLabel}`}
                      soundcloud={isSc}
                      compact={compact}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className={`flex shrink-0 items-center gap-3 ${compact ? 'mt-1' : 'mt-2'}`}>
            <span className="shrink-0 font-mono text-[11px] text-[var(--text-faint)]">
              {statusText}
            </span>
            <div className="relative min-w-0 flex-1">
              <div className={`overflow-hidden rounded-full ${spec ? 'h-[3px] bg-[var(--border)]' : 'h-1.5 bg-white/10'}`}>
                <motion.div
                  className="h-full rounded-full bg-accent-gradient"
                  animate={{ width: `${downloading ? Math.max(progress, 2) : 0}%` }}
                  transition={{ ease: 'linear', duration: 0.2 }}
                />
              </div>
              <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 bg-base pl-3 font-mono text-[11px] tabular-nums text-[var(--text-faint)]">
                {(downloading ? progress : 0).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={`app-footer relative z-10 flex shrink-0 items-center justify-between bg-[var(--footer)] ${compact ? 'px-3 py-1.5' : 'px-5 py-2'}`}>
        <p className="font-sans text-[12px] text-[var(--text-dim)]">
          {spec ? 'made by ' : 'Made by '}
          <a
            href="https://github.com/EvroHQ"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => window.api?.trackLink('madeby')}
            className="font-medium text-accentMid transition-opacity hover:opacity-80"
          >
            @EvroHQ
          </a>
        </p>
        <div className="flex min-w-0 items-center gap-1 font-sans text-[12px] leading-none text-[var(--text-dim)]">
          <span>If this helped,</span>
          <a
            href="https://github.com/EvroHQ/EvroHQ-Downloader"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => window.api?.trackLink('star')}
            className="inline-flex items-center gap-1 font-medium text-accentMid transition-opacity hover:opacity-80"
          >
            <Star size={11} strokeWidth={2.2} />
            star it on GitHub
          </a>
          <span>or</span>
          <a
            href="https://buymeacoffee.com/evrohq"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => window.api?.trackLink('coffee')}
            className="inline-flex items-center gap-1 font-medium text-accentMid transition-opacity hover:opacity-80"
          >
            <Coffee size={11} strokeWidth={2.2} />
            buy me a coffee
          </a>
        </div>
      </div>

      {aboutOpen && (
        <AboutModal version={version} onClose={() => setAboutOpen(false)} />
      )}

      {whatsNew ? (
        <WhatsNewModal
          version={seenVersionRef.current || version}
          items={whatsNew.items}
          onDismiss={dismissWhatsNew}
        />
      ) : null}

      <Toaster
        theme={LIGHT_THEMES.has(theme) ? 'light' : 'dark'}
        position="top-center"
        offset={16}
        duration={2000}
        gap={8}
        visibleToasts={3}
        icons={{
          success: <CheckCircle2 size={16} strokeWidth={2.4} />,
          error: <XCircle size={16} strokeWidth={2.4} />,
          info: <Info size={16} strokeWidth={2.4} />,
          warning: <AlertTriangle size={16} strokeWidth={2.4} />,
          loading: <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
        }}
        toastOptions={{
          classNames: {
            toast: 'app-toast',
            title: 'app-toast-title',
            icon: 'app-toast-icon',
            success: 'app-toast--success',
            error: 'app-toast--error',
            info: 'app-toast--info',
            warning: 'app-toast--warning',
            loading: 'app-toast--loading'
          }
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Preview panels                                                            */
/* -------------------------------------------------------------------------- */

function PreviewMessage({ icon, children, spinning }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-text-muted">
      {spinning ? <Loader2 size={26} className="animate-spin opacity-60" /> : icon}
      <p className="text-sm font-medium">{children}</p>
    </div>
  )
}

function SinglePreview({ info, loading, error, empty, sizeLabel, soundcloud, compact }) {
  const [artBroken, setArtBroken] = useState(false)
  const sc = soundcloud || info?.source === 'soundcloud'
  useEffect(() => {
    setArtBroken(false)
  }, [info?.thumbnail])

  if (empty) {
    return (
      <PreviewMessage icon={<Film size={28} className="opacity-50" />}>
        Paste a YouTube or SoundCloud link to preview
      </PreviewMessage>
    )
  }
  if (loading && !info) {
    return <PreviewMessage spinning>{sc ? 'Fetching track details…' : 'Fetching video details…'}</PreviewMessage>
  }
  if (!info) {
    return (
      <PreviewMessage icon={<Film size={28} className="opacity-50" />}>
        {error || 'No preview available'}
      </PreviewMessage>
    )
  }
  const meta = sc
    ? [info.channel, formatCount(info.views) && `${formatCount(info.views)} plays`].filter(Boolean).join(' · ')
    : [info.channel, formatCount(info.views) && `${formatCount(info.views)} views`, relativeDate(info.uploadDate)]
      .filter(Boolean)
      .join(' · ')
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`striped relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/10 ${compact ? 'mt-1' : 'mt-[22px]'}`}>
        {info.thumbnail && !artBroken ? (
          <img
            src={info.thumbnail}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setArtBroken(true)}
          />
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/25">
            {sc ? 'Artwork' : 'Video thumbnail'}
          </span>
        )}
        {info.duration != null && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white/80">
            {fmtClock(info.duration)}
          </span>
        )}
      </div>
      <h2 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug text-text-primary">
        {info.title || (sc ? 'Untitled track' : 'Untitled video')}
      </h2>
      {meta && <p className={`mt-1 ${sc ? 'text-[13px]' : 'text-[12px]'} text-text-secondary`}>{meta}</p>}
      {sc && info.genre && (
        <span className="mt-2 w-fit rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-muted">
          {info.genre}
        </span>
      )}
      <div className={`mt-auto flex items-center justify-between border-t border-[var(--border)] bg-[var(--panel-footer)] font-mono text-[12px] ${compact ? '-mx-3 -mb-3 px-3 py-3' : '-mx-5 -mb-5 px-5 py-3'}`}>
        <span className="text-[var(--text-dim)]">
          {info.duration != null ? `Full length · ${fmtLong(info.duration)}` : 'Length unknown'}
        </span>
        {sizeLabel && <span className="size-estimate">{sizeLabel}</span>}
      </div>
    </div>
  )
}

function PlaylistPreview({
  info,
  loading,
  error,
  empty,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  totalSecs,
  selectedSecs,
  sizeLabel,
  soundcloud,
  compact
}) {
  if (empty) {
    return (
      <PreviewMessage icon={<Film size={28} className="opacity-50" />}>
        Paste a playlist link to preview
      </PreviewMessage>
    )
  }
  if (loading && !info) {
    return <PreviewMessage spinning>Fetching playlist…</PreviewMessage>
  }
  if (!info) {
    return (
      <PreviewMessage icon={<Film size={28} className="opacity-50" />}>
        {error || 'No playlist preview available'}
      </PreviewMessage>
    )
  }
  const tracks = info.tracks
  const protectedCount = tracks.filter((t) => t.protected).length
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? 'mt-1' : 'mt-[22px]'}`}>
      <div className="mb-2.5 flex shrink-0 items-center gap-3">
        {info.cover ? (
          <img
            src={info.cover}
            alt=""
            draggable={false}
            className="h-10 w-14 shrink-0 rounded-md object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="striped h-10 w-14 shrink-0 rounded-md ring-1 ring-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-text-primary">{info.title}</h2>
          {info.artist && (
            <p className="mt-0.5 truncate text-[13px] leading-tight text-text-secondary">{info.artist}</p>
          )}
          <p className="mt-0.5 text-[12px] leading-tight text-text-secondary">
            {tracks.length} tracks
            {totalSecs > 0 ? ` · ${fmtLong(totalSecs)}` : ''}
            {soundcloud && info.plays > 0 ? ` · ${formatCount(info.plays)} plays` : ''}
            {protectedCount > 0 ? ` · ${protectedCount} DRM` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <GhostBtn onClick={onSelectAll}>Select all</GhostBtn>
          <GhostBtn onClick={onDeselectAll}>Deselect all</GhostBtn>
        </div>
      </div>

      <div className={`list-scroll min-h-0 flex-1 overflow-y-auto pr-3 ${compact ? '-mr-3' : '-mr-5'}`}>
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {tracks.map((t, i) => {
            const locked = !!t.protected
            const checked = !locked && selected.has(t.id)
            return (
              <button
                key={t.id}
                onClick={() => onToggle(t.id)}
                className="track-row flex w-full items-center gap-2.5 py-2.5 text-left"
                style={{ opacity: locked ? 0.55 : checked ? 1 : 0.45 }}
              >
                <span
                  className={`track-check grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] ${checked ? 'is-checked' : ''
                    }`}
                >
                  {locked ? (
                    <Lock size={10} className="text-[var(--text-faint)]" strokeWidth={2.5} />
                  ) : (
                    checked && <Check size={12} className="track-check-mark" strokeWidth={3} />
                  )}
                </span>
                <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-faint)]">
                  {pad2(i + 1)}
                </span>
                {t.thumbnail ? (
                  <img
                    src={t.thumbnail}
                    alt=""
                    draggable={false}
                    className="h-7 w-11 shrink-0 rounded object-cover ring-1 ring-[var(--border)]"
                  />
                ) : (
                  <span className="striped h-7 w-11 shrink-0 rounded ring-1 ring-[var(--border)]" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
                  {t.title}
                </span>
                {locked ? (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--text-faint)]">DRM</span>
                ) : null}
                {soundcloud ? (
                  <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-faint)]">
                    {t.plays != null ? formatCount(t.plays) : '—'}
                  </span>
                ) : null}
                <span className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums text-[var(--text-dim)]">
                  {t.duration != null ? fmtClock(t.duration) : '—'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className={`mt-auto flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--panel-footer)] font-mono text-[12px] ${compact ? '-mx-3 -mb-3 px-3 py-3' : '-mx-5 -mb-5 px-5 py-3'}`}>
        <span className="text-[var(--text-dim)]">
          {selected.size} of {tracks.length} selected{selectedSecs > 0 ? ` · ${fmtLong(selectedSecs)}` : ''}
        </span>
        <span className="size-estimate">{sizeLabel}</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function WhatsNewModal({ version, items, onDismiss }) {
  const [armed, setArmed] = useState(false)
  const downOnBtn = useRef(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const t = window.setTimeout(() => setArmed(true), 1800)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!armed) return
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [armed, onDismiss])

  const overlay = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6 backdrop-blur-[4px]"
      onPointerDown={(e) => {
        e.preventDefault()
        downOnBtn.current = false
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] outline-none"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-gradient shadow-glow">
            <Sparkles size={16} className="text-[var(--on-accent)]" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="whats-new-title" className="text-[15px] font-semibold leading-tight text-text-primary">
              What’s new
            </h2>
            {version && (
              <p className="mt-0.5 text-[12px] text-[var(--text-dim)]">Version {version}</p>
            )}
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.title} className="rounded-xl border border-[var(--border)] bg-[var(--sunken)] px-3.5 py-3">
              <p className="text-[13px] font-semibold text-text-primary">{item.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{item.body}</p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          tabIndex={armed ? 0 : -1}
          disabled={!armed}
          onPointerDown={(e) => {
            e.stopPropagation()
            downOnBtn.current = armed && e.button === 0
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            if (!armed || !downOnBtn.current || e.button !== 0) return
            downOnBtn.current = false
            onDismiss()
          }}
          className="mt-4 h-[38px] w-full rounded-[10px] bg-accent-gradient text-[13px] font-semibold text-[var(--on-accent)] shadow-glow transition-[filter] hover:brightness-110 disabled:opacity-60 disabled:pointer-events-none"
        >
          Got it
        </button>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

function AboutModal({ version, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const overlay = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6 backdrop-blur-[4px]"
      onPointerDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] outline-none"
      >
        <div className="flex items-start gap-3">
          <AppLogo />
          <div className="min-w-0 pt-0.5">
            <h2 id="about-title" className="text-[15px] font-semibold leading-tight text-text-primary">
              About EvroHQ Downloader
            </h2>
            {version && (
              <p className="mt-0.5 font-mono text-[12px] text-[var(--text-dim)]">v{version}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--sunken)] px-3.5 py-3">
            <p className="text-[13px] font-semibold text-text-primary">Who I am</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
              I’m EvroHQ, a full-stack developer. I build web apps, desktop software, and other projects — and I keep this one free and open-source.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--sunken)] px-3.5 py-3">
            <p className="text-[13px] font-semibold text-text-primary">This project</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
              A free desktop app to download audio, video, or playlists from YouTube and SoundCloud. No ads, no account.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--sunken)] px-3.5 py-3">
            <p className="text-[13px] font-semibold text-text-primary">Support</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
              If the app helps you, a GitHub star or a coffee goes a long way. It helps cover certificates, updates, and keeping the project free.
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href="https://github.com/EvroHQ/EvroHQ-Downloader"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => window.api?.trackLink('star')}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--control)] text-[12px] font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
              >
                <Star size={13} strokeWidth={2.2} />
                Star on GitHub
              </a>
              <a
                href="https://buymeacoffee.com/evrohq"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => window.api?.trackLink('coffee')}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-accent-gradient text-[12px] font-semibold text-[var(--on-accent)] transition-[filter] hover:brightness-110"
              >
                <Coffee size={13} strokeWidth={2.2} />
                Buy me a coffee
              </a>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-[38px] w-full rounded-[10px] border border-[var(--border)] bg-[var(--sunken)] text-[13px] font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
        >
          Close
        </button>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

function UpdateBanner({ title, subtitle, actionLabel, onAction, busy, progress }) {
  const showBar = typeof progress === 'number'
  const pct = showBar ? Math.round(progress) : 0
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: 'easeInOut' }}
      className="relative z-30 shrink-0 overflow-hidden"
    >
      <div className="banner-grad flex items-center gap-3 rounded-2xl px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-gradient shadow-glow">
          <ChevronDown size={18} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">{title}</p>
          <p className="truncate text-[11px] text-text-secondary">{subtitle}</p>
        </div>
        <div className="shrink-0">
          {showBar ? (
            <div className="flex w-[150px] items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent-gradient transition-[width] duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-text-secondary">
                {pct}%
              </span>
            </div>
          ) : (
            actionLabel && (
              <button
                onClick={onAction}
                disabled={busy}
                className={`rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-opacity ${busy ? 'cursor-not-allowed bg-white/10 text-text-muted' : 'bg-accent-gradient text-[var(--on-accent)] shadow-glow'
                  }`}
              >
                {actionLabel}
              </button>
            )
          )}
        </div>
      </div>
    </motion.div>
  )
}

function AppLogo() {
  return (
    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-[22%] bg-accent-gradient">
      <svg viewBox="0 0 1024 1024" className="h-full w-full" aria-hidden>
        <g fill="var(--on-accent)">
          <path d="M460 264h104v152h-104z" />
          <path d="M352 416h320L512 648z" />
          <rect x="352" y="688" width="320" height="50" rx="25" />
        </g>
      </svg>
    </span>
  )
}

function WindowSizeMenu({ value, onChange }) {
  const btn = (id, label, icon) => {
    const active = value === id
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={() => onChange(id)}
        className={`grid h-6 w-6 place-items-center rounded-[6px] transition-colors ${active
          ? 'bg-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]'
          : 'text-[var(--text-dim)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]'
          }`}
      >
        {icon}
      </button>
    )
  }

  return (
    <div className="chrome-chip flex items-center gap-0.5 p-[3px]" role="group" aria-label="Window size">
      {btn('default', 'Default', <Maximize2 size={13} strokeWidth={2.2} />)}
      {btn('compact', 'Compact', <Minimize2 size={13} strokeWidth={2.2} />)}
    </div>
  )
}

function ThemeMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="chrome-chip flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors hover:text-[var(--text)]"
      >
        Themes
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 min-w-[220px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
          {THEMES.map((t) => {
            const active = t.id === value
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(t.id)
                  setOpen(false)
                }}
                className={`menu-item flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] ${active ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'
                  }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20"
                  style={{ background: `var(--accent)` }}
                  data-theme={t.id}
                />
                <span className="min-w-0 flex-1">
                  {t.name}
                  {LIGHT_THEMES.has(t.id) ? ' (light)' : ''}
                </span>
                {active && <Check size={13} className="shrink-0 text-text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children, className = '', compact }) {
  return (
    <label
      className={`section-label inline-flex items-center font-semibold uppercase tracking-wide text-text-muted ${compact ? 'mb-1 text-[10px]' : 'mb-1.5 text-[11px]'} ${className}`}
    >
      {children}
    </label>
  )
}

function FormatCard({ spec, compact, active, onClick, icon, title, subtitle, disabled, hint }) {
  if (spec) {
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        title={hint}
        className={`box-border flex items-start gap-2 rounded-[10px] border text-left transition-colors ${compact ? 'px-2.5 py-2' : 'px-3.5 py-[14px]'} ${disabled ? 'cursor-not-allowed opacity-40' : ''
          }`}
        style={{
          borderColor: active && !disabled ? 'var(--accent)' : 'var(--border)',
          borderWidth: compact ? 1 : active && !disabled ? 1.5 : 1,
          background: active && !disabled ? 'var(--accent-surface)' : 'var(--sunken)'
        }}
      >
        <span
          className={`shrink-0 rounded-full ${compact ? 'mt-[5px] h-1 w-1' : 'mt-[6px] h-1.5 w-1.5'}`}
          style={{ background: active && !disabled ? 'var(--accent)' : 'var(--border-strong)' }}
        />
        <span>
          <span className={`block font-semibold leading-tight text-[var(--text)] ${compact ? 'text-[12px]' : 'text-[13px]'}`}>{title}</span>
          <span className={`mt-0.5 block font-mono text-[var(--text-dim)] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{subtitle}</span>
        </span>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${active ? '' : 'bg-white/[0.04]'
        }`}
    >
      {active && (
        <motion.span
          layoutId="format-pill"
          transition={spring}
          className="absolute inset-0 rounded-2xl bg-accent-gradient shadow-glow"
        />
      )}
      <span
        className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${active ? 'bg-white/20 text-white' : 'bg-white/5 text-text-secondary'
          }`}
      >
        {icon}
      </span>
      <span className="relative z-10">
        <span className={`block text-sm font-semibold ${active ? 'text-white' : 'text-text-primary'}`}>
          {title}
        </span>
        <span className={`block text-[11px] ${active ? 'text-white/80' : 'text-text-secondary'}`}>
          {subtitle}
        </span>
      </span>
    </button>
  )
}

function Pill({ spec, compact, active, onClick, group, title, disabled, children }) {
  if (spec) {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        title={title}
        aria-disabled={disabled || undefined}
        className={`relative isolate flex-1 rounded-[7px] text-center font-mono transition-[color,opacity] duration-200 ${compact ? 'py-1 text-[11px]' : 'py-2 text-[12px]'} ${disabled ? 'pointer-events-none cursor-default opacity-35' : ''
          } ${active && !disabled ? 'font-medium text-[var(--text)]' : 'font-normal text-[var(--text-dim)]'
          }`}
      >
        {active && !disabled && (
          <motion.span
            layoutId={`pill-${group}`}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.7 }}
            className="absolute inset-0 -z-10 rounded-[7px] bg-[var(--control)] shadow-[0_1px_2px_rgba(0,0,0,0.10)] ring-1 ring-[var(--border)]"
          />
        )}
        <span className="relative z-10">{children}</span>
      </button>
    )
  }
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      aria-disabled={disabled || undefined}
      className={`relative rounded-xl py-3 text-center text-[13px] font-semibold transition-colors ${disabled ? 'pointer-events-none cursor-default opacity-35' : ''
        } ${active && !disabled ? 'text-white' : 'bg-white/[0.04] text-text-secondary'
        }`}
    >
      {active && !disabled && (
        <motion.span
          layoutId={`pill-${group}`}
          transition={spring}
          className="absolute inset-0 rounded-xl bg-accent-gradient shadow-glow"
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

function ModeTab({ spec, active, onClick, children }) {
  if (spec) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative isolate h-full rounded-[7px] px-3 text-[12px] font-medium transition-colors duration-200 ${active ? 'text-[var(--on-accent)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
          }`}
      >
        {active && (
          <motion.span
            layoutId="preview-mode"
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.7 }}
            className="absolute inset-0 -z-10 rounded-[7px] bg-accent-gradient"
          />
        )}
        <span className="relative z-10">{children}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative isolate h-full rounded-full px-3 transition-colors ${active ? 'text-white' : 'text-text-secondary hover:text-text-primary'
        }`}
    >
      {active && (
        <motion.span
          layoutId="preview-mode"
          transition={spring}
          className="absolute inset-0 -z-10 rounded-full bg-accent-gradient"
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

function GhostBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="ghost-btn px-2.5 py-1 text-[11px] font-medium"
    >
      {children}
    </button>
  )
}

function SwitchRow({ label, extra, on, onToggle, ariaLabel, disabled, compact }) {
  return (
    <div className={`flex w-full items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--surface)] ${compact ? 'h-9 gap-1.5 px-2.5' : 'h-[42px] px-4'} ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <span className={`min-w-0 truncate font-medium ${compact ? 'text-[12px]' : 'text-sm'}`}>
        {label}
        {extra ? (
          <span className="ml-1 font-normal text-[var(--text-dim)]">{extra}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={ariaLabel}
        className="inline-flex shrink-0 appearance-none items-center border-0 bg-transparent p-0"
      >
        <Switch on={on} />
      </button>
    </div>
  )
}

function Switch({ on }) {
  return (
    <span
      className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 ${on ? 'bg-accent-gradient' : 'bg-[var(--border-strong)]'
        }`}
    >
      <span
        className={`block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${on ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
      />
    </span>
  )
}

function RangeInput({ value, onChange, ariaLabel }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(formatTimeInput(e.target.value))}
      inputMode="numeric"
      maxLength={8}
      aria-label={ariaLabel}
      placeholder="00:00:00"
      className="h-full min-w-0 w-full appearance-none rounded-[5px] border-0 bg-transparent p-0 text-center font-mono text-[12px] leading-none tabular-nums tracking-wide text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] transition-colors focus:bg-[var(--control)]"
    />
  )
}
