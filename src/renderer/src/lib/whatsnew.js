import { cmpVer } from './util'

/* What's new — one block per app version. Add a new `{ id, version, items }`
   whenever package.json is bumped. Each item: kicker (mono, accent), title,
   body. Shown until "Got it"; ids already in whatsNewAck are skipped, and only
   the newest unseen block is shown (older ones are acked with it). */
export const WHATS_NEW = [
  { id: '2.3.2-soundcloud', version: '2.3.0', items: [
    { kicker: 'SOUNDCLOUD', title: 'SoundCloud', body: 'Paste a SoundCloud track or playlist in the same field as YouTube.' },
    { kicker: 'NAME', title: 'New name', body: 'The app is now EvroHQ Downloader — same app, YouTube plus SoundCloud.' }
  ] },
  { id: '2.3.4', version: '2.3.4', items: [
    { kicker: 'WINDOW', title: 'Compact window', body: 'Switch between the default and the compact window.' },
    { kicker: 'RIGHT-CLICK', title: 'Right-click', body: 'Right-click the URL field for Cut, Copy, Paste and Select all.' }
  ] },
  { id: '2.3.5', version: '2.3.5', items: [
    { kicker: 'TRIM', title: 'Smarter trim', body: 'A trim range past the end of the video is caught before downloading.' }
  ] },
  { id: '2.4.0', version: '2.4.0', items: [
    { kicker: 'QUEUE', title: 'Download queue', body: 'Add more videos or playlists while a download is running.' }
  ] },
  { id: '2.4.1', version: '2.4.1', items: [
    { kicker: 'FIX', title: 'What’s new fix', body: 'This window now fits any screen, so it can always be closed.' }
  ] },
  { id: '2.5.0', version: '2.5.0', items: [
    { kicker: 'PROXY', title: 'Proxy', body: 'Route downloads through a SOCKS5, SOCKS4 or HTTP proxy.' }
  ] },
  { id: '2.5.1', version: '2.5.1', items: [
    { kicker: 'SPEED', title: 'Faster downloads', body: 'Videos sent in fragments now download about 4× faster.' }
  ] },
  // Design spec §5.8.
  { id: '2.6.0', version: '2.6.0', items: [
    { kicker: 'QUEUE', title: 'Line up downloads', body: 'While something is downloading, paste another link and press Add to queue. Each item keeps its own settings.' },
    { kicker: 'TRIM & CHAPTERS', title: 'Download only the part you need', body: 'Open More options to set a start and end time, or to split a video into one file per chapter.' },
    { kicker: 'THEMES', title: 'Seven themes, dark by default', body: 'Graphite & Amber is the new default. For a light look, choose Paper & Rust or Bone & Forest.' },
    { kicker: 'PROXY', title: 'Test your proxy before you download', body: 'Paste one socks5:// link to fill in every field, then press Test connection to check it.' }
  ] }
]

// The newest unseen block for this version, plus every pending id to ack.
export function pendingWhatsNew(ackIds, current) {
  if (!current) return null
  const seen = new Set(Array.isArray(ackIds) ? ackIds : [])
  const pending = WHATS_NEW.filter((n) => !seen.has(n.id) && cmpVer(current, n.version) >= 0)
  if (!pending.length) return null
  const latest = pending.reduce((a, b) => (cmpVer(b.version, a.version) > 0 ? b : a))
  return { ...latest, ids: pending.map((n) => n.id) }
}
