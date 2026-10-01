import type { Enemy, Vec } from './types'

type Ctx = CanvasRenderingContext2D

/** 0 neutral · 1 concentrada · 2 furiosa · 3 glitch */
export type CalcMood = 0 | 1 | 2 | 3

export type BossState = 'idle' | 'talk' | 'attack' | 'dead'

export interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

interface ScreenFaceOpts {
  time: number
  mood: CalcMood
  state: BossState
  player: Vec
  pulse: number
}

const EYE_NEON = ['#7dff6b', '#b6ff3b', '#ffd23f', '#7dff6b'] as const
const MOUTH_NEON = '#ffd23f'
const LCD_BG = '#020c05'
const GRID_W = 48
const GRID_H = 14
const MOUTH_COLS = 20
const MOUTH_ROWS = 4

function mouthLit(col: number, row: number, o: ScreenFaceOpts): 0 | 1 | 2 {
  const { state, mood, time } = o
  if (state === 'dead') return row === 1 + ((col + 1) % 2) && col > 2 && col < 17 ? 1 : 0
  const d = Math.abs(col - (MOUTH_COLS - 1) / 2) / (MOUTH_COLS / 2)
  let open: number
  if (state === 'attack') open = 3
  else if (state === 'talk') open = Math.floor(Math.abs(Math.sin(time * 13)) * 3.99)
  else open = 0
  const h = Math.round(open * (1 - d * d))
  if (open === 0) {
    if (col < 3 || col > 16) return 0
    if (mood === 0) return row === 2 || (row === 1 && (col === 3 || col === 16)) ? 1 : 0
    if (mood === 1) return row === 2 ? 1 : 0
    return row === 1 || (row === 2 && (col === 3 || col === 16)) ? 1 : 0
  }
  if (col < 2 || col > 17) return 0
  const half = Math.ceil(h / 2)
  const top = h === 0 ? 2 : Math.max(0, 2 - half)
  const bottom = h === 0 ? 2 : Math.min(3, 1 + half)
  if (row === top || row === bottom) return 1
  if (state === 'attack' && row > top && row < bottom && (col + row + Math.floor(time * 10)) % 2 === 0) return 2
  return 0
}

