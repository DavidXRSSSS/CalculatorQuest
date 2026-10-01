'use client'

import { useEffect, useRef, useState } from 'react'
import { sfx } from '@/lib/game/audio'
import { MAX_HP } from '@/lib/game/engine'
import { FibonacciAudio } from '@/lib/game/fibonacci-audio'
import { cn } from '@/lib/utils'
import { BOTTOM_ROWS, TOP_ROWS, type KeyKind } from './calculator'

type Mode = 'warp' | 'fight' | 'dead' | 'implode'

type Bullet = {
  kind: 'num' | 'block'
  ox: number
  oy: number
  r: number
  vr: number
  th: number
  w: number
  x: number
  y: number
  rot: number
  spin: number
  ch: string
}

type Spawn = Omit<Bullet, 'x' | 'y'> & { at: number }

type FloatKey = {
  label: string
  kind: KeyKind
  from: { x: number; y: number; w: number; h: number }
  slot: number
}

type Square = { x: number; y: number; s: number; cx: number; cy: number; a0: number }

const PHI = (1 + Math.sqrt(5)) / 2
const WAVES = [1, 1, 2, 3, 5, 8, 13, 21]
const FIB_GLYPHS = ['1', '1', '2', '3', '5', '8', '13', '21']
const HEART_SPEED = 150
const HIT_RADIUS = 4.5 * 0.7
const DAMAGE = 20
const IFRAMES = 1.2
const WARP_DURATION = 2.6
const WAVE_CHARGE = 1.0
const GOLD = '#ffd23f'
const YELLOW = '#ffff00'
const HEART = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']
const TITLE = 'SECTOR ÁUREO · φ = 1.618'
const SLOT_MIN = 1.3
const SLOT_RANGE = 6.5

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Builds the classic golden rectangle out of Fibonacci squares, each carrying the quarter arc of the spiral.
function buildSpiral(count: number) {
  const squares: Square[] = [{ x: 0, y: 0, s: 1, cx: 1, cy: 0, a0: Math.PI }]
  let x = 0
  let y = 0
  let w = 1
  let h = 1
  for (let i = 1; i < count; i++) {
    const dir = (i - 1) % 4
    let s: number
    let qx: number
    let qy: number
    if (dir === 0) {
      s = h
      qx = x + w
      qy = y
      w += s
    } else if (dir === 1) {
      s = w
      qx = x
      qy = y - s
      y -= s
      h += s
    } else if (dir === 2) {
      s = h
      qx = x - s
      qy = y
      x -= s
      w += s
    } else {
      s = w
      qx = x
      qy = y + h
      h += s
    }
    const corners = [
      [qx, qy],
      [qx, qy + s],
      [qx + s, qy + s],
      [qx + s, qy],
    ]
    squares.push({ x: qx, y: qy, s, cx: corners[dir][0], cy: corners[dir][1], a0: Math.PI / 2 - (dir * Math.PI) / 2 })
  }
  return { squares, bx: x, by: y, bw: w, bh: h }
}

const SPIRAL = buildSpiral(8)

function spiralPoint(p: number) {
  const k = clamp(Math.floor(p), 0, SPIRAL.squares.length - 1)
  const sq = SPIRAL.squares[k]
  const a = sq.a0 - (p - k) * (Math.PI / 2)
  return { x: sq.cx + Math.cos(a) * sq.s, y: sq.cy + Math.sin(a) * sq.s, size: sq.s }
}

function layout(W: number, H: number) {
  const boxW = Math.min(440, W * 0.88)
  const boxH = Math.min(220, Math.max(150, H * 0.28))
  const boxX = (W - boxW) / 2
  const boxY = H - boxH - 84
  const panelTop = 44
  const panelH = Math.max(80, boxY - 48 - panelTop)
  const panelW = W * 0.94
  const scale = Math.min(panelW / SPIRAL.bw, panelH / SPIRAL.bh)
  const spW = SPIRAL.bw * scale
  const spH = SPIRAL.bh * scale
  const spX = (W - spW) / 2
  const spY = panelTop + (panelH - spH) / 2
  return { boxW, boxH, boxX, boxY, scale, spX, spY }
}

function drawHeart(c: CanvasRenderingContext2D, cx: number, cy: number, p: number, color: string) {
  const ox = Math.round(cx - 4.5 * p)
  const oy = Math.round(cy - 4 * p)
  c.fillStyle = color
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') c.fillRect(ox + x * p, oy + y * p, p, p)
  })
}

