// Color tokens for every theme (design spec §2). Switching theme only swaps
// these CSS custom properties on the document root.

const DK = { grn: '#5BC98A', red: '#F26D6D', yel: '#F2C94C', ov: 'rgba(0,0,0,.55)' }
const LT = { grn: '#2E8A56', red: '#C2362F', yel: '#8F6400', ov: 'rgba(23,22,15,.32)' }

export const THEMES = {
  'graphite-amber': {
    label: 'Graphite & Amber',
    light: false,
    v: { ...DK, bg: '#131313', bar: '#0E0E0E', surf: '#191919', surf2: '#222222', pop: '#242424', line: '#2A2A2A', line2: '#383838', ink: '#EDEAE4', ink2: '#A3A09A', ink3: '#908D86', acc: '#F5A524', accText: '#FFB547', accInk: '#1C1303', accSoft: 'rgba(245,165,36,.12)', accLine: 'rgba(245,165,36,.34)', thA: '#1B1B1B', thB: '#222222', skel: '#232323' }
  },
  'carbon-cyan': {
    label: 'Carbon & Cyan',
    light: false,
    v: { ...DK, bg: '#0F1214', bar: '#0B0E10', surf: '#151A1D', surf2: '#1C2327', pop: '#1F272B', line: '#242C31', line2: '#313B41', ink: '#E6EDF0', ink2: '#98A6AD', ink3: '#86949D', acc: '#22D3EE', accInk: '#04181C', accSoft: 'rgba(34,211,238,.11)', accLine: 'rgba(34,211,238,.32)', thA: '#151B1E', thB: '#1B2226', skel: '#1C2327' }
  },
  'obsidian-violet': {
    label: 'Obsidian & Violet',
    light: false,
    v: { ...DK, bg: '#111016', bar: '#0D0C11', surf: '#17161E', surf2: '#1F1D28', pop: '#22202C', line: '#282535', line2: '#353145', ink: '#ECEAF2', ink2: '#A29FB0', ink3: '#8F8BA4', acc: '#A78BFA', accText: '#C4B5FD', accInk: '#150D2B', accSoft: 'rgba(167,139,250,.13)', accLine: 'rgba(167,139,250,.36)', thA: '#18161F', thB: '#1E1C27', skel: '#1F1D28' }
  },
  'charcoal-red': {
    label: 'Charcoal & Red',
    light: false,
    v: { ...DK, bg: '#151413', bar: '#100F0E', surf: '#1C1A19', surf2: '#252220', pop: '#282423', line: '#2E2A28', line2: '#3A3533', ink: '#F0EBE8', ink2: '#A9A19D', ink3: '#968D89', acc: '#F2555A', accText: '#FFA3A6', accInk: '#1A0405', accSoft: 'rgba(242,85,90,.12)', accLine: 'rgba(242,85,90,.36)', thA: '#1C1A19', thB: '#232120', skel: '#252220' }
  },
  // The original theme. Its accent is a gradient (spec §2, "EvroHQ").
  evrohq: {
    label: 'EvroHQ',
    light: false,
    v: { ...DK, bg: '#09090B', bar: '#070709', surf: '#18181C', surf2: '#2C2C32', pop: '#1C1C20', line: 'rgba(255,255,255,.12)', line2: 'rgba(255,255,255,.22)', ink: '#D4D4D8', ink2: '#A1A1AA', ink3: '#8A8A93', acc: '#A02368', accGrad: 'linear-gradient(100deg, #5618A7 0%, #DB2736 100%)', accText: '#F287BC', accInk: '#FFFFFF', accSoft: 'rgba(86,24,167,.18)', accLine: 'rgba(160,35,104,.45)', thA: '#141418', thB: '#1A1A1F', skel: '#1C1C20', ov: 'rgba(0,0,0,.6)' }
  },
  'paper-rust': {
    label: 'Paper & Rust',
    light: true,
    v: { ...LT, bg: '#F2F0EA', bar: '#EAE7DF', surf: '#FBFAF7', surf2: '#ECE9E1', pop: '#FFFFFF', line: '#DDD9CF', line2: '#C9C4B8', ink: '#17160F', ink2: '#5D5B53', ink3: '#69665E', acc: '#B4471F', accInk: '#FFFFFF', accSoft: 'rgba(180,71,31,.08)', accLine: 'rgba(180,71,31,.32)', thA: '#E3DFD4', thB: '#ECE9E1', skel: '#E6E2D8' }
  },
  'bone-forest': {
    label: 'Bone & Forest',
    light: true,
    v: { ...LT, bg: '#EEEBE3', bar: '#E6E2D8', surf: '#F8F6F0', surf2: '#E4E0D5', pop: '#FFFFFF', line: '#D8D3C6', line2: '#C3BDAE', ink: '#1A1D17', ink2: '#595D52', ink3: '#63675C', acc: '#2F6B45', accInk: '#FFFFFF', accSoft: 'rgba(47,107,69,.09)', accLine: 'rgba(47,107,69,.32)', thA: '#E0DCD0', thB: '#E9E6DC', skel: '#E2DED3' }
  }
}

// Settings → Appearance order. EvroHQ sits with the dark themes.
export const THEME_ORDER = ['graphite-amber', 'carbon-cyan', 'obsidian-violet', 'charcoal-red', 'evrohq', 'paper-rust', 'bone-forest', 'system']

// "System" follows the OS: light → Paper & Rust, dark → Graphite & Amber.
export function resolveTheme(id) {
  if (id === 'system') {
    const light = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    return light ? 'paper-rust' : 'graphite-amber'
  }
  return THEMES[id] ? id : 'graphite-amber'
}

export function applyTheme(id) {
  const key = resolveTheme(id)
  const t = THEMES[key]
  const root = document.documentElement
  const v = { accGrad: t.v.acc, accText: t.v.acc, ...t.v }
  for (const name in v) root.style.setProperty(`--${name}`, v[name])
  root.style.colorScheme = t.light ? 'light' : 'dark'
  root.setAttribute('data-theme', key)
}
