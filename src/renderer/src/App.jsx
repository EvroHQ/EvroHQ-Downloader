// EvroHQ Downloader 2.6 UI — implements design/EvroHQ-Downloader-Design-Spec.md
// (the prototype in design/ is the reference). All downloading is done by the
// main process through window.api; this file holds the UI state and logic.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyTheme, resolveTheme } from './lib/themes'
import {
  detectLink,
  hms,
  hms6,
  parseT,
  fmtT,
  trimError,
  fmtMB,
  ratePerMin,
  containerOf,
  qualityText,
  splitTitle,
  parseDlStats,
  smoothSpeed
} from './lib/util'
import { pendingWhatsNew } from './lib/whatsnew'
import {
  TitleBar,
  Banner,
  UrlBar,
  EmptyState,
  Reading,
  ErrorCard,
  SingleView,
  ListView,
  Sentence,
  MoreOptions,
  PrimaryButton,
  QueuePopover,
  Toast,
  WhatsNew
} from './ui'
import { SettingsSheet } from './settings'

const EXAMPLE_PLAYLIST = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'
const QUEUE_GAP_SEC = 5 // pause between two queued downloads
const TOAST_MS = 3800
const LINKS = {
  star: 'https://github.com/EvroHQ/EvroHQ-Downloader',
  coffee: 'https://buymeacoffee.com/evrohq',
  madeby: 'https://github.com/EvroHQ'
}
const RES_TO_QUALITY = { 1080: '1080', 1440: '2k', 2160: '4k' }

/* -------------------------------------------------------------------------- */
/*  Sources, settings, jobs                                                   */
/* -------------------------------------------------------------------------- */

function videoSource(info, chapters, link) {
  return {
    kind: 'yt',
    type: 'video',
    label: link.kind === 'plvid' ? 'YouTube video · from a playlist' : 'YouTube video',
    title: info.title || 'Untitled video',
    by: info.channel || '',
    thumbnail: info.thumbnail || null,
    duration: Number(info.duration) || 0,
    chapters: Array.isArray(chapters) ? chapters : [],
    max: info.sizes?.maxHeight || null,
    sizes: info.sizes || null,
    url: link.videoUrl,
    tracks: [{ id: info.id || 'v', ...splitTitle(info.title, info.channel), full: info.title, dur: Number(info.duration) || 0, thumb: info.thumbnail }]
  }
}

function ytListSource(info, link) {
  const tracks = (info.tracks || []).map((t, i) => ({
    id: String(t.id ?? i),
    ...splitTitle(t.title),
    full: t.title,
    dur: Number(t.duration) || 0,
    thumb: t.thumbnail || null,
    url: t.url && /^https?:\/\//i.test(t.url) ? t.url : t.id ? `https://www.youtube.com/watch?v=${t.id}` : null
  }))
  return {
    kind: 'yt',
    type: 'list',
    label: 'YouTube playlist',
    title: info.title || 'Playlist',
    by: info.by || '',
    thumbnail: info.cover || tracks[0]?.thumb || null,
    url: link.listUrl,
    tracks
  }
}

function scSource(meta, url) {
  if (meta.kind === 'playlist') {
    const tracks = (meta.tracks || []).map((t, i) => ({
      id: String(t.id ?? i),
      a: t.artist || meta.artist || 'Unknown artist',
      t: t.title,
      full: t.title,
      dur: Number(t.duration) || 0,
      thumb: t.thumbnail || null,
      url: t.url,
      protected: !!t.protected
    }))
    return { kind: 'sc', type: 'list', label: 'SoundCloud set', title: meta.title || 'Set', by: meta.artist || '', thumbnail: meta.cover || null, url, tracks }
  }
  return {
    kind: 'sc',
    type: 'video',
    label: 'SoundCloud track',
    title: meta.title || 'Track',
    by: meta.artist || '',
    thumbnail: meta.thumbnail || null,
    duration: Number(meta.duration) || 0,
    chapters: [],
    max: null,
    url,
    tracks: [{ id: String(meta.id || 't'), a: meta.artist || '', t: meta.title, full: meta.title, dur: Number(meta.duration) || 0, thumb: meta.thumbnail }]
  }
}

// Settings for a freshly read link: keep the user's last choices, reset trim.
function makeCfg(src, last) {
  let res = last.res
  if (src.type === 'video' && src.max && res > src.max) res = src.max >= 1440 ? 1440 : 1080
  return {
    format: src.kind === 'sc' ? 'audio' : last.format,
    res,
    codec: res > 1080 ? 'best' : last.codec,
    afmt: last.afmt,
    scfmt: last.scfmt,
    meta: last.meta,
    folder: last.folder,
    trimOn: false,
    tStart: '00:00:00',
    tEnd: hms6(src.duration || 0),
    split: false
  }
}

// Size / length of a selection (spec §5.3 "File size estimates"). Single
// YouTube videos use the real format sizes from yt-dlp when they're known.
function estimate(src, sel, cfg) {
  const isSc = src.kind === 'sc'
  const single = src.type === 'video'
  const items = single ? src.tracks : src.tracks.filter((t) => sel.includes(t.id))
  const terr = single && src.kind === 'yt' ? trimError(cfg, src.duration) : null
  let secs = items.reduce((a, t) => a + (t.dur || 0), 0)
  const trimmed = single && cfg.trimOn && !terr
  if (trimmed) secs = parseT(cfg.tEnd).sec - parseT(cfg.tStart).sec
  let mb = (secs / 60) * ratePerMin(isSc, cfg)
  if (single && !isSc && cfg.format === 'video' && src.sizes) {
    const bytes = cfg.codec === 'h264' ? src.sizes.h264?.[1080] : src.sizes.best?.[cfg.res]
    if (bytes) mb = (bytes / 1024 ** 2) * (trimmed && src.duration ? secs / src.duration : 1)
  }
  const n = items.length
  const unit = single
    ? cfg.split && src.chapters?.length
      ? `${src.chapters.length} chapters`
      : isSc
        ? '1 track'
        : '1 video'
    : `${n} ${n === 1 ? 'track' : 'tracks'}`
  return { n, secs, mb, terr, unit, cont: containerOf(isSc, cfg) }
}

const summaryOf = (job) => {
  const e = estimate(job.src, job.sel, job.cfg)
  return `${e.unit} · ${qualityText(job.src.kind === 'sc', job.cfg)} · ~${fmtMB(e.mb)}${job.cfg.trimOn ? ' · trimmed' : ''}`
}

// Everything a download needs, frozen now (each queued item keeps its settings).
function buildJob(ed, seq) {
  const { src, sel, cfg } = ed
  const isSc = src.kind === 'sc'
  const est = estimate(src, sel, cfg)
  const base = { id: seq, src, sel: [...sel], cfg: { ...cfg }, url: ed.url, fromWatch: ed.fromWatch, alt: ed.alt, est, label: src.title }
  const outputFolder = cfg.folder
  if (isSc && src.type === 'list') {
    const chosen = src.tracks.filter((t) => sel.includes(t.id) && !t.protected)
    return {
      ...base,
      api: 'startSoundCloudPlaylistDownload',
      streams: 1,
      total: chosen.length,
      batch: true,
      params: {
        platform: 'soundcloud',
        url: src.url,
        format: cfg.scfmt,
        selectedTracks: src.tracks.map((t, i) => (sel.includes(t.id) && !t.protected ? i + 1 : null)).filter(Boolean),
        trackUrls: chosen.map((t) => t.url).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)),
        skippedTracks: src.tracks.filter((t) => t.protected).map((t) => t.full),
        itemCount: chosen.length,
        title: src.title,
        artist: src.by,
        outputFolder
      }
    }
  }
  if (isSc) {
    return { ...base, api: 'startSoundCloudDownload', streams: 1, params: { platform: 'soundcloud', url: src.url, format: cfg.scfmt, title: src.title, artist: src.by, outputFolder } }
  }
  const common = { format: cfg.format, audioFormat: cfg.afmt, videoQuality: RES_TO_QUALITY[cfg.res], codec: cfg.codec, embedMeta: cfg.meta, outputFolder }
  const streams = cfg.format === 'video' ? 2 : 1
  if (src.type === 'list') {
    const trackUrls = src.tracks.filter((t) => sel.includes(t.id)).map((t) => t.url).filter(Boolean)
    return {
      ...base,
      api: 'startPlaylistDownload',
      streams,
      total: trackUrls.length,
      batch: true,
      params: { url: src.url, trackUrls, title: src.title, itemCount: trackUrls.length, ...common }
    }
  }
  return {
    ...base,
    api: 'startDownload',
    streams,
    params: {
      url: src.url,
      ...common,
      useRange: cfg.trimOn && !cfg.split,
      byChapters: cfg.split && !cfg.trimOn,
      chapterCount: src.chapters?.length || 0,
      start: cfg.tStart,
      end: cfg.tEnd,
      title: src.title,
      duration: src.duration
    }
  }
}