function readCalculatorKeys(): FloatKey[] {
  const defs = [...TOP_ROWS.flat(), ...BOTTOM_ROWS.flat()]
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.game-build-shell .key'))
  const W = window.innerWidth
  const H = window.innerHeight
  return defs.map((def, i) => {
    const rect = nodes[i]?.getBoundingClientRect()
    const from = rect && rect.width > 0
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height }
      : { x: W / 2 + ((i % 5) - 2) * 60, y: H / 2 + (Math.floor(i / 5) - 3) * 40, w: 56, h: 34 }
    return { label: def.label, kind: def.kind ?? 'num', from, slot: SLOT_MIN + (i / defs.length) * SLOT_RANGE }
  })
}

function buildWave(index: number, boxW: number, boxH: number): Spawn[] {
  const count = WAVES[index]
  const inward = index % 2 === 1
  const arms = count <= 3 ? count : count <= 13 ? 4 : 3
  const stagger = count <= 3 ? 0.55 : count <= 8 ? 0.34 : 0.26
  const sign = index % 4 < 2 ? 1 : -1
  const spread = index >= 4 ? 1 : 0
  const ox = boxW / 2 + (Math.random() - 0.5) * boxW * 0.3 * spread
  const oy = boxH / 2 + (Math.random() - 0.5) * boxH * 0.25 * spread
  const maxR = Math.hypot(boxW, boxH) / 2 + 30
  const base = Math.random() * Math.PI * 2
  return Array.from({ length: count }, (_, j) => {
    const arm = j % arms
    const block = j % 3 === 2
    return {
      at: WAVE_CHARGE + Math.floor(j / arms) * stagger,
      kind: block ? 'block' : 'num',
      ox,
      oy,
      r: inward ? maxR : 6,
      vr: inward ? -(62 + index * 6) : 50 + index * 6,
      th: base + (arm / arms) * Math.PI * 2,
      w: sign * (1.05 + index * 0.07),
      rot: Math.random() * Math.PI,
      spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2),
      ch: FIB_GLYPHS[j % FIB_GLYPHS.length],
    }
  })
}

