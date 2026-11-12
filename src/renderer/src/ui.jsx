// Presentational pieces of the 2.6 UI (design spec §5). No app state here:
// everything comes in through props from App.jsx.
import { useEffect, useRef } from 'react'
import appIconUrl from '../../../resources/evrohq-icon-1024.svg?url'

export function AppIcon({ size }) {
  return <img className="appicon" src={appIconUrl} width={size} height={size} alt="" draggable={false} />
}

export function Toggle({ on, onClick, lg, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle${lg ? ' lg' : ''}${on ? ' on' : ''}`} onClick={onClick}>
      <span />
    </button>
  )
}

// Image with the striped placeholder behind it (shown while loading or when
// there is no thumbnail).
export function Thumb({ src, className, style, children }) {
  return (
    <div className={`stripes ${className || ''}`} style={style}>
      {src ? <img src={src} alt="" draggable={false} loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
      {children}
    </div>
  )
}

/* ---------- Title bar (spec §1) -------------------------------------------- */
export function TitleBar({ version, proxyOn, onSettings, onMinimize, onClose }) {
  return (
    <div className="titlebar">
      <div className="tb-brand">
        <AppIcon size={20} />
        <span className="tb-name">EvroHQ Downloader</span>
        <span className="tb-ver">{version}</span>
      </div>
      {proxyOn ? (
        <div className="tb-proxy" title="Downloads go through your proxy">
          <span className="dot" />
          PROXY
        </div>
      ) : null}
      <button type="button" className="tb-settings" onClick={onSettings}>
        Settings
      </button>
      <div className="tb-win">
        <button type="button" onClick={onMinimize} aria-label="Minimize">
          –
        </button>
        <button type="button" disabled aria-label="Maximize" title="The window has a fixed size. Switch Full / Compact in Settings.">
          <div className="tb-max" />
        </button>
        <button type="button" className="tb-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  )
}

/* ---------- Update banner (spec §5.7) -------------------------------------- */
export function Banner({ banner }) {
  if (!banner) return null
  return (
    <div className="banner" role="status">
      <span className="bdot" />
      {banner.progress != null ? (
        <>
          <span style={{ fontWeight: 600 }}>{banner.title}</span>
          <div className="bar">
            <div style={{ width: `${banner.progress}%` }} />
          </div>
          <span className="pct">{banner.progress}%</span>
        </>
      ) : (
        <>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <b style={{ fontWeight: 700 }}>{banner.title}</b>
            {banner.sub ? <span className="sub">{banner.sub}</span> : null}
          </span>
          {banner.action ? (
            <button type="button" className="btn btn-acc btn-sm" onClick={banner.onAction} disabled={banner.busy}>
              {banner.action}
            </button>
          ) : null}
          {banner.later ? (
            <button type="button" className="btn btn-text btn-sm" onClick={banner.onDismiss}>
              Later
            </button>
          ) : banner.onDismiss ? (
            <button type="button" className="btn btn-text" style={{ width: 26, height: 26, fontSize: 16, padding: 0 }} onClick={banner.onDismiss} aria-label="Dismiss">
              ×
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ---------- URL bar (spec §5.1) --------------------------------------------- */
export function UrlBar({ url, chip, state, placeholder, inputRef, onChange, onKeyDown, onPaste, onClear, onPasteBtn }) {
  return (
    <div className="urlwrap">
      <div className={`urlbar ${state || ''}`}>
        <div className="chip">
          <span className="cdot" style={{ background: chip.dot }} />
          {chip.label}
        </div>
        <input
          ref={inputRef}
          className="urlinput"
          value={url}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          spellCheck={false}
          aria-label="Link"
        />
        <div className="urlbtns">
          {url ? (
            <button type="button" className="urlclear" onClick={onClear} title="Clear" aria-label="Clear">
              ×
            </button>
          ) : null}
          <button type="button" className="pastebtn" onClick={onPasteBtn}>
            Paste <span className="k">CTRL V</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Main states (spec §5.2) ----------------------------------------- */
export function EmptyState({ onExample }) {
  return (
    <div className="empty">
      <div className="empty-row">
        <AppIcon size={56} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="hero">
            Paste a link. <span className="acc">Get the file.</span>
          </div>
          <div className="lead">Videos, playlists, tracks and sets from YouTube and SoundCloud, saved straight to your folder.</div>
        </div>
      </div>
      <div className="hints">
        <div className="kbd-hint">
          <span className="kbd">Ctrl</span>
          <span className="kbd">V</span> works anywhere in this window
        </div>
        <button type="button" className="linkbtn" onClick={onExample}>
          Try an example playlist →
        </button>
      </div>
    </div>
  )
}

const SKEL_W = ['62%', '48%', '71%', '55%', '66%', '44%']
export function Reading() {
  return (
    <div className="reading" aria-busy="true">
      <div className="reading-head">
        <div className="skel" style={{ width: 48, height: 48, borderRadius: 6 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <div style={{ fontSize: 'var(--headFs)', fontWeight: 700, letterSpacing: '-0.03em' }}>Reading link…</div>
          <div className="kicker" style={{ letterSpacing: '0.08em' }}>
            CHECKING WHAT&apos;S AT THIS ADDRESS
          </div>
        </div>
      </div>
      <div className="reading-line">
        <div />
      </div>
      {SKEL_W.map((w, i) => (
        <div key={i} className="grid-row">
          <div className="skel" style={{ width: 16, height: 16, borderRadius: 4 }} />
          <div className="skel" style={{ width: 16, height: 9, borderRadius: 2 }} />
          <div className="skel" style={{ width: 'var(--th)', height: 'var(--th)', borderRadius: 4 }} />
          <div className="skel" style={{ height: 11, width: w, borderRadius: 3 }} />
          <div className="skel" style={{ height: 9, width: 40, borderRadius: 2, justifySelf: 'end' }} />
          <div className="skel" style={{ height: 9, width: 30, borderRadius: 2, justifySelf: 'end' }} />
        </div>
      ))}
    </div>
  )
}

export function ErrorCard({ err, onRetry, onProxy, onCopy }) {
  return (
    <div className="errwrap">
      <div className="errcard" role="alert">
        <div className="errk">
          <span className="edot" />
          COULDN&apos;T READ THIS LINK
        </div>
        <div className="errtitle">{err.title}</div>
        <div className="errbody">{err.body}</div>
        <div className="errraw">{err.raw}</div>
        <div className="errbtns">
          <button type="button" className="btn btn-acc btn-lg" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost btn-lg" style={{ padding: '0 14px' }} onClick={onProxy}>
            Set up a proxy
          </button>
          <button type="button" className="btn btn-text btn-lg" style={{ padding: '0 10px' }} onClick={onCopy}>
            Copy error log
          </button>
        </div>
      </div>
    </div>
  )
}

// Header actions shared by the single-video and list layouts.
export function HeadActions({ a }) {
  return (
    <>
      {a.switch ? (
        <div className="seg2" role="tablist">
          <button type="button" className={a.switch.list ? 'on' : ''} onClick={a.switch.toList} disabled={!!a.switch.loading}>
            {a.switch.loading === 'list' ? 'Loading…' : 'Whole playlist'}
          </button>
          <button type="button" className={!a.switch.list ? 'on' : ''} onClick={a.switch.toVideo} disabled={!!a.switch.loading}>
            {a.switch.loading === 'video' ? 'Loading…' : 'This video only'}
          </button>
        </div>
      ) : null}
      {a.paused ? (
        <>
          <button type="button" className="btn btn-acc btn-md" onClick={a.onResume}>
            Resume now
          </button>
          <button type="button" className="btn btn-ghost btn-md" onClick={a.onProxy}>
            Set up a proxy
          </button>
        </>
      ) : null}
      {a.next ? (
        <button type="button" className="btn btn-ghost btn-md" onClick={a.onStartNow}>
          Start now
        </button>
      ) : null}
      {a.done ? (
        <>
          <button type="button" className="btn btn-ink btn-md" onClick={a.onOpenFolder}>
            Open folder
          </button>
          <button type="button" className="btn btn-ghost btn-md" onClick={a.onNew}>
            New download
          </button>
        </>
      ) : null}
    </>
  )
}

export function PausedPill({ text }) {
  return (
    <div className="pill-paused">
      <span className="dot" />
      {text}
    </div>
  )
}

export function SingleView({ v }) {
  return (
    <div className="single">
      <Thumb src={v.thumbnail} className="sthumb">
        {v.dur ? <span className="dur">{v.dur}</span> : null}
      </Thumb>
      <div className="sinfo">
        <div className="kicker">{v.kicker}</div>
        <div className="stitle">{v.title}</div>
        {v.by ? <div className="sby">{v.by}</div> : null}
        {v.head ? (
          <div className="shead">
            {v.head}
            <span style={{ color: v.accColor }}>{v.acc}</span>
          </div>
        ) : null}
        {v.meta ? <div className="meta">{v.meta}</div> : null}
        {v.bar != null ? (
          <div className="sbar">
            <div style={{ width: `${v.bar}%`, background: v.barColor }} />
          </div>
        ) : null}
        {v.pill ? <PausedPill text={v.pill} /> : null}
        <div className="actions">
          <HeadActions a={v.actions} />
        </div>
      </div>
    </div>
  )
}

function RowIcon({ r }) {
  if (r.st === 'on') return <div className="chk on">✓</div>
  if (r.st === 'off') return <div className="chk off" />
  if (r.st === 'done') return <div className="st-done">✓</div>
  if (r.st === 'active')
    return (
      <div className="st-active">
        <div />
      </div>
    )
  if (r.st === 'paused')
    return (
      <div className="st-paused">
        <span />
        <span />
      </div>
    )
  return <div className="st-wait" />
}

function RowStatus({ r }) {
  if (r.st === 'on' || r.st === 'off') return <span style={{ color: 'var(--ink2)' }}>{r.size}</span>
  if (r.st === 'drm') return <span style={{ color: 'var(--ink3)' }}>DRM</span>
  if (r.st === 'wait') return <span style={{ color: 'var(--ink3)' }}>waiting</span>
  if (r.st === 'done') return <span style={{ color: 'var(--grn)', fontWeight: 600 }}>saved</span>
  const c = r.st === 'paused' ? 'var(--yel)' : 'var(--acc)'
  return (
    <>
      <div className="minibar">
        <div style={{ width: `${r.pct}%`, background: c }} />
      </div>
      <span style={{ color: c, fontWeight: 600, minWidth: 30, textAlign: 'right' }}>{r.pct}%</span>
    </>
  )
}

export function ListView({ v }) {
  return (
    <div className="list">
      <div className="list-head">
        {v.thumb !== undefined ? <Thumb src={v.thumb} className="lthumb" /> : null}
        <div className="lt">
          <div className="kicker">{v.kicker}</div>
          <div className="headline">
            {v.head}
            <span style={{ color: v.accColor }}>{v.acc}</span>
          </div>
          <div className="meta">{v.meta}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <HeadActions a={v.actions} />
        </div>
      </div>
      {v.pill ? (
        <div style={{ marginBottom: 12, display: 'flex' }}>
          <PausedPill text={v.pill} />
        </div>
      ) : null}
      <div className="thead">
        <div>
          {v.selectAll ? (
            <button
              type="button"
              className={`chk ${v.selectAll.state}`}
              onClick={v.selectAll.onClick}
              title="Select all / none"
              aria-label="Select all / none"
            >
              {v.selectAll.state === 'on' ? '✓' : v.selectAll.state === 'part' ? '–' : ''}
            </button>
          ) : null}
        </div>
        <span>#</span>
        <span />
        <span>{v.caption}</span>
        <span style={{ textAlign: 'right' }}>{v.statusCaption}</span>
        <span style={{ textAlign: 'right' }}>TIME</span>
      </div>
      <div className="rows">
        {v.rows.map((r) => (
          <div
            key={r.key}
            className={`grid-row row${r.onClick ? ' clickable' : ''}`}
            style={{ opacity: r.dim ? 0.45 : 1 }}
            onClick={r.onClick}
            role={r.onClick ? 'checkbox' : undefined}
            aria-checked={r.onClick ? r.st === 'on' : undefined}
          >
            <div>
              <RowIcon r={r} />
            </div>
            <span className="rnum">{r.n}</span>
            <Thumb src={r.thumb} className="rthumb" />
            <div className="rtitle" title={r.full}>
              <b>{r.a}</b>
              {r.t ? <span> — {r.t}</span> : null}
            </div>
            <div className="rstatus">
              <RowStatus r={r} />
            </div>
            <span className="rtime">{r.dur}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Output sentence (spec §5.3) ------------------------------------- */
export function Sentence({ segs }) {
  // Glue "," / "." to the token before it, so a line never starts with one.
  const glued = []
  for (const s of segs) {
    const prev = glued[glued.length - 1]
    if (s.text != null && prev && prev.label != null && /^[,.]/.test(s.text)) {
      glued[glued.length - 1] = { ...prev, after: s.text[0] }
      const rest = s.text.slice(1)
      if (rest) glued.push({ text: rest })
    } else glued.push(s)
  }
  return (
    <div className="sentence">
      {glued.map((s, i) => {
        if (s.text != null) return <span key={i}>{s.text}</span>
        if (s.bold != null && s.ghost)
          // Both texts share one grid cell: the width is the widest, the
          // invisible "ghost" keeps it constant.
          return (
            <b key={i} className="fixw">
              <span>
                {/* The count in the theme color, the word in the text color. */}
                <span className="num">{String(s.bold).match(/^\d+/)?.[0]}</span>
                {String(s.bold).replace(/^\d+/, '')}
              </span>
              <span className="ghost" aria-hidden="true">
                {s.ghost}
              </span>
            </b>
          )
        if (s.bold != null) return <b key={i}>{s.bold}</b>
        return <Token key={i} s={s} />
      })}
    </div>
  )
}

function Token({ s }) {
  return (
    <span className="tokwrap">
      <button
        type="button"
        className={`tok${s.open ? ' open' : ''}${s.locked ? ' locked' : ''}`}
        onClick={s.onClick}
        aria-haspopup={s.menu ? 'listbox' : undefined}
        aria-expanded={s.menu ? !!s.open : undefined}
        tabIndex={s.locked ? -1 : 0}
      >
        {s.label}
        {!s.locked ? <span className="chev">▼</span> : null}
      </button>
      {s.after}
      {s.open && s.menu ? (
        <div className="menu" role="listbox" style={s.right ? { right: -4 } : { left: -4 }}>
          <div className="menu-title">{s.menu.title}</div>
          {s.menu.opts.map((o, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={o.on}
              aria-disabled={o.why ? 'true' : 'false'}
              className={`opt${o.on ? ' sel' : ''}`}
              onClick={o.why ? undefined : o.pick}
            >
              <span className="odot" style={{ background: o.on ? 'var(--acc)' : 'transparent' }} />
              <span className="otext">
                <span className="olabel">{o.label}</span>
                <span className="odesc">{o.why || o.desc}</span>
              </span>
              <span className="ocheck" aria-hidden="true">
                {o.on ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}

/* ---------- More options (spec §5.4) ---------------------------------------- */
export function MoreOptions({ m }) {
  return (
    <div className="more">
      <button type="button" className="morebtn" onClick={m.toggle} aria-expanded={m.open}>
        <span className="mchev" style={{ transform: `rotate(${m.open ? 90 : 0}deg)` }}>
          ▶
        </span>
        More options
        {m.summary ? <span className="msum">{m.summary}</span> : null}
      </button>
      {m.open && m.note ? <div className="more-note">{m.note}</div> : null}
      {m.open && m.trim ? (
        <div className="cards" style={{ gridTemplateColumns: m.split ? 'minmax(0,1.3fr) minmax(0,1fr)' : 'minmax(0,1fr)' }}>
          <div className={`card${m.trim.err ? ' bad' : m.trim.on ? ' on' : ''}`}>
            <div className="card-head">
              <Toggle on={m.trim.on} onClick={m.trim.toggle} label="Trim a range" />
              <span className="card-title">Trim a range</span>
              {m.trim.note ? <span className="card-note">{m.trim.note}</span> : null}
            </div>
            <div className="trimrow" style={{ opacity: m.trim.on ? 1 : 0.45 }}>
              <label>
                Start
                <input className="field" style={{ width: 84 }} value={m.trim.start} onChange={m.trim.onStart} inputMode="numeric" aria-label="Trim start" />
              </label>
              <label>
                End
                <input
                  className={`field${m.trim.err ? ' bad' : ''}`}
                  style={{ width: 84 }}
                  value={m.trim.end}
                  onChange={m.trim.onEnd}
                  inputMode="numeric"
                  aria-label="Trim end"
                />
              </label>
            </div>
            <div className={`card-info${m.trim.err ? ' bad' : ''}`}>{m.trim.info}</div>
          </div>
          {m.split ? (
            <div className={`card${m.split.on ? ' on' : ''}`}>
              <div className="card-head">
                <Toggle on={m.split.on} onClick={m.split.toggle} label="Split by chapters" />
                <span className="card-title">Split by chapters</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{m.split.text}</div>
              <div className="card-info" style={{ color: 'var(--ink3)' }}>
                {m.split.note}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ---------- Right column (spec §5.5) ----------------------------------------- */
export function PrimaryButton({ b }) {
  if (b.kind === 'dis') return <div className="pbtn-dis">{b.label}</div>
  if (b.kind === 'ready')
    return (
      <button type="button" className="pbtn" onClick={b.onClick}>
        <span className="lbl">{b.label}</span>
        <span className="gl">{b.glyph}</span>
      </button>
    )
  return (
    <div className="pbtn-prog" role="progressbar" aria-valuenow={Math.round(b.pct || 0)} aria-valuemin={0} aria-valuemax={100}>
      <div className="fill" style={{ width: `${b.pct || 0}%`, background: `color-mix(in srgb, ${b.fill} 24%, transparent)` }} />
      <div className="line" style={{ width: `${b.pct || 0}%`, background: b.fill }} />
      <div className="inner">
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="t1">{b.t1}</span>
          <span className="t2">{b.t2}</span>
        </span>
        <button type="button" className="act" onClick={b.onAct} disabled={b.actDisabled}>
          {b.act}
        </button>
      </div>
    </div>
  )
}

export function QueuePopover({ q }) {
  return (
    <div className="qpop" role="dialog" aria-label="Queue">
      <div className="qpop-head">
        <span className="t">{q.label}</span>
        <span className="k">EACH ITEM KEEPS ITS SETTINGS</span>
      </div>
      {q.cur ? (
        <div className="qcur">
          <div className="top">
            <span className="n">1 · {q.cur.title}</span>
            <span className="p" style={{ color: q.cur.color }}>
              {q.cur.pct}%
            </span>
          </div>
          <div className="qbar">
            <div style={{ width: `${q.cur.pct}%`, background: q.cur.color }} />
          </div>
          <div className="qmeta">{q.cur.meta}</div>
        </div>
      ) : null}
      {q.note ? <div className="qnote">{q.note}</div> : null}
      <div className="qlist">
        {q.items.map((it) => (
          <div key={it.id} className="qitem">
            <span className="n">{it.n}</span>
            <span className="tt">
              <b>{it.title}</b>
              <span className="qmeta">{it.meta}</span>
            </span>
            <button type="button" className="qx" title="Remove from queue" aria-label="Remove from queue" onClick={it.remove}>
              ×
            </button>
          </div>
        ))}
      </div>
      {!q.items.length ? <div className="qempty">Nothing waiting. Paste a link while this runs to add it.</div> : null}
      <div className="qfoot">
        <button type="button" className="qclear" onClick={q.clear}>
          Clear queue
        </button>
      </div>
    </div>
  )
}

/* ---------- Toast (spec §5.6) ------------------------------------------------- */
const TOAST_COLOR = { success: 'var(--grn)', info: 'var(--acc)', warning: 'var(--yel)', error: 'var(--red)' }
const TOAST_GLYPH = { success: '✓', info: 'i', warning: '!', error: '×' }
export function Toast({ toast, top, onClose }) {
  if (!toast) return null
  const c = TOAST_COLOR[toast.kind] || TOAST_COLOR.info
  return (
    <div
      className="toast"
      style={{
        top,
        background: `color-mix(in srgb, ${c} 16%, var(--pop))`,
        border: `1px solid color-mix(in srgb, ${c} 55%, transparent)`
      }}
      role={toast.kind === 'error' || toast.kind === 'warning' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' || toast.kind === 'warning' ? 'assertive' : 'polite'}
    >
      <span className="ti" style={{ background: c }}>
        {TOAST_GLYPH[toast.kind]}
      </span>
      <span className="tt">{toast.text}</span>
      <button type="button" className="tx" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

/* ---------- What's new (spec §5.8) ---------------------------------------------- */
export function WhatsNew({ block, prevVersion, onClose }) {
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  const v = String(block.version).replace(/\.0$/, '')
  return (
    <div className="wn-scrim">
      <div className="wn" role="dialog" aria-modal="true" aria-labelledby="wn-title" ref={ref} tabIndex={-1} style={{ outline: 'none' }}>
        <div className="wn-head">
          <AppIcon size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div className="t" id="wn-title">
              What&apos;s new in {v}
            </div>
            {prevVersion ? <div className="k">UPDATED FROM {prevVersion}</div> : null}
          </div>
        </div>
        <div className="wn-list">
          {block.items.map((it, i) => (
            <div key={i} className="wn-card">
              <span className="k">{it.kicker || String(it.title).toUpperCase()}</span>
              <span className="t">{it.title}</span>
              <span className="b">{it.body}</span>
            </div>
          ))}
        </div>
        <div className="wn-foot">
          <button type="button" className="btn btn-acc" style={{ height: 38, padding: '0 22px', fontSize: 14, fontWeight: 750, borderRadius: 8 }} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