const jobKey = (j) => `${j.api}|${j.src.url}|${JSON.stringify(j.cfg)}|${j.sel.join(',')}`

// Turn a preview failure into the error card text (spec §5.2 "Error card").
function errorCard(message, noun, url) {
  const msg = String(message || 'Could not read this link.')
  const raw = /^ERROR/.test(msg) ? msg : `ERROR: ${msg}`
  if (/as a bot|not a bot/i.test(msg)) {
    return {
      title: 'YouTube is blocking this connection for now.',
      body: 'Wait about 30 seconds and try again. If it keeps happening, route downloads through a proxy.',
      raw
    }
  }
  if (/Proxy unreachable/i.test(msg)) {
    return { title: 'Your proxy isn’t answering.', body: 'Check that your proxy app is running, or turn the proxy off in Settings.', raw }
  }
  if (/private|unavailable|does not exist|removed|deleted|not available|no longer|HTTP Error 40[04]/i.test(msg)) {
    return {
      title: `This ${noun} is private, or it doesn't exist.`,
      body: "Check that it's set to Public or Unlisted and that the link is complete. If YouTube is blocked on your network, route downloads through a proxy.",
      raw
    }
  }
  return {
    title: `Couldn't read this ${noun}.`,
    body: 'Check the link and your connection, then try again. If YouTube is blocked on your network, route downloads through a proxy.',
    raw: raw || `ERROR: ${url}`
  }
}

const UNSUPPORTED = (url) => ({
  title: "That isn't a YouTube or SoundCloud link.",
  body: 'This app reads links from youtube.com, youtu.be and soundcloud.com. Check the link you pasted.',
  raw: `ERROR: Unsupported URL: ${url}`
})

// "socks5://user:pass@host:port" → proxy fields (spec §5.9).
function parseProxyLink(v) {
  const m = String(v).match(/^(socks5h?|socks4a?|https?):\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([^:/]+)(?::(\d+))?/i)
  if (!m) return null
  const s = m[1].toLowerCase()
  const type = s.startsWith('socks5') ? 'socks5' : s.startsWith('socks4') ? 'socks4' : 'http'
  const dec = (x) => {
    try {
      return decodeURIComponent(x || '')
    } catch {
      return x || ''
    }
  }
  return { type, host: m[4], port: m[5] || (type === 'http' ? '8080' : '1080'), username: dec(m[2]), password: dec(m[3]) }
}

const proxyValid = (p) => !!String(p.host || '').trim() && Number(p.port) > 0 && Number(p.port) < 65536

/* -------------------------------------------------------------------------- */
/*  App                                                                       */
/* -------------------------------------------------------------------------- */