export function FibonacciFight({ muted, onFinish }: { muted: boolean; onFinish: (won: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mutedRef = useRef(muted)
  const onFinishRef = useRef(onFinish)
  const controlsRef = useRef<{ retry: () => void; exit: () => void } | null>(null)
  const [dead, setDead] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [status, setStatus] = useState('La calculadora se desarma en una espiral dorada.')

  onFinishRef.current = onFinish

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    const buffer = document.createElement('canvas')
    const b = buffer.getContext('2d')
    if (!canvas || !c || !b) return

    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-press').trim() || 'monospace'
    const audio = new FibonacciAudio(() => mutedRef.current)
    const keys = readCalculatorKeys()

    let W = window.innerWidth
    let H = window.innerHeight
    let dpr = 1
    let L = layout(W, H)

    const G = {
      mode: 'warp' as Mode,
      t: 0,
      time: 0,
      hp: MAX_HP,
      heart: { x: L.boxW / 2, y: L.boxH * 0.8 },
      bullets: [] as Bullet[],
      queue: [] as Spawn[],
      wave: 0,
      waveT: 0,
      origin: { x: L.boxW / 2, y: L.boxH / 2 },
      invuln: 0,
      shake: 0,
      pulse: 0,
      flash: 0,
      burst: false,
      finished: false,
      keys: new Set<string>(),
      drag: null as { px: number; py: number; hx: number; hy: number } | null,
    }

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      for (const cv of [canvas, buffer]) {
        cv.width = Math.floor(W * dpr)
        cv.height = Math.floor(H * dpr)
      }
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      b.setTransform(dpr, 0, 0, dpr, 0, 0)
      b.imageSmoothingEnabled = false
      c.imageSmoothingEnabled = false
      L = layout(W, H)
      G.heart.x = clamp(G.heart.x, 9, L.boxW - 9)
      G.heart.y = clamp(G.heart.y, 8, L.boxH - 8)
    }
    resize()

    const toScreen = (ux: number, uy: number) => ({
      x: L.spX + (ux - SPIRAL.bx) * L.scale,
      y: L.spY + (uy - SPIRAL.by) * L.scale,
    })
    const core = () => toScreen(0, 0)

    const setMode = (mode: Mode) => {
      G.mode = mode
      G.t = 0
    }

    const startWave = (index: number) => {
      G.wave = index
      G.waveT = 0
      G.queue = buildWave(index, L.boxW, L.boxH)
      G.origin = { x: G.queue[0].ox, y: G.queue[0].oy }
      audio.setWave(index)
      sfx.play('warn')
      setStatus(`Oleada ${index + 1} de ${WAVES.length}: ${WAVES[index]} ${WAVES[index] === 1 ? 'proyectil' : 'proyectiles'} en espiral.`)
    }

    const startFight = () => {
      G.hp = MAX_HP
      G.bullets = []
      G.invuln = 0
      G.heart = { x: L.boxW / 2, y: L.boxH * 0.82 }
      setMode('fight')
      startWave(0)
    }

    const die = () => {
      G.hp = 0
      G.shake = 8
      G.flash = 0.6
      audio.stop()
      sfx.play('gameover')
      setMode('dead')
      setStatus('Tu alma ha sido absorbida por la espiral.')
      setDead(true)
    }

    const implode = () => {
      G.bullets = []
      G.queue = []
      audio.stop()
      audio.implode()
      sfx.play('victory')
      setMode('implode')
      setStatus('La espiral implosiona en luz dorada. Sector áureo completado.')
    }

    controlsRef.current = {
      retry: () => {
        setDead(false)
        sfx.play('equals')
        audio.start()
        startFight()
      },
      exit: () => {
        audio.close()
        onFinishRef.current(false)
      },
    }

    audio.warp()
    sfx.play('crack')

    const moveHeart = (dt: number) => {
      if (G.drag) return
      let dx = 0
      let dy = 0
      if (G.keys.has('ArrowLeft') || G.keys.has('a')) dx -= 1
      if (G.keys.has('ArrowRight') || G.keys.has('d')) dx += 1
      if (G.keys.has('ArrowUp') || G.keys.has('w')) dy -= 1
      if (G.keys.has('ArrowDown') || G.keys.has('s')) dy += 1
      const len = Math.hypot(dx, dy) || 1
      G.heart.x = clamp(G.heart.x + (dx / len) * HEART_SPEED * dt, 9, L.boxW - 9)
      G.heart.y = clamp(G.heart.y + (dy / len) * HEART_SPEED * dt, 8, L.boxH - 8)
    }

    const bulletHits = (bl: Bullet) => {
      const dx = G.heart.x - bl.x
      const dy = G.heart.y - bl.y
      if (bl.kind === 'num') return Math.hypot(dx, dy) < (bl.ch.length > 1 ? 8 : 6) + HIT_RADIUS
      const cos = Math.cos(-bl.rot)
      const sin = Math.sin(-bl.rot)
      const lx = dx * cos - dy * sin
      const ly = dx * sin + dy * cos
      const hw = 8 * PHI
      const hh = 8
      return Math.hypot(lx - clamp(lx, -hw / 2, hw / 2), ly - clamp(ly, -hh / 2, hh / 2)) < HIT_RADIUS
    }

    const updateFight = (dt: number) => {
      moveHeart(dt)
      G.waveT += dt
      while (G.queue.length && G.queue[0].at <= G.waveT) {
        const { at: _at, ...spawn } = G.queue.shift() as Spawn
        G.bullets.push({ ...spawn, x: spawn.ox + Math.cos(spawn.th) * spawn.r, y: spawn.oy + Math.sin(spawn.th) * spawn.r })
        G.pulse = 1
        sfx.play('shoot')
      }
      const maxR = Math.hypot(L.boxW, L.boxH) / 2 + 40
      let hit = false
      G.bullets = G.bullets.filter((bl) => {
        bl.r += bl.vr * dt
        // Angular speed grows as the orbit tightens, so inward shots coil like a true spiral instead of a straight line.
        bl.th += bl.w * dt * (1 + 40 / (bl.r + 40))
        bl.rot += bl.spin * dt
        bl.x = bl.ox + Math.cos(bl.th) * bl.r
        bl.y = bl.oy + Math.sin(bl.th) * bl.r
        if (bulletHits(bl)) hit = true
        return bl.vr > 0 ? bl.r < maxR : bl.r > 4
      })
      if (hit && G.invuln <= 0) {
        G.hp = Math.max(0, G.hp - DAMAGE)
        G.invuln = IFRAMES
        G.shake = 6
        audio.hit()
        sfx.play('hit')
        if (G.hp <= 0) {
          die()
          return
        }
      }
      if (!G.queue.length && !G.bullets.length && G.waveT > WAVE_CHARGE) {
        if (G.wave + 1 >= WAVES.length) implode()
        else {
          startWave(G.wave + 1)
          G.waveT = -0.6
        }
      }
    }

    const update = (dt: number) => {
      G.t += dt
      if (G.mode !== 'dead') G.time += dt
      G.shake = Math.max(0, G.shake - dt * 20)
      G.flash = Math.max(0, G.flash - dt * 1.6)
      G.pulse = Math.max(0, G.pulse - dt * 2.5)
      G.invuln = Math.max(0, G.invuln - dt)

      if (G.mode === 'warp') {
        if (G.t >= WARP_DURATION) {
          audio.start()
          startFight()
        }
      } else if (G.mode === 'fight') updateFight(dt)
      else if (G.mode === 'implode') {
        if (G.t >= 1.3 && !G.burst) {
          G.burst = true
          G.flash = 1
          G.shake = 12
        }
        if (G.t >= 2.8 && !G.finished) {
          G.finished = true
          setLeaving(true)
          window.setTimeout(() => {
            audio.close()
            onFinishRef.current(true)
          }, 700)
        }
      }
    }

    const slotParam = (key: FloatKey) => {
      if (G.mode === 'implode') return Math.max(0, (key.slot - SLOT_MIN) * (1 - G.t / 1.3))
      return SLOT_MIN + ((key.slot - SLOT_MIN + G.time * 0.09) % SLOT_RANGE)
    }

    const warpAmount = () => {
      if (G.mode === 'warp') {
        const t = G.t
        return t < 0.6 ? t / 0.6 : Math.max(0, 1 - (t - 0.6) / 1.8)
      }
      if (G.mode === 'implode') return G.t < 1.3 ? (G.t / 1.3) * 0.7 : 0
      return 0.04 + G.pulse * 0.12
    }

    const drawBackground = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      const cp = core()
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.06)'
      ctx.lineWidth = 1
      for (let i = 1; i < 9; i++) {
        const r = ((i * 70 + G.time * 30) % 630) + 10
        ctx.beginPath()
        ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    const drawSpiral = (ctx: CanvasRenderingContext2D, reveal: number, alpha: number) => {
      if (alpha <= 0) return
      const count = SPIRAL.squares.length
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.lineWidth = 2
      SPIRAL.squares.forEach((sq, i) => {
        const local = clamp(reveal * count - i, 0, 1)
        if (local <= 0) return
        const tl = toScreen(sq.x, sq.y)
        const s = sq.s * L.scale
        ctx.strokeStyle = 'rgba(255, 210, 63, 0.35)'
        ctx.strokeRect(Math.round(tl.x) + 0.5, Math.round(tl.y) + 0.5, Math.round(s), Math.round(s))
        const fontSize = clamp(Math.round(s * 0.18), 6, 18)
        if (fontSize >= 8) {
          ctx.font = `${fontSize}px ${font}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = 'rgba(255, 255, 0, 0.18)'
          ctx.fillText(String(sq.s), tl.x + s / 2, tl.y + s / 2)
        }
      })
      ctx.shadowColor = YELLOW
      ctx.shadowBlur = 12 + G.pulse * 12
      ctx.strokeStyle = '#fff6c2'
      ctx.lineWidth = 3
      ctx.beginPath()
      const maxP = reveal * count
      for (let p = 0; p <= maxP; p += 0.04) {
        const pt = spiralPoint(p)
        const sp = toScreen(pt.x, pt.y)
        if (p === 0) ctx.moveTo(sp.x, sp.y)
        else ctx.lineTo(sp.x, sp.y)
      }
      ctx.stroke()
      ctx.restore()
    }

    const drawKey = (ctx: CanvasRenderingContext2D, key: FloatKey, x: number, y: number, w: number, h: number, alpha: number, glow: number) => {
      if (alpha <= 0 || w < 2) return
      const color = key.kind === 'op' || key.kind === 'eq' ? YELLOW : key.kind === 'num' ? GOLD : '#ffffff'
      ctx.save()
      ctx.globalAlpha = alpha
      const rx = Math.round(x - w / 2)
      const ry = Math.round(y - h / 2)
      ctx.fillStyle = '#080808'
      ctx.fillRect(rx, ry, Math.round(w), Math.round(h))
      if (glow > 0) {
        ctx.shadowColor = color
        ctx.shadowBlur = 10 * glow
      }
      ctx.strokeStyle = glow > 0.5 ? color : '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(rx + 1, ry + 1, Math.round(w) - 2, Math.round(h) - 2)
      ctx.shadowBlur = 0
      const size = Math.max(6, Math.round(Math.min(11, h * 0.42)))
      ctx.font = `${size}px ${font}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = glow > 0.5 ? color : '#ffffff'
      ctx.fillText(key.label, Math.round(x), Math.round(y) + 1)
      ctx.restore()
    }

    const drawKeys = (ctx: CanvasRenderingContext2D) => {
      keys.forEach((key, i) => {
        const p = slotParam(key)
        const pt = spiralPoint(p)
        const target = toScreen(pt.x, pt.y)
        const tw = clamp(pt.size * L.scale * 0.42, 12, 48)
        const th = tw * 0.62
        const fade = G.mode === 'implode' ? clamp(1 - G.t / 1.3, 0, 1) : clamp((p - SLOT_MIN) / 0.6, 0, 1)
        if (G.mode === 'warp') {
          const e = easeInOut(clamp((G.t - 0.5 - i * 0.022) / 1.3, 0, 1))
          const swirl = Math.sin(e * Math.PI) * 60
          const angle = Math.atan2(target.y - key.from.y, target.x - key.from.x) + Math.PI / 2
          const x = key.from.x + (target.x - key.from.x) * e + Math.cos(angle) * swirl
          const y = key.from.y + (target.y - key.from.y) * e + Math.sin(angle) * swirl
          const w = key.from.w + (tw - key.from.w) * e
          const h = key.from.h + (th - key.from.h) * e
          drawKey(ctx, key, x, y, w, h, 1 - e + e * fade, e)
          return
        }
        drawKey(ctx, key, target.x, target.y, tw, th, fade, 1)
      })
    }

    const drawCore = (ctx: CanvasRenderingContext2D, appear: number) => {
      if (appear <= 0) return
      const cp = core()
      const beat = 0.5 + 0.5 * Math.sin(G.time * 5)
      const implodeBoost = G.mode === 'implode' ? Math.min(1, G.t / 1.3) * 3 : 0
      const radius = Math.max(8, L.scale * 1.1) * (1 + G.pulse * 0.5 + beat * 0.15 + implodeBoost) * appear
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const glow = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, radius * 3)
      glow.addColorStop(0, `rgba(255, 255, 200, ${0.8 * appear})`)
      glow.addColorStop(0.35, `rgba(255, 210, 63, ${0.45 * appear})`)
      glow.addColorStop(1, 'rgba(255, 180, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(cp.x - radius * 3, cp.y - radius * 3, radius * 6, radius * 6)
      ctx.restore()
      const px = Math.max(2, Math.round(radius / 4))
      ctx.fillStyle = G.pulse > 0.5 ? '#ffffff' : YELLOW
      for (let yy = -3; yy <= 3; yy++) {
        for (let xx = -3; xx <= 3; xx++) {
          if (xx * xx + yy * yy > 10) continue
          ctx.fillRect(Math.round(cp.x + xx * px - px / 2), Math.round(cp.y + yy * px - px / 2), px, px)
        }
      }
      ctx.fillStyle = '#000'
      const eye = G.pulse > 0.3 ? 1 : 2
      ctx.fillRect(Math.round(cp.x - px / 2), Math.round(cp.y - (eye * px) / 2), px, eye * px)
    }

    const boxTransform = (ctx: CanvasRenderingContext2D, open: number) => {
      const def = G.mode === 'warp' ? 0 : clamp((G.wave + 1) / WAVES.length, 0, 1)
      const rot = Math.sin(G.time * 0.55) * 0.07 * def
      const squash = Math.sin(G.time * 0.9) * 0.045 * def
      ctx.translate(L.boxX + L.boxW / 2, L.boxY + L.boxH / 2)
      ctx.rotate(rot)
      ctx.scale((1 + squash) * open, (1 - squash) * open)
      ctx.translate(-L.boxW / 2, -L.boxH / 2)
    }

    const drawGuideSpiral = (ctx: CanvasRenderingContext2D) => {
      const k = Math.log(PHI) / (Math.PI / 2)
      ctx.save()
      ctx.strokeStyle = `rgba(255, 210, 63, ${0.12 + G.pulse * 0.15})`
      ctx.lineWidth = 1
      for (let arm = 0; arm < 2; arm++) {
        ctx.beginPath()
        for (let th = 0; th < Math.PI * 7; th += 0.12) {
          const r = 2 * Math.exp(k * th)
          if (r > 400) break
          const a = th + arm * Math.PI - G.time * 0.8
          const x = G.origin.x + Math.cos(a) * r
          const y = G.origin.y + Math.sin(a) * r
          if (th === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    const drawBox = (ctx: CanvasRenderingContext2D) => {
      const open = G.mode === 'warp' ? easeInOut(clamp((G.t - 1.9) / 0.6, 0, 1)) : G.mode === 'implode' ? clamp(1 - G.t / 1.2, 0, 1) : 1
      if (open <= 0) return
      ctx.save()
      boxTransform(ctx, open)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, L.boxW, L.boxH)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, L.boxW, L.boxH)
      ctx.clip()
      if (G.mode !== 'warp') drawGuideSpiral(ctx)
      if (G.mode === 'fight' && G.waveT < WAVE_CHARGE && G.waveT > 0) {
        const blink = Math.abs(Math.sin(G.waveT * 16))
        ctx.strokeStyle = `rgba(255, 255, 0, ${0.4 + 0.6 * blink})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(G.origin.x, G.origin.y, 10 + (1 - G.waveT / WAVE_CHARGE) * 30, 0, Math.PI * 2)
        ctx.stroke()
        ctx.font = `10px ${font}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = YELLOW
        ctx.fillText(`${WAVES[G.wave]}`, G.origin.x, G.origin.y)
      }
      G.bullets.forEach((bl) => {
        if (bl.kind === 'num') {
          ctx.font = `12px ${font}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = bl.vr > 0 ? YELLOW : '#ffffff'
          ctx.fillText(bl.ch, Math.round(bl.x), Math.round(bl.y) + 1)
        } else {
          ctx.save()
          ctx.translate(Math.round(bl.x), Math.round(bl.y))
          ctx.rotate(bl.rot)
          const hw = 8 * PHI
          ctx.fillStyle = GOLD
          ctx.fillRect(-hw / 2, -4, hw, 8)
          ctx.fillStyle = '#000'
          ctx.fillRect(-hw / 2 + 2, -2, 4, 4)
          ctx.restore()
        }
      })
      const blink = G.invuln > 0 ? Math.sin(G.time * 40) > 0 : true
      if (blink && G.mode !== 'implode') drawHeart(ctx, G.heart.x, G.heart.y, 2, '#ff1f3d')
      ctx.restore()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.strokeRect(-1.5, -1.5, L.boxW + 3, L.boxH + 3)
      ctx.restore()
    }

    const drawHud = (ctx: CanvasRenderingContext2D) => {
      if (G.mode === 'warp' && G.t < 1.9) return
      const size = Math.max(8, Math.min(12, Math.floor(W / 50)))
      ctx.font = `${size}px ${font}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#7a5a00'
      ctx.fillText(TITLE, W / 2 + 2, L.boxY - 24 + 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(TITLE, W / 2, L.boxY - 24)

      const y = L.boxY + L.boxH + 30
      const barW = Math.min(120, L.boxW * 0.3)
      const left = L.boxX
      ctx.font = `9px ${font}`
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('HP', left, y)
      ctx.fillStyle = '#b3001e'
      ctx.fillRect(left + 28, y - 7, barW, 14)
      ctx.fillStyle = YELLOW
      ctx.fillRect(left + 28, y - 7, (barW * G.hp) / MAX_HP, 14)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${G.hp}/${MAX_HP}`, left + 36 + barW, y)
      ctx.textAlign = 'right'
      ctx.fillStyle = GOLD
      const waveNo = Math.min(WAVES.length, G.wave + 1)
      ctx.fillText(`WAVE ${waveNo}/${WAVES.length} · ${WAVES[G.wave]}`, L.boxX + L.boxW, y)
    }

    const drawImplodeLight = (ctx: CanvasRenderingContext2D) => {
      if (G.mode !== 'implode' || G.t < 1.2) return
      const cp = core()
      const e = clamp((G.t - 1.2) / 1.4, 0, 1)
      const radius = Math.hypot(W, H) * e + 1
      const glow = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, radius)
      glow.addColorStop(0, 'rgba(255, 255, 240, 1)')
      glow.addColorStop(0.5, `rgba(255, 220, 90, ${0.9 * e + 0.1})`)
      glow.addColorStop(1, 'rgba(255, 190, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, W, H)
      if (G.t > 1.8) {
        const s = Math.max(12, Math.min(22, Math.floor(W / 38)))
        ctx.font = `${s}px ${font}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.globalAlpha = clamp((G.t - 1.8) * 2, 0, 1)
        ctx.fillStyle = '#5a3a00'
        ctx.fillText('φ', W / 2, H / 2)
        ctx.globalAlpha = 1
      }
    }

    const draw = () => {
      b.save()
      if (G.shake > 0) b.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake)
      drawBackground(b)
      const reveal = G.mode === 'warp' ? clamp((G.t - 0.7) / 1.5, 0, 1) : 1
      const spiralAlpha = G.mode === 'implode' ? clamp(1 - G.t / 1.3, 0, 1) : 1
      drawSpiral(b, reveal, spiralAlpha)
      drawKeys(b)
      drawCore(b, G.mode === 'warp' ? clamp((G.t - 1.2) / 0.8, 0, 1) : 1)
      drawBox(b)
      drawHud(b)
      drawImplodeLight(b)
      b.restore()
      if (G.flash > 0) {
        b.fillStyle = `rgba(255, 245, 200, ${G.flash * 0.7})`
        b.fillRect(0, 0, W, H)
      }

      // Pixel-art geometric distortion: the frame is re-blitted in horizontal bands shifted along a sine wave.
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.fillStyle = '#000'
      c.fillRect(0, 0, canvas.width, canvas.height)
      const amp = warpAmount() * 22 * dpr
      if (amp < 0.5) {
        c.drawImage(buffer, 0, 0)
        return
      }
      const band = Math.max(2, Math.round(6 * dpr))
      for (let y = 0; y < canvas.height; y += band) {
        const offset = Math.round((Math.sin(y * 0.021 + G.time * 9) + 0.5 * Math.sin(y * 0.063 - G.time * 5)) * amp / band) * band
        c.drawImage(buffer, 0, y, canvas.width, band, offset, y, canvas.width, band)
      }
    }

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      update(dt)
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's']
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (MOVE_KEYS.includes(key)) {
        e.preventDefault()
        G.keys.add(key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      G.keys.delete(key)
    }
    const onBlur = () => G.keys.clear()
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      G.drag = { px: e.clientX, py: e.clientY, hx: G.heart.x, hy: G.heart.y }
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!G.drag || G.mode !== 'fight') return
      G.heart.x = clamp(G.drag.hx + e.clientX - G.drag.px, 9, L.boxW - 9)
      G.heart.y = clamp(G.drag.hy + e.clientY - G.drag.py, 8, L.boxH - 8)
    }
    const onPointerUp = () => {
      G.drag = null
    }

    window.addEventListener('resize', resize)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      audio.close()
      controlsRef.current = null
    }
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-0 z-[300] overflow-hidden bg-black transition-opacity duration-700',
        leaving && 'pointer-events-none opacity-0',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Modo Fibonacci: combate contra el Núcleo Áureo"
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none [image-rendering:pixelated]" />
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/75">
          <p className="font-pixel text-2xl text-[#ffd23f] sm:text-4xl">GAME OVER</p>
          <p className="max-w-[90vw] text-center font-pixel text-[9px] leading-relaxed text-white/80 sm:text-[10px]">
            {'* La espiral te devora... pero φ siempre vuelve a empezar.'}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => controlsRef.current?.retry()}
              className="border-2 border-white px-4 py-3 font-pixel text-[10px] text-white transition-colors hover:border-[#ffff00] hover:text-[#ffff00] focus-visible:outline-2 focus-visible:outline-[#ffff00]"
            >
              REINTENTAR
            </button>
            <button
              type="button"
              onClick={() => controlsRef.current?.exit()}
              className="border-2 border-white/60 px-4 py-3 font-pixel text-[10px] text-white/80 transition-colors hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              SALIR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