/** Pixel-art boss face rendered directly on the main calculator's LCD panel. */
export function drawScreenFace(c: Ctx, r: ScreenRect, o: ScreenFaceOpts) {
  if (r.w < 20 || r.h < 12) return
  const { time, mood, state, player } = o
  const u = Math.max(1, Math.floor(Math.min(r.w / GRID_W, r.h / GRID_H)))
  const glitch = mood === 3 && Math.floor(time * 20) % 7 === 0 ? (Math.floor(time * 97) % 2 ? u : -u) : 0
  const left = Math.round(r.x + (r.w - GRID_W * u) / 2) + glitch
  const top = Math.round(r.y + (r.h - GRID_H * u) / 2)
  const P = (x: number, y: number, w: number, h: number) => c.fillRect(left + x * u, top + y * u, w * u, h * u)
  const eyeNeon = mood === 3 && Math.floor(time * 14) % 3 === 0 ? MOUTH_NEON : EYE_NEON[mood]

  c.save()
  c.imageSmoothingEnabled = false
  c.beginPath()
  c.rect(r.x, r.y, r.w, r.h)
  c.clip()

  c.fillStyle = LCD_BG
  c.fillRect(r.x, r.y, r.w, r.h)
  const halo = c.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6)
  halo.addColorStop(0, `${eyeNeon}${state === 'attack' ? '30' : '1c'}`)
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = halo
  c.fillRect(r.x, r.y, r.w, r.h)

  c.shadowColor = eyeNeon
  c.shadowBlur = 6 + o.pulse * 10 + (state === 'attack' ? 4 : 0)

  const faceCx = left + (GRID_W * u) / 2
  const lookX = Math.round(Math.max(-1, Math.min(1, (player.x - faceCx) / 120)))
  const lookY = player.y > top + GRID_H * u ? 1 : 0
  const blink = state !== 'attack' && mood < 2 && Math.sin(time * 1.7) > 0.97

  const eye = (ex: number, side: -1 | 1) => {
    c.fillStyle = eyeNeon
    if (state === 'dead') {
      for (let i = 0; i < 6; i++) { P(ex + 1 + i, 1 + i, 1, 1); P(ex + 6 - i, 1 + i, 1, 1) }
      return
    }
    if (blink) { P(ex, 4, 8, 1); return }
    if (mood === 3) {
      const jit = Math.floor(time * 24) % 4 === 0 ? side : 0
      for (let i = 0; i < 6; i++) { P(ex + 1 + i + jit, 1 + i, 1, 1); P(ex + 6 - i + jit, 1 + i, 1, 1) }
      c.fillStyle = MOUTH_NEON
      P(ex + 3 + jit, 3, 2, 2)
      return
    }
    for (let i = 0; i < 8; i++) {
      const cut = mood >= 2 ? (side < 0 ? Math.floor(i / 3) : Math.floor((7 - i) / 3)) : mood === 1 ? 1 : 0
      P(ex + i, 1 + cut, 1, 6 - cut)
    }
    c.fillStyle = LCD_BG
    P(ex + 3 + lookX, 3 + lookY, 2, 2)
    c.fillStyle = MOUTH_NEON
    if (state === 'attack') P(ex + 3 + lookX, 3 + lookY, 1, 1)
  }
  eye(10, -1)
  eye(30, 1)

  const mx = 14
  const my = 9
  for (let row = 0; row < MOUTH_ROWS; row++) {
    for (let col = 0; col < MOUTH_COLS; col++) {
      const lit = mouthLit(col, row, o)
      const dot = Math.max(1, u - (u >= 3 ? 1 : 0))
      if (!lit) {
        c.shadowBlur = 0
        c.fillStyle = 'rgba(125,255,107,0.1)'
      } else {
        c.shadowBlur = 6 + o.pulse * 8
        c.fillStyle = lit === 2 ? '#fff' : MOUTH_NEON
      }
      c.fillRect(left + (mx + col) * u, top + (my + row) * u, dot, dot)
    }
  }

  c.shadowBlur = 0
  c.fillStyle = 'rgba(0,0,0,0.32)'
  for (let y = r.y + 1; y < r.y + r.h; y += 3) c.fillRect(r.x, y, r.w, 1)

  if (mood === 3 && state !== 'dead') {
    for (let i = 0; i < 8; i++) {
      const seed = Math.floor(time * 18) * 31 + i * 17
      if (seed % 3) continue
      c.fillStyle = i % 2 ? MOUTH_NEON : EYE_NEON[0]
      P(seed % (GRID_W - 4), (seed >> 2) % GRID_H, 1 + (seed % 4), 1)
    }
  }
  c.restore()
}

/** Mini calculator sprite used for the operand modules during the phase-3 fusion. */
export function drawEnemy(c: Ctx, e: Enemy, font: string, time: number, _player: Vec, boss = false) {
  const u = boss ? 3 : 2
  const cols = 22
  const rows = 26
  const bob = Math.round(Math.sin(time * 3 + e.seed) * 2)
  const s = 1 + e.pulse * 0.2
  c.save()
  c.translate(Math.round(e.x), Math.round(e.y + bob))
  c.scale(s, s)
  c.imageSmoothingEnabled = false
  const l = -Math.round((cols * u) / 2)
  const t = -Math.round((rows * u) / 2)
  const P = (x: number, y: number, w: number, h: number) => c.fillRect(l + x * u, t + y * u, w * u, h * u)
  c.fillStyle = '#000'
  P(1, 0, cols - 2, rows); P(0, 1, cols, rows - 2)
  c.fillStyle = '#1b1430'
  P(1, 1, cols - 2, rows - 2)
  c.fillStyle = e.color
  P(1, 4, 1, rows - 8); P(cols - 2, 4, 1, rows - 8)
  c.fillStyle = '#05050b'
  P(3, 2, cols - 6, 9)
  c.fillStyle = '#0a1a24'
  P(4, 3, cols - 8, 7)
  c.font = `${boss ? 14 : 9}px ${font}`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = e.color
  c.fillText(e.label, 0, t + 6.5 * u + 1)
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 4; k++) {
      c.fillStyle = k === 3 ? '#ff9a3b' : '#c9c6dc'
      P(3 + k * 4, 13 + r * 4, 3, 2)
      c.fillStyle = '#5c5874'
      P(3 + k * 4, 15 + r * 4, 3, 1)
    }
  }
  if (Math.floor(time * 5 + e.seed) % 6 === 0) {
    c.fillStyle = e.color
    P(3 + (Math.floor(time * 5) % 4) * 4, 13, 3, 2)
  }
  c.restore()
}
