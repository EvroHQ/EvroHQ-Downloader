// Settings sheet (design spec §5.9): appearance, window, network proxy,
// engine versions and about. Slides in from the right below the title bar.
import { THEMES, THEME_ORDER } from './lib/themes'
import { Toggle } from './ui'

const PX_TYPES = [
  ['socks5', 'SOCKS5'],
  ['socks4', 'SOCKS4'],
  ['http', 'HTTP']
]

export function SettingsSheet({ s }) {
  const px = s.proxy
  return (
    <>
      <div className="sheet-scrim" onClick={s.onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="sheet-head">
          <div className="t" id="settings-title">
            Settings
          </div>
          <button type="button" className="xbtn" onClick={s.onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <div className="sheet-body" ref={s.bodyRef}>
          <div className="ssec">
            <div className="slabel">APPEARANCE</div>
            <div className="themes">
              {THEME_ORDER.map((id) => {
                const sys = id === 'system'
                const t = THEMES[id]
                return (
                  <button key={id} type="button" className={`tile${s.theme === id ? ' on' : ''}`} onClick={() => s.onTheme(id)} aria-pressed={s.theme === id}>
                    <span className="sw" style={{ background: sys ? 'linear-gradient(135deg,#131313 50%,#F2F0EA 50%)' : t.v.bg }}>
                      <span style={{ background: sys ? '#F5A524' : t.v.accGrad || t.v.acc }} />
                    </span>
                    <span className="nm">{sys ? 'System' : t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="ssec">
            <div className="slabel">WINDOW</div>
            <div className="segs win" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {[
                ['default', 'Full', '1040 × 720'],
                ['compact', 'Compact', '880 × 600']
              ].map(([k, l, sub]) => (
                <button key={k} type="button" className={s.windowSize === k ? 'on' : ''} onClick={() => s.onWindow(k)} aria-pressed={s.windowSize === k}>
                  <span className="l">{l}</span>
                  <span className="s">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ssec" ref={s.proxyRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div className="slabel">NETWORK PROXY</div>
                <div className="ssub">Route every download through a proxy</div>
              </div>
              <Toggle lg on={px.on} onClick={s.onProxyToggle} label="Use a proxy" />
            </div>
            {px.on ? (
              <>
                <div className="segs px" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  {PX_TYPES.map(([k, l]) => (
                    <button key={k} type="button" className={px.type === k ? 'on' : ''} onClick={() => s.onProxyField({ type: k })} aria-pressed={px.type === k}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="pxgrid">
                  <label className="pxfield">
                    Address
                    <input value={px.host} onChange={(e) => s.onProxyHost(e.target.value)} spellCheck={false} placeholder="host or socks5://…" />
                  </label>
                  <label className="pxfield">
                    Port
                    <input
                      value={px.port}
                      onChange={(e) => s.onProxyField({ port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                {px.type !== 'socks4' ? (
                  <div className="pxgrid2">
                    <label className="pxfield">
                      Username · optional
                      <input value={px.username} onChange={(e) => s.onProxyField({ username: e.target.value })} spellCheck={false} autoComplete="off" />
                    </label>
                    <label className="pxfield">
                      Password · optional
                      <input type="password" value={px.password} onChange={(e) => s.onProxyField({ password: e.target.value })} autoComplete="off" />
                    </label>
                  </div>
                ) : null}
                <div className="hint">
                  Paste <span className="m">socks5://user:pass@host:port</span> into Address to fill every field.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-soft btn-md" style={{ padding: '0 12px' }} onClick={s.onProxyTest}>
                    Test connection
                  </button>
                  {px.test ? (
                    <span className="resline" style={{ color: px.test.color }}>
                      <span className="dot" />
                      {px.test.text}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="ssec" style={{ gap: 8 }}>
            <div className="slabel">ENGINE</div>
            <div className="engine">
              <div className="v">
                yt-dlp {s.engine.ytdlp || '…'}
                <br />
                ffmpeg {s.engine.ffmpeg || '…'}
              </div>
              <button type="button" className="btn btn-ghost btn-md" style={{ padding: '0 12px' }} onClick={s.onCheckEngine} disabled={s.engine.busy}>
                Check for updates
              </button>
            </div>
            {s.engine.msg ? (
              <div className="resline" style={{ color: s.engine.msgColor }}>
                {s.engine.msg}
              </div>
            ) : null}
          </div>

          <div className="ssec" style={{ gap: 8 }}>
            <div className="slabel">ABOUT</div>
            <div className="about">
              EvroHQ Downloader <span className="v">v{s.version}</span>
              <br />
              <span className="by">Made by</span>{' '}
              <a onClick={() => s.onLink('madeby')} role="link" tabIndex={0}>
                @EvroHQ
              </a>
              <span className="by">. Powered by yt-dlp &amp; ffmpeg.</span>
            </div>
            <div className="linkrow">
              <a className="ink" onClick={() => s.onLink('star')} role="link" tabIndex={0}>
                ★ Star on GitHub
              </a>
              <a className="out" onClick={() => s.onLink('coffee')} role="link" tabIndex={0}>
                Buy me a coffee
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