export default function App() {
  /* --- config & chrome ------------------------------------------------------ */
  const [version, setVersion] = useState('')
  const [theme, setTheme] = useState('graphite-amber')
  const [windowSize, setWindowSize] = useState('default')
  const [folders, setFolders] = useState({ standard: [], recent: [] })
  const [toast, setToast] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [whatsNew, setWhatsNew] = useState(null) // { block, prev }
  const [appUpdate, setAppUpdate] = useState(null)
  const [ytdlpUpdate, setYtdlpUpdate] = useState(null) // { status: 'updating' | 'failed', latest, pct }
  const ytdlpBusyRef = useRef(false)
  const [bannerHidden, setBannerHidden] = useState(null) // key of a dismissed banner
  const [engine, setEngine] = useState({ ytdlp: null, ffmpeg: null, msg: '', busy: false })
  const lastCfgRef = useRef({ format: 'video', res: 1080, codec: 'h264', afmt: 'wav', scfmt: 'original', meta: true, folder: '' })
  const ackRef = useRef([])
  const toastTimer = useRef(null)
  const inputRef = useRef(null)
  const sheetBodyRef = useRef(null)
  const proxyRef = useRef(null)

  /* --- proxy (saved + the sheet's draft) ------------------------------------ */
  const [proxySaved, setProxySaved] = useState(null)
  const [pxDraft, setPxDraft] = useState({ on: false, type: 'socks5', host: '', port: '1080', username: '', password: '' })
  const [pxTest, setPxTest] = useState(null)
  const pxTimer = useRef(null)

  /* --- editor (the link being read / configured) ---------------------------- */
  const [ed, setEd] = useState({ view: 'empty', url: '', src: null, alt: null, sel: [], cfg: null, fromWatch: false, err: null })
  const [more, setMore] = useState(false)
  const [pop, setPop] = useState(null) // { id, right }
  const [qOpen, setQOpen] = useState(false)
  const readReq = useRef(0)

  /* --- downloads ------------------------------------------------------------ */
  const [active, setActive] = useState(null)
  const [queue, setQueue] = useState([])
  const [wait, setWait] = useState(null) // { until, bot }
  const [doneJob, setDoneJob] = useState(null)
  const [stopping, setStopping] = useState(false)
  const [live, setLive] = useState({ progress: 0, item: 0, itemPct: 0, speed: null })
  const [, setTick] = useState(0)
  const queueRef = useRef([])
  const activeRef = useRef(null)
  const seqRef = useRef(0)
  const skipRef = useRef(false)
  const abortRef = useRef(false)
  const liveRef = useRef({ progress: 0, item: 0, itemPct: 0, speed: null })
  const speedRef = useRef(null)
  const flushRef = useRef(0)
  const dl = useRef({ pass: 1, dest: 0, extracts: 0, extra: false })
  const skippedRef = useRef(false) // some playlist items failed and were skipped

  const toastMsg = useCallback((kind, text) => {
    clearTimeout(toastTimer.current)
    const id = Date.now()
    setToast({ kind, text, id })
    toastTimer.current = setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), TOAST_MS)
  }, [])

  const setQueueBoth = (q) => {
    queueRef.current = q
    setQueue(q)
  }

  // Keep yt-dlp current on its own: YouTube changes often and an old yt-dlp
  // starts failing (HTTP 403). No app restart needed — the next download uses
  // the new yt-dlp.exe. ffmpeg doesn't talk to YouTube; it's updated with
  // each app release.
  const autoUpdateYtdlp = useCallback(async () => {
    if (ytdlpBusyRef.current) return
    ytdlpBusyRef.current = true
    try {
      const r = await window.api?.checkYtdlpUpdate()
      if (!r?.updateAvailable) {
        setYtdlpUpdate((u) => (u?.status === 'failed' && !r?.error ? null : u))
        return
      }
      setYtdlpUpdate({ status: 'updating', latest: r.latest, pct: 0 })
      const res = await window.api?.updateYtdlp()
      if (res?.success) {
        setYtdlpUpdate(null)
        toastMsg('success', `yt-dlp updated to ${res.version || r.latest}`)
        window.api?.getEngineVersions?.().then((v) => v && setEngine((e) => ({ ...e, ...v })))
      } else {
        setYtdlpUpdate({ status: 'failed', latest: r.latest })
      }
    } finally {
      ytdlpBusyRef.current = false
    }
  }, [toastMsg])

  // At startup, then every 6 hours while nothing is downloading.
  useEffect(() => {
    autoUpdateYtdlp()
    const t = setInterval(() => {
      if (!activeRef.current) autoUpdateYtdlp()
    }, 6 * 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [autoUpdateYtdlp])

  /* --- startup ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false
    window.api?.getConfig().then((cfg) => {
      if (cancelled || !cfg) return
      setVersion(cfg.version || '')
      setTheme(cfg.theme || 'graphite-amber')
      setWindowSize(cfg.windowSize === 'compact' ? 'compact' : 'default')
      lastCfgRef.current = { ...lastCfgRef.current, codec: cfg.codec === 'best' ? 'best' : 'h264', folder: cfg.outputFolder || '' }
      ackRef.current = Array.isArray(cfg.whatsNewAck) ? cfg.whatsNewAck : []
      const block = pendingWhatsNew(cfg.whatsNewAck, cfg.version)
      if (block) setWhatsNew({ block, prev: cfg.lastSeenVersion || '' })
    })
    window.api?.getFolders?.().then((f) => !cancelled && f && setFolders(f))
    window.api?.getProxy?.().then((p) => {
      if (cancelled || !p) return
      setProxySaved(p)
      setPxDraft({ on: p.enabled, type: p.type, host: p.host, port: String(p.port || ''), username: p.username || '', password: p.password || '' })
    })
    const offUpd = window.api?.onAppUpdate((p) => setAppUpdate(p))
    return () => {
      cancelled = true
      offUpd && offUpd()
    }
  }, [])

  // Theme: apply now, follow the OS for "System", remember the choice.
  const themeLoaded = useRef(false)
  useEffect(() => {
    applyTheme(theme)
    if (themeLoaded.current) window.api?.setConfig({ theme })
    themeLoaded.current = true
    if (theme !== 'system') return
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const on = () => applyTheme('system')
    mq?.addEventListener?.('change', on)
    return () => mq?.removeEventListener?.('change', on)
  }, [theme])

  /* --- progress from yt-dlp's log --------------------------------------------- */
  useEffect(() => {
    const flush = () => {
      flushRef.current = 0
      setLive({ ...liveRef.current })
    }
    const schedule = () => {
      if (!flushRef.current) flushRef.current = requestAnimationFrame(flush)
    }
    const off = window.api?.onLog((line) => {
      // yt-dlp self-update progress ("Downloading yt-dlp... 42%").
      const up = line.match(/Downloading yt-dlp\.\.\. (\d+)%/)
      if (up) {
        setYtdlpUpdate((u) => (u?.status === 'updating' ? { ...u, pct: Number(up[1]) } : u))
        return
      }
      const job = activeRef.current
      if (!job) return
      const d = dl.current
      const total = job.total || 1
      const resetItem = () => {
        d.pass = 1
        d.dest = 0
        d.extra = false
        speedRef.current = null
      }
      const item = line.match(/Downloading (?:item|video) (\d+) of (\d+)/i)
      if (item) {
        liveRef.current.item = Number(item[1]) - 1
        resetItem()
      } else if (job.batch && /\[[\w:]+\] Extracting URL:/.test(line)) {
        // Batch downloads (selected tracks) print one "Extracting URL" per item.
        liveRef.current.item = Math.min(total - 1, d.extracts)
        d.extracts += 1
        resetItem()
      }
      const streams = job.streams || 1
      // One "[download] Destination:" per stream; images are extras.
      const dest = line.match(/\[download\]\s+Destination:\s*(.+)$/i)
      if (dest) {
        if (/\.(jpe?g|png|webp)$/i.test(dest[1].trim())) d.extra = true
        else {
          d.dest += 1
          d.extra = d.dest > streams
          if (!d.extra) d.pass = d.dest
        }
      }
      const chapterPct = line.match(/Splitting chapter .*?\((\d+(?:\.\d+)?)%\)/)
      if (chapterPct) {
        liveRef.current.progress = Math.max(liveRef.current.progress, parseFloat(chapterPct[1]))
      } else if (!d.extra) {
        const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
        if (m) {
          // Fragmented formats estimate their size; the fragment counter is exact.
          const frag = line.match(/\(frag (\d+)\/(\d+)\)/)
          const raw = frag && Number(frag[2]) > 0 ? Math.min(100, (Number(frag[1]) / Number(frag[2])) * 100) : parseFloat(m[1])
          const pass = Math.min(Math.max(d.pass, 1), streams)
          // Video ≈ 85 % of the bytes, audio ≈ 15 %.
          const w = streams === 2 ? [0.85, 0.15] : Array(streams).fill(1 / streams)
          const within = w.slice(0, pass - 1).reduce((a, x) => a + x, 0) + w[pass - 1] * (raw / 100)
          const overall = job.total ? ((liveRef.current.item + within) / total) * 100 : within * 100
          liveRef.current.itemPct = within * 100
          liveRef.current.progress = Math.max(liveRef.current.progress, Math.min(99.9, overall))
          const st = parseDlStats(line)
          if (st?.speed != null) {
            speedRef.current = smoothSpeed(speedRef.current, st.speed)
            liveRef.current.speed = speedRef.current.speed
          }
        }
      }
      if (/\[(Merger|ExtractAudio|VideoConvertor|FixupM3u8|ffmpeg|SplitChapters)\]/.test(line)) liveRef.current.speed = null
      if (/were skipped/.test(line)) skippedRef.current = true
      schedule()
    })
    return () => {
      off && off()
      if (flushRef.current) cancelAnimationFrame(flushRef.current)
    }
  }, [])

  // Download finished / failed / cancelled → notification (spec §5.6).
  useEffect(() => {
    const off = window.api?.onComplete((p) => {
      setStopping(false)
      if (p.cancelled) toastMsg('info', 'Download cancelled')
      else if (p.alreadyDownloaded) toastMsg('info', p.message || 'File already downloaded')
      else if (p.success && skippedRef.current) toastMsg('warning', 'Done, but some items couldn’t be downloaded and were skipped.')
      else if (p.success) toastMsg('success', 'Download complete')
      else toastMsg(p.botCheck ? 'warning' : 'error', p.message || 'Download failed')
    })
    return () => off && off()
  }, [toastMsg])

  // Countdown re-render while waiting between queued items.
  useEffect(() => {
    if (!wait) return
    const t = setInterval(() => setTick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [wait])

  /* --- reading a link ----------------------------------------------------------- */
  const readLink = useCallback(
    async (raw) => {
      const url = String(raw || '').trim()
      if (!url) return
      const req = ++readReq.current
      const link = detectLink(url)
      setPop(null)
      setQOpen(false)
      setMore(false)
      if (link.kind === 'unsupported') {
        setEd({ view: 'error', url, src: null, alt: null, sel: [], cfg: null, fromWatch: false, err: UNSUPPORTED(url) })
        return
      }
      setEd((e) => ({ ...e, view: 'fetching', url, err: null }))
      const fail = (msg, noun) => {
        if (readReq.current !== req) return
        setEd({ view: 'error', url, src: null, alt: null, sel: [], cfg: null, fromWatch: false, err: errorCard(msg, noun, url) })
      }
      try {
        let src = null
        if (link.kind === 'vid' || link.kind === 'plvid') {
          const info = await window.api.getVideoInfo(link.videoUrl)
          if (readReq.current !== req) return
          if (!info || info.error) return fail(info?.error, 'video')
          // Same saved info → no new YouTube request.
          const ch = await window.api.getChapters(link.videoUrl).catch(() => null)
          if (readReq.current !== req) return
          src = videoSource(info, ch?.chapters, link)
          src.listUrl = link.listUrl || null
        } else if (link.kind === 'pl') {
          const info = await window.api.getPlaylistInfo(link.listUrl)
          if (readReq.current !== req) return
          if (!info || info.error || !info.tracks?.length) return fail(info?.error || 'The playlist does not exist or is private.', 'playlist')
          src = ytListSource(info, link)
        } else {
          const meta = await window.api.fetchMetadata({ platform: 'soundcloud', url: link.url })
          if (readReq.current !== req) return
          if (!meta || meta.error) return fail(meta?.error, link.kind === 'sc' ? 'set' : 'track')
          src = scSource(meta, link.url)
        }
        const sel = src.tracks.filter((t) => !t.protected).map((t) => t.id)
        setEd({ view: 'ready', url, src, alt: null, sel, cfg: makeCfg(src, lastCfgRef.current), fromWatch: link.kind === 'plvid', err: null })
      } catch (e) {
        fail(e?.message, 'link')
      }
    },
    []
  )

  const clearEditor = () => {
    readReq.current += 1
    setEd({ view: 'empty', url: '', src: null, alt: null, sel: [], cfg: null, fromWatch: false, err: null })
    setPop(null)
    setMore(false)
  }

  // Ctrl+V anywhere outside a text field reads the pasted link.
  useEffect(() => {
    const onPaste = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const t = e.clipboardData?.getData('text')
      if (t) readLink(t)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [readLink])

  // "Whole playlist" / "This video only" for a video opened from a playlist link.
  const [altLoading, setAltLoading] = useState(false)
  const switchToList = async () => {
    if (ed.src?.type === 'list' || !ed.src?.listUrl || altLoading) return
    if (ed.alt?.type === 'list') {
      setEd((e) => ({ ...e, src: e.alt, alt: e.src, sel: e.alt.tracks.map((t) => t.id), cfg: { ...e.cfg, trimOn: false, split: false } }))
      return
    }
    setAltLoading(true)
    const info = await window.api.getPlaylistInfo(ed.src.listUrl).catch(() => null)
    setAltLoading(false)
    if (!info || info.error || !info.tracks?.length) {
      toastMsg('error', info?.error || 'Couldn’t read the playlist.')
      return
    }
    const list = ytListSource(info, { listUrl: ed.src.listUrl })
    setEd((e) => ({ ...e, src: list, alt: e.src, sel: list.tracks.map((t) => t.id), cfg: { ...e.cfg, trimOn: false, split: false } }))
  }
  const switchToVideo = () => {
    if (ed.src?.type === 'video' || ed.alt?.type !== 'video') return
    setEd((e) => ({ ...e, src: e.alt, alt: e.src, sel: e.alt.tracks.map((t) => t.id) }))
  }

  /* --- editing ------------------------------------------------------------------ */
  const setCfg = (patch) =>
    setEd((e) => {
      const cfg = { ...e.cfg, ...patch }
      lastCfgRef.current = { ...lastCfgRef.current, format: cfg.format, res: cfg.res, codec: cfg.codec, afmt: cfg.afmt, scfmt: cfg.scfmt, meta: cfg.meta, folder: cfg.folder }
      if (patch.codec) window.api?.setConfig({ codec: cfg.codec })
      return { ...e, cfg }
    })

  const chooseFolder = async () => {
    setPop(null)
    const f = await window.api?.selectFolder()
    if (!f) return
    setCfg({ folder: f })
    window.api?.setConfig({ outputFolder: f })
    window.api?.getFolders?.().then((x) => x && setFolders(x))
  }
  const pickFolder = (path) => {
    setCfg({ folder: path })
    window.api?.setConfig({ outputFolder: path })
    setPop(null)
  }

  /* --- queue & downloads ------------------------------------------------------- */
  const resetLive = () => {
    liveRef.current = { progress: 0, item: 0, itemPct: 0, speed: null }
    speedRef.current = null
    dl.current = { pass: 1, dest: 0, extracts: 0, extra: false }
    setLive({ ...liveRef.current })
  }

  // A cancelled / failed item comes back into the editor with its settings —
  // unless the user is already editing another link.
  const reopenInEditor = (job) => {
    setEd((e) =>
      e.view === 'empty'
        ? { view: 'ready', url: job.url, src: job.src, alt: job.alt, sel: job.sel, cfg: job.cfg, fromWatch: job.fromWatch, err: null }
        : e
    )
  }

  const runJob = async (job) => {
    activeRef.current = job
    skippedRef.current = false
    setActive(job)
    setStopping(false)
    resetLive()
    let res = null
    try {
      res = await window.api?.[job.api](job.params)
    } catch (e) {
      res = { success: false, error: e?.message }
      toastMsg('error', e?.message || 'Download failed')
    }
    const snapshot = { ...liveRef.current }
    activeRef.current = null
    setActive(null)
    return { res: res || { success: false }, snapshot }
  }

  const waitBeforeNext = async (seconds, bot) => {
    skipRef.current = false
    const until = Date.now() + seconds * 1000
    setWait({ until, bot })
    while (Date.now() < until && !skipRef.current && !abortRef.current) await new Promise((r) => setTimeout(r, 200))
    setWait(null)
  }

  // One download at a time. Each finished item pulls the next after 5 s; a
  // YouTube bot check pauses the queue (the blocked item goes back to the
  // front) for as long as the message says, then it resumes on its own.
  const runQueue = async (first) => {
    let job = first
    abortRef.current = false
    setDoneJob(null)
    while (job) {
      const { res, snapshot } = await runJob(job)
      const ok = res.success || res.alreadyDownloaded
      if (res.botCheck && (job.botTries || 0) < 2 && !abortRef.current) {
        setQueueBoth([{ ...job, botTries: (job.botTries || 0) + 1, last: snapshot, params: { ...job.params, queued: true } }, ...queueRef.current])
      }
      if (!queueRef.current.length || abortRef.current) {
        if (ok) setDoneJob(job)
        else if (!abortRef.current) reopenInEditor(job)
        break
      }
      await waitBeforeNext(res.botCheck ? res.retryAfterSec || 30 : QUEUE_GAP_SEC, !!res.botCheck)
      if (abortRef.current || !queueRef.current.length) {
        if (ok) setDoneJob(job)
        break
      }
      const [next, ...rest] = queueRef.current
      setQueueBoth(rest)
      // Queued items don't retry on their own: the queue's pause does that.
      job = { ...next, params: { ...next.params, queued: true } }
    }
  }

  const busy = !!active || !!wait

  const startOrQueue = () => {
    if (ed.view !== 'ready') return
    const job = buildJob(ed, ++seqRef.current)
    if (busy) {
      const key = jobKey(job)
      if ((activeRef.current && jobKey(activeRef.current) === key) || queueRef.current.some((j) => jobKey(j) === key)) {
        toastMsg('info', activeRef.current && jobKey(activeRef.current) === key ? 'Already downloading' : 'Already in the queue')
        return
      }
      const q = [...queueRef.current, job]
      setQueueBoth(q)
      toastMsg('info', `Added to queue (${(activeRef.current ? 1 : 0) + q.length})`)
      clearEditor()
      return
    }
    clearEditor()
    runQueue(job)
  }

  const cancelActive = async () => {
    setStopping(true)
    await window.api?.cancelDownload()
  }
  const startNow = () => {
    skipRef.current = true
  }
  const removeQueued = (id) => {
    const q = queueRef.current.filter((j) => j.id !== id)
    setQueueBoth(q)
    // Nothing left to wait for: end the pause now.
    if (!q.length && !activeRef.current) skipRef.current = true
  }
  const clearQueue = () => {
    setQueueBoth([])
    setQOpen(false)
    if (!activeRef.current) abortRef.current = true
    toastMsg('info', 'Queue cleared')
  }
  const downloadAgain = () => {
    if (!doneJob || busy) return
    const job = { ...doneJob, id: ++seqRef.current, botTries: 0, last: null, params: { ...doneJob.params, queued: false } }
    runQueue(job)
  }

  /* --- settings: window, proxy, engine --------------------------------------- */
  const selectWindow = (k) => {
    setWindowSize(k)
    window.api?.setWindowSize(k)
  }

  const saveProxy = async (draft, announce) => {
    const res = await window.api?.setProxy({
      enabled: draft.on,
      type: draft.type,
      host: draft.host,
      port: Number(draft.port),
      username: draft.username,
      password: draft.password
    })
    if (!res?.ok) return false
    const was = proxySaved?.enabled
    setProxySaved(res.proxy)
    if (announce || was !== res.proxy.enabled) {
      toastMsg('info', res.proxy.enabled ? `Proxy on · ${res.proxy.type.toUpperCase()} ${res.proxy.host}:${res.proxy.port}` : 'Proxy off')
    }
    return true
  }

  const proxyToggle = () => {
    const next = { ...pxDraft, on: !pxDraft.on }
    setPxDraft(next)
    setPxTest(null)
    if (!next.on) saveProxy(next, true)
    else if (proxyValid(next)) saveProxy(next, true)
  }
  const proxyField = (patch) => {
    const next = { ...pxDraft, ...patch }
    setPxDraft(next)
    setPxTest(null)
    clearTimeout(pxTimer.current)
    if (next.on && proxyValid(next)) pxTimer.current = setTimeout(() => saveProxy(next, false), 600)
  }
  const proxyHost = (v) => {
    const parsed = parseProxyLink(v)
    if (parsed) {
      proxyField({ ...parsed })
      toastMsg('info', 'Filled every proxy field from the link')
    } else proxyField({ host: v })
  }
  const proxyTest = async () => {
    if (!proxyValid(pxDraft)) {
      setPxTest({ color: 'var(--red)', text: 'Enter a host and a port between 1 and 65535.' })
      return
    }
    setPxTest({ color: 'var(--ink2)', text: 'Testing…' })
    const r = await window.api?.testProxy({ type: pxDraft.type, host: pxDraft.host, port: Number(pxDraft.port), username: pxDraft.username, password: pxDraft.password })
    setPxTest(r?.ok ? { color: 'var(--grn)', text: `Working · ${r.ms} ms` } : { color: 'var(--red)', text: r?.error || 'The test failed.' })
  }

  const openSettings = (focusProxy) => {
    setPop(null)
    setQOpen(false)
    setSettingsOpen(true)
    window.api?.getEngineVersions?.().then((v) => v && setEngine((e) => ({ ...e, ...v })))
    if (focusProxy) setTimeout(() => proxyRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
  }
  const checkEngine = async () => {
    if (ytdlpBusyRef.current) {
      setEngine((e) => ({ ...e, msg: 'yt-dlp is already updating…', msgColor: 'var(--ink2)' }))
      return
    }
    ytdlpBusyRef.current = true
    setEngine((e) => ({ ...e, busy: true, msg: 'Checking…', msgColor: 'var(--ink2)' }))
    const r = await window.api?.checkYtdlpUpdate()
    if (r?.updateAvailable) {
      setEngine((e) => ({ ...e, msg: `Updating yt-dlp to ${r.latest}…` }))
      const u = await window.api?.updateYtdlp()
      const v = await window.api?.getEngineVersions?.()
      setYtdlpUpdate(u?.success ? null : { status: 'failed', latest: r.latest })
      setEngine((e) => ({ ...e, ...(v || {}), busy: false, msg: u?.success ? `yt-dlp updated to ${u.version || r.latest}` : 'The update failed. Try again later.', msgColor: u?.success ? 'var(--grn)' : 'var(--red)' }))
    } else if (r?.error) {
      setEngine((e) => ({ ...e, busy: false, msg: 'Couldn’t check for updates. Check your connection.', msgColor: 'var(--red)' }))
    } else {
      setEngine((e) => ({ ...e, busy: false, msg: 'yt-dlp and ffmpeg are up to date', msgColor: 'var(--grn)' }))
    }
    ytdlpBusyRef.current = false
  }
  const openLink = (which) => {
    window.api?.trackLink(which)
    window.open(LINKS[which], '_blank', 'noopener,noreferrer')
  }

  const dismissWhatsNew = () => {
    if (!whatsNew) return
    const ack = [...new Set([...ackRef.current, ...whatsNew.block.ids])]
    ackRef.current = ack
    setWhatsNew(null)
    window.api?.setConfig({ whatsNewAck: ack, ...(version ? { lastSeenVersion: version } : {}) })
  }

  // Esc closes popovers, then the sheet, then dialogs.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (pop || qOpen) {
        setPop(null)
        setQOpen(false)
      } else if (settingsOpen) setSettingsOpen(false)
      else if (whatsNew) dismissWhatsNew()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  /* ============================================================================ */
  /*  Derived view                                                                */
  /* ============================================================================ */

  const editing = ed.view === 'fetching' || ed.view === 'error' || ed.view === 'ready'
  const pausedItem = wait?.bot ? queue[0] : null
  const mode = editing
    ? ed.view
    : active
      ? 'active'
      : wait
        ? wait.bot
          ? 'paused'
          : 'next'
        : doneJob
          ? 'done'
          : 'empty'

  // The thing the main area and the dock describe.
  let subj = null
  let locked = false
  if (mode === 'ready') subj = { src: ed.src, sel: ed.sel, cfg: ed.cfg }
  else if (mode === 'active') {
    subj = active
    locked = true
  } else if (mode === 'paused' || mode === 'next') {
    subj = queue[0] || null
    locked = true
  } else if (mode === 'done') {
    subj = doneJob
    locked = true
  }
  const src = subj?.src || null
  const cfg = subj?.cfg || null
  const isSc = src?.kind === 'sc'
  const single = src?.type === 'video'
  const est = subj ? estimate(src, subj.sel, cfg) : null
  const waitLeft = wait ? Math.max(0, Math.ceil((wait.until - Date.now()) / 1000)) : 0

  // Progress numbers for the subject.
  const lastSnap = pausedItem?.last || null
  const prog = mode === 'done' ? 100 : mode === 'active' ? live.progress : mode === 'paused' ? lastSnap?.progress || 0 : 0
  const pct = Math.floor(prog)
  const itemIdx = mode === 'active' ? live.item : mode === 'paused' ? lastSnap?.item || 0 : 0
  const speedMB = mode === 'active' && live.speed ? live.speed / 1024 ** 2 : null
  const doneMB = est ? (est.mb * prog) / 100 : 0
  const trk = est && !single ? `track ${Math.min(est.n, itemIdx + 1)} of ${est.n} · ` : ''
  const sizePart = est ? `${fmtMB(doneMB)} / ~${fmtMB(est.mb)}` : ''
  const progLine = est
    ? trk + sizePart + (speedMB ? ` · ${speedMB.toFixed(1)} MB/s · ${hms(Math.max(0, est.mb - doneMB) / speedMB)} left` : '')
    : ''

  // Header (kicker / headline / meta) per state — spec §5.2 list layout table.
  let hK = ''
  let hHead = ''
  let hAcc = ''
  let hAccC = 'var(--accText)'
  let hMeta = ''
  if (src) {
    const tot = src.tracks.reduce((a, t) => a + (t.dur || 0), 0)
    const cap = isSc ? 'audio only' : src.max ? `up to ${src.max}p` : ''
    if (mode === 'ready') {
      hK = src.label.toUpperCase()
      hHead = single ? '' : src.title
      hMeta = single
        ? [hms(src.duration), cap, src.chapters?.length ? `${src.chapters.length} chapters` : ''].filter(Boolean).join(' · ')
        : [`${src.tracks.length} ${src.tracks.length === 1 ? 'track' : 'tracks'}`, hms(tot), cap].filter(Boolean).join(' · ')
    } else if (mode === 'active') {
      hK = src.title.toUpperCase()
      hHead = 'Downloading '
      hAcc = `${pct}%`
      hMeta = stopping ? 'Stopping…' : progLine
    } else if (mode === 'paused') {
      hK = src.title.toUpperCase()
      hHead = 'Paused at '
      hAcc = `${pct}%`
      hAccC = 'var(--yel)'
      hMeta = trk + sizePart
    } else if (mode === 'next') {
      hK = `UP NEXT · ${queue.length} IN QUEUE`
      hHead = 'Next download in '
      hAcc = `${waitLeft} s`
      hMeta = `${src.title} · ${summaryOf(subj)}`
    } else if (mode === 'done') {
      hK = src.title.toUpperCase()
      hHead = 'Saved. '
      hAcc = `${est.unit}, ${fmtMB(est.mb)}`
      hAccC = 'var(--grn)'
      hMeta = `→ ${cfg.folder}`
    }
  }
  const pausedText = `Queue paused · YouTube bot check · resuming in ${waitLeft} s`

  const openFolder = async () => {
    const r = await window.api?.openFolder(cfg?.folder)
    if (r?.ok) toastMsg('info', `Opened ${r.path}`)
    else toastMsg('error', `Couldn't open ${cfg?.folder || 'the folder'}.`)
  }
  const newDownload = () => {
    setDoneJob(null)
    clearEditor()
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const actions = {
    switch:
      mode === 'ready' && ed.fromWatch
        ? { list: src?.type === 'list', toList: switchToList, toVideo: switchToVideo, loading: altLoading }
        : null,
    paused: mode === 'paused',
    next: mode === 'next',
    done: mode === 'done',
    onResume: startNow,
    onStartNow: startNow,
    onProxy: () => openSettings(true),
    onOpenFolder: openFolder,
    onNew: newDownload
  }

  /* --- rows (list layout) ------------------------------------------------------ */
  let listView = null
  if (src && !single && ['ready', 'active', 'paused', 'next', 'done'].includes(mode)) {
    const isReady = mode === 'ready'
    const rate = ratePerMin(isSc, cfg)
    const shown = isReady ? src.tracks : src.tracks.filter((t) => subj.sel.includes(t.id))
    const rows = shown.map((t, k) => {
      const i = src.tracks.indexOf(t)
      let st = 'wait'
      let rowPct = 0
      if (isReady) st = t.protected ? 'drm' : ed.sel.includes(t.id) ? 'on' : 'off'
      else if (mode === 'done') st = 'done'
      else if (mode === 'active' || mode === 'paused') {
        if (k < itemIdx) st = 'done'
        else if (k === itemIdx) {
          st = mode === 'paused' ? 'paused' : 'active'
          rowPct = Math.floor(mode === 'paused' ? lastSnap?.itemPct || 0 : live.itemPct)
        }
      }
      return {
        key: t.id,
        n: String(i + 1).padStart(2, '0'),
        a: t.a,
        t: t.t,
        full: t.full,
        thumb: t.thumb,
        dur: t.dur ? hms(t.dur) : '',
        size: `~${fmtMB(((t.dur || 0) / 60) * rate)}`,
        st,
        pct: rowPct,
        dim: isReady && st !== 'on',
        onClick:
          isReady && !t.protected
            ? () => setEd((e) => ({ ...e, sel: e.sel.includes(t.id) ? e.sel.filter((z) => z !== t.id) : src.tracks.filter((x) => x.id === t.id || e.sel.includes(x.id)).map((x) => x.id) }))
            : undefined
      }
    })
    const selectable = src.tracks.filter((t) => !t.protected)
    const all = selectable.length > 0 && ed.sel.length >= selectable.length
    const none = ed.sel.length === 0
    listView = {
      thumb: isReady ? src.thumbnail || null : undefined,
      kicker: hK,
      head: hHead,
      acc: hAcc,
      accColor: hAccC,
      meta: hMeta,
      actions,
      pill: mode === 'paused' ? pausedText : null,
      selectAll: isReady
        ? {
            state: all ? 'on' : none ? 'off' : 'part',
            onClick: () => setEd((e) => ({ ...e, sel: all ? [] : selectable.map((t) => t.id) }))
          }
        : null,
      caption: isReady ? `${ed.sel.length} OF ${src.tracks.length} SELECTED` : 'TITLE',
      statusCaption: isReady ? 'EST. SIZE' : 'STATUS',
      rows
    }
  }

  let singleView = null
  if (src && single && ['ready', 'active', 'paused', 'next', 'done'].includes(mode)) {
    const showBar = mode === 'active' || mode === 'paused'
    singleView = {
      thumbnail: src.thumbnail,
      dur: hms(src.duration),
      kicker: mode === 'next' ? hK : src.label.toUpperCase(),
      title: src.title,
      by: src.by,
      head: mode === 'ready' ? '' : mode === 'next' ? hHead : hHead,
      acc: hAcc,
      accColor: hAccC,
      meta: hMeta,
      bar: showBar ? prog : null,
      barColor: mode === 'paused' ? 'var(--yel)' : 'var(--accGrad)',
      pill: mode === 'paused' ? pausedText : null,
      actions
    }
  }

  /* --- output sentence (spec §5.3) --------------------------------------------- */
  const folderName = (p) => {
    if (!p) return 'Downloads'
    const std = folders.standard.find((f) => f.path === p)
    if (std) return std.name
    return p.split(/[\\/]/).filter(Boolean).pop() || p
  }

  const tokClick = (id, e) => {
    if (id === 'trimS' || id === 'trimE' || id === 'split') {
      setMore(true)
      setPop(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const right = r.left + 310 > window.innerWidth
    setQOpen(false)
    setPop((p) => (p?.id === id ? null : { id, right }))
  }

  const menuFor = (id) => {
    const set = (patch) => {
      setCfg(patch)
      setPop(null)
    }
    const O = (label, desc, on, pick, why) => ({ label, desc, on, pick, why })
    const what = single ? 'video' : 'playlist'
    switch (id) {
      case 'format':
        return {
          title: 'FORMAT',
          opts: [
            O('Video', `MP4 or MKV · up to ${src.max || (cfg.codec === 'h264' ? 1080 : 2160)}p`, !isSc && cfg.format === 'video', () => set({ format: 'video' }), isSc ? 'SoundCloud is audio only' : null),
            O('Audio only', isSc ? 'Original or WAV' : 'WAV or MP3 · no picture', isSc || cfg.format === 'audio', () => set({ format: 'audio' }))
          ]
        }
      case 'res':
        return {
          title: 'QUALITY',
          opts: [
            [1080, 'Full HD'],
            [1440, '2K'],
            [2160, '4K']
          ].map(([r, l]) =>
            O(
              `${r}p`,
              r > 1080 && cfg.codec === 'h264' ? `${l} · switches to Best quality` : l,
              cfg.res === r,
              () => set(r > 1080 ? { res: r, codec: 'best' } : { res: r }),
              // 1080p means "best up to 1080p", so it's always available.
              src.max && r > 1080 && r > src.max ? `This ${what} tops out at ${src.max}p` : null
            )
          )
        }
      case 'codec':
        return {
          title: 'ENCODING',
          opts: [
            O('H.264', cfg.res > 1080 ? 'Plays everywhere · max 1080p · drops to 1080p' : 'Plays everywhere · max 1080p · MP4', cfg.codec === 'h264', () => set({ codec: 'h264', res: Math.min(cfg.res, 1080) })),
            O('Best quality', 'VP9 / AV1 · smaller files · MKV', cfg.codec === 'best', () => set({ codec: 'best' }))
          ]
        }
      case 'afmt':
        return {
          title: 'AUDIO FORMAT',
          opts: [
            O('WAV 44.1 kHz', 'Lossless · ~10 MB per minute', cfg.afmt === 'wav', () => set({ afmt: 'wav' })),
            O('MP3 320 kbps', 'Plays anywhere · ~2.4 MB per minute', cfg.afmt === 'mp3', () => set({ afmt: 'mp3' }))
          ]
        }
      case 'scfmt':
        return {
          title: 'SOUNDCLOUD QUALITY',
          opts: [
            O('Original', 'Best available · no re-encoding', cfg.scfmt === 'original', () => set({ scfmt: 'original' })),
            O('WAV', 'Converted to WAV · lossless container', cfg.scfmt === 'wav', () => set({ scfmt: 'wav' }))
          ]
        }
      case 'meta':
        return {
          title: 'METADATA',
          opts: [
            O('With metadata', 'Title, artist and cover art embedded', cfg.meta, () => set({ meta: true })),
            O('Without metadata', 'Clean file · nothing embedded', !cfg.meta, () => set({ meta: false }))
          ]
        }
      case 'folder': {
        const list = [...folders.standard, ...folders.recent.filter((r) => !folders.standard.some((s) => s.path === r.path))]
        if (cfg.folder && !list.some((f) => f.path === cfg.folder)) list.push({ name: folderName(cfg.folder), path: cfg.folder })
        return {
          title: 'SAVE TO',
          opts: [...list.map((f) => O(f.name, f.path, cfg.folder === f.path, () => pickFolder(f.path))), O('Choose folder…', 'Opens the system folder picker', false, chooseFolder)]
        }
      }
      default:
        return null
    }
  }

  const segs = useMemo(() => {
    const out = []
    const T = (text) => out.push({ text })
    const B = (bold) => out.push({ bold })
    if (!subj) {
      T('Save ')
      B('everything')
      T(' as ')
      ;['video', '1080p', 'H.264', 'with metadata', 'Downloads'].forEach((l, i, arr) => {
        out.push({ label: l, locked: true })
        T(i === 0 ? ' in ' : i === arr.length - 1 ? '.' : i === arr.length - 2 ? ', into ' : ', ')
      })
      return out
    }
    const K = (id, label) => {
      const open = !locked && pop?.id === id
      const noMenu = id === 'trimS' || id === 'trimE' || id === 'split'
      out.push({ label, locked, open, right: open && pop.right, menu: open && !noMenu ? menuFor(id) : noMenu ? null : !locked ? { title: '', opts: [] } : null, onClick: (e) => tokClick(id, e) })
    }
    T('Save ')
    B(single ? 'this' : `${est.n} ${est.n === 1 ? 'track' : 'tracks'}`)
    T(' as ')
    K('format', cfg.format === 'audio' || isSc ? 'audio' : 'video')
    T(' in ')
    if (isSc) K('scfmt', cfg.scfmt === 'wav' ? 'WAV' : 'original quality')
    else if (cfg.format === 'audio') K('afmt', cfg.afmt === 'wav' ? 'WAV 44.1 kHz' : 'MP3 320 kbps')
    else {
      K('res', `${cfg.res}p`)
      T(', ')
      K('codec', cfg.codec === 'h264' ? 'H.264' : 'best quality')
    }
    if (single && cfg.trimOn) {
      T(', from ')
      K('trimS', cfg.tStart)
      T(' to ')
      K('trimE', cfg.tEnd)
    }
    if (single && cfg.split && src.chapters?.length) {
      T(', ')
      K('split', `split into ${src.chapters.length} chapters`)
    }
    T(', ')
    K('meta', cfg.meta ? 'with metadata' : 'without metadata')
    T(', into ')
    K('folder', folderName(cfg.folder))
    T('.')
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subj, locked, pop, folders, est?.n])

  const dockLabel = !subj
    ? 'OUTPUT · PASTE A LINK TO START'
    : locked
      ? mode === 'done'
        ? 'OUTPUT · LAST DOWNLOAD'
        : 'OUTPUT · LOCKED WHILE THIS RUNS'
      : busy
        ? 'NEXT IN QUEUE · KEEPS ITS OWN SETTINGS'
        : 'OUTPUT · CLICK A HIGHLIGHTED WORD TO CHANGE IT'

  /* --- more options (spec §5.4) -------------------------------------------------- */
  let moreView = null
  if (subj && !locked) {
    const ytSingle = single && !isSc
    const chCount = src.chapters?.length || 0
    let trimInfo = ''
    if (ytSingle) {
      if (!cfg.trimOn) trimInfo = `Video length ${hms(src.duration)}`
      else if (est.terr) trimInfo = est.terr
      else trimInfo = `Selection ${hms(est.secs)} · ≈ ${fmtMB(est.mb)}`
    }
    moreView = {
      open: more,
      toggle: () => {
        setMore((m) => !m)
        setPop(null)
      },
      summary: !more && ytSingle ? (cfg.trimOn ? `· Trim ${cfg.tStart}–${cfg.tEnd}` : cfg.split && chCount ? `· Split into ${chCount} chapters` : '') : '',
      note: !single
        ? 'Trim and split by chapters work on single videos. Paste a video link to use them.'
        : isSc
          ? 'Trim and split by chapters work on YouTube videos. Paste a video link to use them.'
          : null,
      trim: ytSingle
        ? {
            on: cfg.trimOn,
            err: est.terr,
            toggle: () => setCfg(cfg.trimOn ? { trimOn: false } : { trimOn: true, split: false }),
            note: cfg.split ? 'Turns off Split' : '',
            start: cfg.tStart,
            end: cfg.tEnd,
            onStart: (e) => setCfg({ tStart: fmtT(e.target.value), trimOn: true, split: false }),
            onEnd: (e) => setCfg({ tEnd: fmtT(e.target.value), trimOn: true, split: false }),
            info: trimInfo
          }
        : null,
      split:
        ytSingle && chCount
          ? {
              on: cfg.split,
              toggle: () => setCfg(cfg.split ? { split: false } : { split: true, trimOn: false }),
              text: `Split into ${chCount} chapters, one file each`,
              note: cfg.trimOn ? 'Turns off Trim' : 'Uses the chapter titles as file names'
            }
          : null
    }
  }

  /* --- right column (spec §5.5) --------------------------------------------------- */
  let sizeL = '—'
  let sizeR = ''
  if (est) {
    if (mode === 'ready') {
      sizeL = single ? (cfg.trimOn && !est.terr ? `TRIMMED · ${hms(est.secs)}` : hms(est.secs)) : `${est.n} OF ${src.tracks.length} · ${hms(est.secs)}`
      sizeR = `≈ ${fmtMB(est.mb)} ${est.cont}`
    } else {
      sizeL = 'THIS DOWNLOAD'
      sizeR = `~${fmtMB(est.mb)} ${est.cont}`
    }
  }

  let button
  if (mode === 'ready') {
    // Wait for the yt-dlp update (a few seconds) instead of a download that would fail.
    if (ytdlpUpdate?.status === 'updating' && !busy) button = { kind: 'dis', label: 'Updating yt-dlp…' }
    else if (est.n === 0) button = { kind: 'dis', label: 'Select at least one track' }
    else if (est.terr) button = { kind: 'dis', label: 'Fix the time range' }
    else if (busy) button = { kind: 'ready', label: 'Add to queue', glyph: '+', onClick: startOrQueue }
    else
      button = {
        kind: 'ready',
        label: single ? (isSc || cfg.format === 'audio' ? 'Download audio' : 'Download video') : `Download ${est.n} ${est.n === 1 ? 'track' : 'tracks'}`,
        glyph: '↓',
        onClick: startOrQueue
      }
  } else if (mode === 'active') {
    button = {
      kind: 'prog',
      pct: prog,
      fill: 'var(--acc)',
      t1: `${pct}%`,
      t2: stopping ? 'stopping…' : single ? 'downloading' : `track ${Math.min(est.n, itemIdx + 1)} of ${est.n}`,
      act: 'Cancel',
      onAct: cancelActive,
      actDisabled: stopping
    }
  } else if (mode === 'paused') {
    button = { kind: 'prog', pct: prog, fill: 'var(--yel)', t1: 'Paused', t2: `${pct}% · bot check`, act: 'Resume', onAct: startNow }
  } else if (mode === 'next') {
    button = { kind: 'prog', pct: 0, fill: 'var(--acc)', t1: `Next in ${waitLeft} s`, t2: `${queue.length} waiting`, act: 'Start now', onAct: startNow }
  } else if (mode === 'done') {
    button = { kind: 'ready', label: 'Download again', glyph: '↻', onClick: downloadAgain }
  } else if (mode === 'fetching') button = { kind: 'dis', label: 'Reading link…' }
  else button = { kind: 'dis', label: 'Paste a link first' }

  const qCount = (active ? 1 : 0) + queue.length
  const showChip = busy || queue.length > 0
  const chipSub = active ? `${Math.floor(live.progress)}%` : wait ? (wait.bot ? 'paused' : `next in ${waitLeft} s`) : ''
  let qView = null
  if (qOpen && showChip) {
    const curJob = active || pausedItem
    const rest = active ? queue : pausedItem ? queue.slice(1) : queue
    qView = {
      label: `Queue · ${qCount}`,
      cur: curJob
        ? {
            title: curJob.src.title,
            pct: Math.floor(active ? live.progress : pausedItem.last?.progress || 0),
            color: active ? 'var(--acc)' : 'var(--yel)',
            meta: (active ? '' : 'Paused · YouTube bot check · ') + summaryOf(curJob)
          }
        : null,
      note: wait && !wait.bot ? `Next download in ${waitLeft} s` : null,
      items: rest.map((j, i) => ({ id: j.id, n: String(i + (curJob ? 2 : 1)), title: j.src.title, meta: summaryOf(j), remove: () => removeQueued(j.id) })),
      clear: clearQueue
    }
  }

  /* --- URL bar ---------------------------------------------------------------------- */
  let chip = { label: 'No link', dot: 'var(--ink3)' }
  if (ed.view === 'fetching') chip = { label: 'Reading…', dot: 'var(--acc)' }
  else if (ed.view === 'error') chip = { label: 'Unreadable', dot: 'var(--red)' }
  else if (ed.view === 'ready' && ed.src) {
    const s = ed.src
    chip = { label: s.kind === 'sc' ? (s.type === 'list' ? 'SoundCloud · Set' : 'SoundCloud · Track') : `YouTube · ${s.type === 'list' ? 'Playlist' : 'Video'}`, dot: 'var(--grn)' }
  }
  const pasteFromClipboard = async () => {
    let t = ''
    try {
      t = await navigator.clipboard.readText()
    } catch {
      t = ''
    }
    if (t && t.trim()) readLink(t)
    else toastMsg('info', 'Copy a YouTube or SoundCloud link first.')
  }

  /* --- banner (spec §5.7) ------------------------------------------------------------ */
  let banner = null
  const u = appUpdate
  if (u?.status === 'downloading') banner = { key: 'dl', title: `Downloading update${u.version ? ` ${u.version}` : ''}`, progress: Math.round(u.percent || 0) }
  else if (u?.status === 'downloaded')
    banner = { key: `ready-${u.version}`, title: `${u.version || 'The update'} is ready.`, sub: ' Restart to install.', action: 'Restart to install', onAction: () => window.api?.installUpdate(), later: true }
  else if (u?.status === 'available')
    banner = { key: `avail-${u.version}`, title: `Version ${u.version} available`, sub: '', action: 'Update now', onAction: () => window.api?.downloadUpdate() }
  else if (u?.status === 'portable-available')
    banner = {
      key: `port-${u.version}`,
      title: `Version ${u.version} available`,
      sub: ' · this portable copy can’t update itself',
      action: 'Download',
      onAction: () => window.open(u.downloadUrl || 'https://github.com/EvroHQ/EvroHQ-Downloader/releases/latest', '_blank', 'noopener,noreferrer')
    }
  else if (ytdlpUpdate?.status === 'updating')
    banner = { key: 'ytdlp-up', title: `Updating yt-dlp to ${ytdlpUpdate.latest}`, progress: ytdlpUpdate.pct || 0 }
  else if (ytdlpUpdate?.status === 'failed')
    // Can't be dismissed: an outdated yt-dlp is what makes YouTube downloads fail.
    banner = {
      key: 'ytdlp-fail',
      title: 'Couldn’t update yt-dlp',
      sub: ' · YouTube downloads may fail until it’s updated',
      action: 'Try again',
      onAction: autoUpdateYtdlp,
      noDismiss: true
    }
  if (banner && bannerHidden === banner.key) banner = null
  if (banner && banner.progress == null && !banner.noDismiss) banner.onDismiss = () => setBannerHidden(banner.key)

  const proxyOn = !!(proxySaved?.enabled && proxySaved?.host)
  const dockDim = !subj

  /* ============================================================================ */
  return (
    <div className={`app${windowSize === 'compact' ? ' compact' : ''}`} data-theme-key={resolveTheme(theme)}>
      <TitleBar
        version={version}
        proxyOn={proxyOn}
        onSettings={() => openSettings(false)}
        onMinimize={() => window.api?.minimizeWindow()}
        onClose={() => window.api?.closeWindow()}
      />
      <Banner banner={banner} />

      <UrlBar
        url={ed.url}
        chip={chip}
        state={ed.view === 'error' ? 'error' : ed.view === 'ready' ? 'ready' : ''}
        placeholder={busy ? 'Paste another link to add it to the queue…' : 'Paste a YouTube or SoundCloud link…'}
        inputRef={inputRef}
        onChange={(e) => setEd((x) => ({ ...x, url: e.target.value, view: x.view === 'empty' || !x.view ? 'empty' : x.view }))}
        onKeyDown={(e) => e.key === 'Enter' && readLink(e.currentTarget.value)}
        onPaste={(e) => {
          const t = e.clipboardData?.getData('text')
          if (t && t.trim()) {
            e.preventDefault()
            readLink(t)
          }
        }}
        onClear={clearEditor}
        onPasteBtn={pasteFromClipboard}
      />

      <div className="main">
        {mode === 'empty' ? <EmptyState onExample={() => readLink(EXAMPLE_PLAYLIST)} /> : null}
        {mode === 'fetching' ? <Reading /> : null}
        {mode === 'error' && ed.err ? (
          <ErrorCard
            err={ed.err}
            onRetry={() => readLink(ed.url)}
            onProxy={() => openSettings(true)}
            onCopy={async () => {
              try {
                await navigator.clipboard.writeText(`${ed.err.raw}\nLink: ${ed.url}\nEvroHQ Downloader ${version}`)
                toastMsg('info', 'Error log copied')
              } catch {
                toastMsg('error', 'Couldn’t copy the error log.')
              }
            }}
          />
        ) : null}
        {singleView ? <SingleView v={singleView} /> : null}
        {listView ? <ListView v={listView} /> : null}
      </div>

      {pop || qOpen ? (
        <div
          className="scrim-pop"
          onClick={() => {
            setPop(null)
            setQOpen(false)
          }}
        />
      ) : null}

      <div className="dock">
        <div className="dock-left" style={{ opacity: dockDim ? 0.45 : 1 }}>
          <div className="dock-label">{dockLabel}</div>
          <Sentence segs={segs} />
          {moreView ? <MoreOptions m={moreView} /> : null}
        </div>
        <div className="dock-right">
          <div className="sizeline">
            <span>{sizeL}</span>
            <b>{sizeR}</b>
          </div>
          <div className="btnrow">
            {showChip ? (
              <button
                type="button"
                className={`qchip${qOpen ? ' open' : ''}`}
                onClick={() => {
                  setPop(null)
                  setQOpen((o) => !o)
                }}
                aria-expanded={qOpen}
              >
                <span className="q1">Queue · {qCount}</span>
                <span className="q2">{chipSub}</span>
              </button>
            ) : null}
            <PrimaryButton b={button} />
          </div>
          {qView ? <QueuePopover q={qView} /> : null}
        </div>
      </div>

      <Toast toast={toast} top={banner ? 90 : 50} onClose={() => setToast(null)} />

      {settingsOpen ? (
        <SettingsSheet
          s={{
            onClose: () => setSettingsOpen(false),
            bodyRef: sheetBodyRef,
            proxyRef,
            theme,
            onTheme: setTheme,
            windowSize,
            onWindow: selectWindow,
            proxy: { ...pxDraft, test: pxTest },
            onProxyToggle: proxyToggle,
            onProxyField: proxyField,
            onProxyHost: proxyHost,
            onProxyTest: proxyTest,
            engine: { ...engine, msgColor: engine.msgColor || 'var(--grn)' },
            onCheckEngine: checkEngine,
            version,
            onLink: openLink
          }}
        />
      ) : null}

      {whatsNew ? <WhatsNew block={whatsNew.block} prevVersion={whatsNew.prev} onClose={dismissWhatsNew} /> : null}
    </div>
  )
}
