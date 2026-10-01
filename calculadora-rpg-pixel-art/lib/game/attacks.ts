import { DENSITY, MIN_GAP, MIN_WARN, SOUL_SPEED, type Attack, type AttackHost, type Enemy, type Vec } from './types'
import { getDifficultyBand, type DifficultyProfile } from './difficulty'

const TAU = Math.PI * 2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Center-to-center exclusion width that leaves MIN_GAP of clear space between projectiles of radius r. */
const safeWidth = (r: number) => MIN_GAP + 2 * r + 2

/** Max fraction of `span` the gap may move between walls so the soul can always reach the next one. */
const reachFrac = (interval: number, span: number) => clamp((SOUL_SPEED * interval * 0.6) / Math.max(1, span), 0.04, 0.5)

/** Consecutive ring slots to skip so the opening stays >= MIN_GAP at `dist` px from the emitter. */
function ringGapSlots(n: number, r: number, dist: number) {
  const arc = (TAU * dist) / n
  return clamp(Math.ceil((MIN_GAP + 2 * r) / arc) - 1, 2, Math.floor(n / 3))
}

const angDist = (a: number, b: number) => Math.abs((((a - b + Math.PI) % TAU) + TAU) % TAU - Math.PI)

function scheduler() {
  const jobs: { t: number; fn: () => void }[] = []
  return {
    add(delay: number, fn: () => void) {
      jobs.push({ t: delay, fn })
    },
    step(dt: number) {
      for (let i = jobs.length - 1; i >= 0; i--) {
        jobs[i].t -= dt
        if (jobs[i].t <= 0) jobs.splice(i, 1)[0].fn()
      }
    },
  }
}

/** Red blinking line along an entry edge, leaving the safe opening visible. */
function warnEdge(h: AttackHost, horizontalEdge: boolean, fixed: number, start: number, end: number, gapLo: number, gapHi: number) {
  const seg = (a: number, z: number) => {
    if (z - a < 2) return
    if (horizontalEdge) h.telegraph(a, fixed, z, fixed, 6, MIN_WARN)
    else h.telegraph(fixed, a, fixed, z, 6, MIN_WARN)
  }
  seg(start, gapLo)
  seg(gapHi, end)
}

export function tierOf(value: number) {
  const a = Math.abs(value)
  if (a < 10) return 0
  if (a < 100) return 1
  if (a < 1000) return 2
  return 3
}

interface Params {
  tier: number
  phase: number
  speed: number
  rate: number
  r: number
  dmg: number
  color: string
  label: string
  enemy: Enemy
  difficulty: DifficultyProfile
}

type Runner = (t: number, dt: number) => void
type Pattern = (p: Params, h: AttackHost) => Runner

function ticker(interval: number) {
  let acc = interval * 0.9
  return (dt: number) => {
    acc += dt
    let n = 0
    while (acc >= interval) {
      acc -= interval
      n++
    }
    return n
  }
}

const aimed: Pattern = (p, h) => {
  const tick = ticker(0.55 / p.rate)
  const spread = p.tier === 0 ? 1 : p.tier === 1 ? 3 : 5
  const jobs = scheduler()
  const fire = (o: Vec, a: number) => {
    for (let k = 0; k < spread; k++) {
      const ang = a + (k - (spread - 1) / 2) * 0.24
      const s = p.speed * 1.25
      h.spawn({ x: o.x, y: o.y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: p.r, dmg: p.dmg, color: p.color })
    }
    h.sound('shoot')
  }
  return (_t, dt) => {
    jobs.step(dt)
    for (let i = tick(dt); i > 0; i--) {
      const o = h.emitFrom(p.enemy)
      const a = Math.atan2(h.player.y - o.y, h.player.x - o.x)
      if (p.phase < 3) {
        fire(o, a)
        continue
      }
      for (let k = 0; k < spread; k++) {
        const ang = a + (k - (spread - 1) / 2) * 0.24
        h.telegraph(o.x, o.y, o.x + Math.cos(ang) * 2000, o.y + Math.sin(ang) * 2000, p.r * 2 + 2, MIN_WARN)
      }
      h.sound('warn')
      jobs.add(MIN_WARN, () => fire(o, a))
    }
  }
}

const rain: Pattern = (p, h) => {
  const interval = 0.55 / p.rate
  const tick = ticker(interval)
  const jobs = scheduler()
  let gap = 0.5
  return (_t, dt) => {
    jobs.step(dt)
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const gapW = Math.max(safeWidth(p.r), 30, (84 - p.tier * 9) * p.difficulty.safeSpace)
      const reach = reachFrac(interval, b.w)
      gap = clamp(gap + clamp((h.rng() - 0.5) * 0.5, -reach, reach), 0.12, 0.88)
      const at = gap
      const drop = () => {
        const b = h.box
        const n = Math.max(6, Math.floor(b.w / (22 - p.tier * 2)))
        const gx = b.x + at * b.w
        for (let k = 0; k <= n; k++) {
          const x = b.x + (k * b.w) / n
          if (Math.abs(x - gx) < gapW / 2) continue
          if (p.tier === 0 && h.rng() < 0.6) continue
          h.spawn({ x, y: b.y - 14, vx: 0, vy: p.speed * 0.9, r: p.r, dmg: p.dmg, color: '#f4f4f4' })
        }
        h.sound('shoot')
      }
      if (p.phase < 3) {
        drop()
        continue
      }
      const gx = b.x + at * b.w
      warnEdge(h, true, b.y + 4, b.x, b.x + b.w, gx - gapW / 2, gx + gapW / 2)
      jobs.add(MIN_WARN, drop)
    }
  }
}

const sweep: Pattern = (p, h) => {
  const interval = 0.85 / p.rate
  const tick = ticker(interval)
  const jobs = scheduler()
  let side = h.rng() < 0.5 ? 1 : -1
  let gapAt = 0.15 + h.rng() * 0.7
  return (_t, dt) => {
    jobs.step(dt)
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const gapH = Math.max(safeWidth(p.r), 44, 74 - p.tier * 7)
      const reach = reachFrac(interval, b.h)
      gapAt = clamp(gapAt + clamp((h.rng() - 0.5) * 0.7, -reach, reach), 0.15, 0.85)
      const at = gapAt
      const dir = side
      const fire = () => {
        const b = h.box
        const n = Math.max(5, Math.floor(b.h / 18))
        const gapY = b.y + at * b.h
        const x = dir > 0 ? b.x - 16 : b.x + b.w + 16
        for (let k = 0; k <= n; k++) {
          const y = b.y + (k * b.h) / n
          if (Math.abs(y - gapY) < gapH / 2) continue
          h.spawn({ x, y, vx: dir * p.speed * 0.95, vy: 0, r: p.r, dmg: p.dmg, color: p.color })
        }
        h.sound('shoot')
      }
      side *= -1
      if (p.phase < 3) {
        fire()
        continue
      }
      const gy = b.y + at * b.h
      warnEdge(h, false, dir > 0 ? b.x + 4 : b.x + b.w - 4, b.y, b.y + b.h, gy - gapH / 2, gy + gapH / 2)
      jobs.add(MIN_WARN, fire)
    }
  }
}

const diagonal: Pattern = (p, h) => {
  const tick = ticker(0.13 / p.rate)
  let dir = h.rng() < 0.5 ? 1 : -1
  let flip = 0
  return (_t, dt) => {
    flip += dt
    if (flip > 1.6) {
      flip = 0
      dir *= -1
    }
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const along = h.rng() * (b.w + b.h)
      let x: number
      let y: number
      if (along < b.w) {
        x = b.x + along
        y = b.y - 12
      } else {
        x = dir > 0 ? b.x - 12 : b.x + b.w + 12
        y = b.y + (along - b.w)
      }
      const s = p.speed * 0.75
      h.spawn({ x, y, vx: dir * s, vy: s, r: p.r, dmg: p.dmg, color: p.color, kind: 'orb' })
    }
  }
}

const ring: Pattern = (p, h) => {
  const tick = ticker(0.75 / p.rate)
  let rot = h.rng() * TAU
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const o = h.emitFrom(p.enemy)
      const n = 12 + p.tier * 4 + (p.phase - 1) * 4
      rot += 0.3
      const gapStart = Math.floor(h.rng() * n)
      const skip = ringGapSlots(n, p.r, 70)
      for (let k = 0; k < n; k++) {
        if ((k - gapStart + n) % n < skip) continue
        const a = rot + (k / n) * TAU
        const s = p.speed * 0.75
        h.spawn({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: p.r, dmg: p.dmg, color: p.color, kind: 'orb' })
      }
      h.sound('shoot')
    }
  }
}

const wave: Pattern = (p, h) => {
  const tick = ticker(0.17 / p.rate)
  const side = h.rng() < 0.5 ? 1 : -1
  let lane = 0
  return (t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      lane = (lane + 1) % 4
      const base = b.y + ((lane + 0.5) * b.h) / 4
      const amp = Math.max(0, Math.min(16 + p.tier * 6, (b.h / 4 - safeWidth(p.r)) / 2))
      h.spawn({
        x: side > 0 ? b.x - 12 : b.x + b.w + 12,
        y: base,
        vx: side * p.speed * 0.7,
        vy: 0,
        r: p.r,
        dmg: p.dmg,
        color: p.color,
        kind: 'orb',
        wave: { amp, freq: 4, base, phase: t * 3 },
      })
    }
  }
}

const bounce: Pattern = (p, h) => {
  const tick = ticker(0.9 / p.rate)
  const chars = p.label.replace(/[^0-9A-Z]/g, '').split('')
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const o = h.emitFrom(p.enemy)
      const b = h.box
      const tx = b.x + b.w * (0.2 + h.rng() * 0.6)
      const ty = b.y + b.h * (0.2 + h.rng() * 0.6)
      const a = Math.atan2(ty - o.y, tx - o.x)
      const s = p.speed * 0.85
      const text = chars[Math.floor(h.rng() * chars.length)] ?? '?'
      h.spawn({
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: p.tier >= 3 ? 12 : 8,
        dmg: p.dmg + 2,
        color: p.color,
        kind: 'glyph',
        text,
        bounces: 2 + p.tier,
        life: 7,
      })
      h.sound('shoot')
    }
  }
}

const BLASTER_WARN = 0.6

const blaster: Pattern = (p, h) => {
  const tick = ticker(0.8 / p.rate)
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const mode = h.rng()
      const thick = 16 + p.tier * 5
      let x1: number, y1: number, x2: number, y2: number
      if (mode < 0.35) {
        const y = clamp(h.player.y, b.y + thick / 2, b.y + b.h - thick / 2)
        const left = h.rng() < 0.5
        x1 = left ? b.x - 34 : b.x + b.w + 34
        x2 = left ? b.x + b.w + 400 : b.x - 400
        y1 = y2 = y
      } else if (mode < 0.7) {
        const x = clamp(h.player.x, b.x + thick / 2, b.x + b.w - thick / 2)
        const top = h.rng() < 0.5
        y1 = top ? b.y - 34 : b.y + b.h + 34
        y2 = top ? b.y + b.h + 400 : b.y - 400
        x1 = x2 = x
      } else {
        const a = h.rng() * TAU
        const rad = Math.max(b.w, b.h) * 0.5 + 44
        x1 = b.x + b.w / 2 + Math.cos(a) * rad
        y1 = b.y + b.h / 2 + Math.sin(a) * rad
        const d = Math.atan2(h.player.y - y1, h.player.x - x1)
        x2 = x1 + Math.cos(d) * 2000
        y2 = y1 + Math.sin(d) * 2000
      }
      h.beam({ x1, y1, x2, y2, thick, warn: BLASTER_WARN, dur: 0.45 + p.difficulty.arenaPressure * 0.08, dmg: p.dmg + 4, color: p.color, visual: 'blaster' })
      h.sound('warn')
    }
  }
}

const spiral: Pattern = (p, h) => {
  const arms = 2 + Math.min(3, p.tier)
  const dirSign = h.rng() < 0.5 ? 1 : -1
  const tick = ticker(0.1 / p.rate)
  let a = h.rng() * TAU
  let marked = false
  return (t, dt) => {
    const b = h.box
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    if (!marked) {
      marked = true
      h.marker(cx, cy, 0.75, p.color)
      h.sound('warn')
    }
    if (t < 0.75) return
    a += dt * 1.7 * dirSign
    for (let i = tick(dt); i > 0; i--) {
      for (let k = 0; k < arms; k++) {
        const ang = a + (k / arms) * TAU
        const s = p.speed * 0.65
        h.spawn({ x: cx + Math.cos(ang) * 12, y: cy + Math.sin(ang) * 12, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: p.r, dmg: p.dmg, color: p.color, kind: 'orb' })
      }
    }
  }
}

const grid: Pattern = (p, h) => {
  const tick = ticker(1.35 / p.rate)
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const cells = 3 + (p.phase === 2 ? 1 : 0)
      const safe = Math.floor(h.rng() * cells)
      const vertical = h.rng() < 0.5
      for (let c = 0; c < cells; c++) {
        if (c === safe) continue
        if (vertical) {
          const cw = b.w / cells
          const x = b.x + (c + 0.5) * cw
          h.beam({ x1: x, y1: b.y - 34, x2: x, y2: b.y + b.h + 400, thick: cw * 0.92, warn: 0.9, dur: 0.5, dmg: p.dmg + 4, color: p.color })
        } else {
          const ch = b.h / cells
          const y = b.y + (c + 0.5) * ch
          h.beam({ x1: b.x - 34, y1: y, x2: b.x + b.w + 400, y2: y, thick: ch * 0.92, warn: 0.9, dur: 0.5, dmg: p.dmg + 4, color: p.color })
        }
      }
      h.sound('warn')
    }
  }
}

const verticalImpact: Pattern = (p, h) => {
  let side = h.rng() < 0.5 ? -1 : 1
  let fired = false
  return (t, _dt) => {
    const b = h.box
    const x = b.x + b.w * (side < 0 ? 0.28 : 0.72)
    const y = b.y + b.h * 0.56
    if (t < 1.05) {
      if (Math.floor(t * 9) % 2 === 0) h.marker(x, y, 0.18, p.color)
      return
    }
    if (!fired) {
      fired = true
      h.beam({ x1: x, y1: b.y, x2: x, y2: b.y + b.h, thick: Math.max(38, b.w * 0.1), warn: 0, dur: 0.32, dmg: p.dmg + 3, color: p.color })
      h.sound('beam')
    }
    if (t > 1.38 && t < 1.65) {
      h.spawn({ x: x - side * 70, y: b.y - 14, vx: side * 120, vy: 280, r: 13, dmg: p.dmg, color: '#fff', kind: 'bone', life: 1.8 })
      h.spawn({ x: x + side * 70, y: b.y - 14, vx: side * 120, vy: 280, r: 13, dmg: p.dmg, color: '#fff', kind: 'bone', life: 1.8 })
    }
  }
}

const arenaCompression: Pattern = (p, h) => {
  let fired = false
  return (t, _dt) => {
    const b = h.box
    const inset = Math.min(b.w, b.h) * 0.08 + Math.max(0, t - 0.8) * 18
    if (t < 1.1) {
      h.marker(b.x + b.w / 2, b.y + b.h / 2, 0.2, p.color)
      return
    }
    if (!fired) {
      fired = true
      h.beam({ x1: b.x - 20, y1: b.y + inset, x2: b.x + b.w + 20, y2: b.y + inset, thick: 18, warn: 0, dur: 4.4, dmg: p.dmg, color: p.color })
      h.beam({ x1: b.x - 20, y1: b.y + b.h - inset, x2: b.x + b.w + 20, y2: b.y + b.h - inset, thick: 18, warn: 0, dur: 4.4, dmg: p.dmg, color: p.color })
      h.sound('warn')
    }
    if (t > 1.2 && t < 4.5 && Math.floor(t * 4) % 2 === 0) {
      const safeX = b.x + b.w / 2 + Math.sin(t * 2) * b.w * 0.22
      h.marker(safeX, b.y + b.h / 2, 0.12, '#7dff6b')
    }
  }
}

const energyFracture: Pattern = (p, h) => {
  let released = false
  return (t, dt) => {
    const b = h.box
    const cx = b.x + b.w / 2
    const cy = b.y + b.h * 0.5
    if (!released && t > 0.9) {
      released = true
      const chars = p.label.split('')
      chars.forEach((char, i) => {
        const a = (i / Math.max(1, chars.length)) * TAU
        h.spawn({ x: cx, y: cy, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, r: 12, dmg: p.dmg, color: p.color, kind: 'glyph', text: char, bounces: 1, life: 4.2 })
      })
      h.sound('split')
    }
    if (t > 1.3 && t < 3.9 && Math.floor(t * 3) % 2 === 0) {
      const a = t * 2.2
      h.marker(cx + Math.cos(a) * b.w * 0.25, cy + Math.sin(a) * b.h * 0.25, 0.12, p.color)
    }
    if (t > 2.8 && Math.floor((t - 2.8) / 0.32) !== Math.floor((t - 2.8 - dt) / 0.32)) {
      const a = h.rng() * TAU
      h.spawn({ x: cx + Math.cos(a) * b.w * 0.3, y: cy + Math.sin(a) * b.h * 0.3, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 5, dmg: p.dmg, color: p.color, kind: 'orb', life: 2.4 })
    }
  }
}

const centralPulse: Pattern = (p, h) => {
  let rings = 0
  let next = 0.85
  return (t, _dt) => {
    const b = h.box
    const o = h.emitFrom(p.enemy)
    if (t < 0.8) {
      h.marker(o.x, b.y + b.h * 0.38, 0.16, p.color)
      return
    }
    if (t >= next && rings < 4) {
      rings++
      next += 0.58
      const n = 14
      const gap = Math.floor(h.rng() * n)
      const skip = ringGapSlots(n, 5, 60)
      for (let i = 0; i < n; i++) {
        if ((i - gap + n) % n < skip) continue
        const a = (i / n) * TAU
        h.spawn({ x: o.x, y: b.y + b.h * 0.42, vx: Math.cos(a) * 105, vy: Math.sin(a) * 105, r: 5, dmg: p.dmg, color: p.color, kind: 'orb', life: 4 })
      }
      h.sound('warn')
    }
  }
}

const WHITE = '#f4f4f4'

/** Undertale-style bone wall: floor + ceiling bones with a single passable gap, sliding horizontally. */
const boneSweep: Pattern = (p, h) => {
  const interval = 0.62 / p.rate
  const tick = ticker(interval)
  let side = h.rng() < 0.5 ? 1 : -1
  let gapY = 0.5
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const gap = Math.max(46, safeWidth(4), (92 - p.tier * 8) * p.difficulty.safeSpace)
      const reach = reachFrac(interval, b.h)
      gapY = clamp(gapY + clamp((h.rng() - 0.5) * 0.6, -reach, reach), 0.2, 0.8)
      const gy = b.y + gapY * b.h
      const r = 4
      const x = side > 0 ? b.x + r + 1 : b.x + b.w - r - 1
      const topLen = (gy - gap / 2 - b.y) / 2
      const botLen = (b.y + b.h - (gy + gap / 2)) / 2
      const vx = side * p.speed * 0.9
      if (topLen > 6) h.spawn({ x, y: b.y + topLen, vx, vy: 0, r, len: topLen, vertical: true, dmg: p.dmg, color: WHITE, kind: 'bone' })
      if (botLen > 6) h.spawn({ x, y: b.y + b.h - botLen, vx, vy: 0, r, len: botLen, vertical: true, dmg: p.dmg, color: WHITE, kind: 'bone' })
      if (h.rng() < 0.5) side *= -1
      h.sound('shoot')
    }
  }
}

/** Straight white energy lines (vertical rain rows and horizontal sweeps) with one safe lane. */
const energyLines: Pattern = (p, h) => {
  const tick = ticker(0.7 / p.rate)
  let horizontal = h.rng() < 0.5
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const span = horizontal ? b.h : b.w
      const n = Math.max(6, Math.floor(span / 24))
      const safe = 1 + Math.floor(h.rng() * (n - 2))
      for (let k = 0; k <= n; k++) {
        if (Math.abs(k - safe) <= 1) continue
        const along = (k / n) * span
        if (horizontal) h.spawn({ x: b.x + 6, y: b.y + along, vx: p.speed, vy: 0, r: 4, dmg: p.dmg, color: WHITE, kind: 'orb' })
        else h.spawn({ x: b.x + along, y: b.y + 6, vx: 0, vy: p.speed, r: 4, dmg: p.dmg, color: WHITE, kind: 'orb' })
      }
      horizontal = !horizontal
      h.sound('shoot')
    }
  }
}

function gaster(h: AttackHost, p: Params, x1: number, y1: number, ang: number, thick: number) {
  h.beam({ x1, y1, x2: x1 + Math.cos(ang) * 3000, y2: y1 + Math.sin(ang) * 3000, thick, warn: BLASTER_WARN, dur: 0.5, dmg: p.dmg + 4, color: '#fff', visual: 'gaster' })
}

/** Side blasters: telegraph with a red line for 0.6s, then fire a clean white beam across the box. */
const gasterSides: Pattern = (p, h) => {
  const tick = ticker(0.95 / p.rate)
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const thick = 26 + p.tier * 4
      const count = p.phase >= 2 ? 2 : 1 + (h.rng() < 0.35 ? 1 : 0)
      for (let k = 0; k < count; k++) {
        const left = h.rng() < 0.5
        const y = k === 0 ? clamp(h.player.y, b.y + thick, b.y + b.h - thick) : b.y + thick + h.rng() * (b.h - thick * 2)
        gaster(h, p, left ? b.x + 18 : b.x + b.w - 18, y, left ? 0 : Math.PI, thick)
      }
      h.sound('warn')
    }
  }
}

const SYMBOLS = ['+', '-', '×', '÷']

/** Concentric rings of math symbols that close in on the soul, each with a 2-symbol gap. */
const symbolRings: Pattern = (p, h) => {
  const tick = ticker(1.25 / p.rate)
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const cx = h.player.x
      const cy = h.player.y
      const layers = p.phase >= 2 ? 3 : 2
      const speed = p.speed * 0.55
      // Openings are guaranteed at refDist from the closing point, and successive layers stay reachable.
      const refDist = Math.max(36, Math.min(b.w, b.h) * 0.2)
      const halfGap = Math.min(Math.PI / 3, (safeWidth(7) / 2 + 2) / refDist)
      const maxShift = Math.min(halfGap, (SOUL_SPEED * (34 / speed) * 0.5) / refDist)
      let gapA = h.rng() * TAU
      for (let layer = 0; layer < layers; layer++) {
        const R = Math.min(b.w, b.h) * 0.42 + layer * 34
        const n = 14 + layer * 4
        if (layer > 0) gapA += (h.rng() - 0.5) * 2 * maxShift
        const rot = h.rng() * TAU
        for (let k = 0; k < n; k++) {
          const a = rot + (k / n) * TAU
          if (angDist(a, gapA) < halfGap) continue
          const x = cx + Math.cos(a) * R
          const y = cy + Math.sin(a) * R
          if (x < b.x + 8 || x > b.x + b.w - 8 || y < b.y + 8 || y > b.y + b.h - 8) continue
          h.spawn({ x, y, vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed, r: 7, dmg: p.dmg, color: WHITE, kind: 'symbol', text: SYMBOLS[k % 4], life: R / speed + 0.25 })
        }
      }
      h.sound('warn')
    }
  }
}

/** High-speed rain of pixel digits with a drifting safe column. */
const numberRain: Pattern = (p, h) => {
  const tick = ticker(0.09 / p.rate)
  let safe = 0.5
  return (_t, dt) => {
    safe = clamp(safe + (h.rng() - 0.5) * dt * 1.4, 0.12, 0.88)
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const x = b.x + 8 + h.rng() * (b.w - 16)
      if (Math.abs(x - (b.x + safe * b.w)) < Math.max(38, safeWidth(7) / 2)) continue
      h.spawn({ x, y: b.y + 8, vx: 0, vy: p.speed * (1.35 + h.rng() * 0.5), r: 7, dmg: p.dmg, color: WHITE, kind: 'digit', text: String(Math.floor(h.rng() * 10)) })
    }
  }
}

/** Expert: diagonal blasters from the corners aimed through the soul. */
const gasterDiagonal: Pattern = (p, h) => {
  const tick = ticker(0.55 / p.rate)
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const corner = Math.floor(h.rng() * 4)
      const x = corner % 2 ? b.x + b.w - 22 : b.x + 22
      const y = corner < 2 ? b.y + 22 : b.y + b.h - 22
      const lead = (h.rng() - 0.5) * 40
      const ang = Math.atan2(h.player.y + lead - y, h.player.x + lead - x)
      gaster(h, p, x, y, ang, 24 + p.tier * 3)
      h.sound('warn')
    }
  }
}

/** Expert: moving bone mesh — full walls with exactly one open slot, alternating axis. */
const boneMesh: Pattern = (p, h) => {
  const tick = ticker(0.8 / p.rate)
  let vertical = true
  return (_t, dt) => {
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const span = vertical ? b.h : b.w
      const slot = Math.max(40, safeWidth(4) + 4, 50 * p.difficulty.safeSpace)
      const slotAt = 8 + slot / 2 + h.rng() * (span - slot - 16)
      const r = 4
      const segments = [
        [0, slotAt - slot / 2],
        [slotAt + slot / 2, span],
      ]
      const fromStart = h.rng() < 0.5
      for (const [a, z] of segments) {
        const len = (z - a) / 2
        if (len < 6) continue
        const mid = a + len
        if (vertical) h.spawn({ x: fromStart ? b.x + r + 1 : b.x + b.w - r - 1, y: b.y + mid, vx: (fromStart ? 1 : -1) * p.speed * 0.85, vy: 0, r, len, vertical: true, dmg: p.dmg, color: WHITE, kind: 'bone' })
        else h.spawn({ x: b.x + mid, y: fromStart ? b.y + r + 1 : b.y + b.h - r - 1, vx: 0, vy: (fromStart ? 1 : -1) * p.speed * 0.85, r, len, vertical: false, dmg: p.dmg, color: WHITE, kind: 'bone' })
      }
      vertical = !vertical
      h.sound('shoot')
    }
  }
}

/** Expert: ultra-fast serpentine bursts sweeping in snaking chains. */
const serpent: Pattern = (p, h) => {
  const tick = ticker(0.045 / p.rate)
  let side = h.rng() < 0.5 ? 1 : -1
  let lane = 0.5
  let chain = 17
  let hold = 0
  return (t, dt) => {
    if (hold > 0) {
      hold -= dt
      return
    }
    for (let i = tick(dt); i > 0; i--) {
      const b = h.box
      const amp = Math.max(0, Math.min(30 + p.tier * 6, b.h * 0.8 - safeWidth(4)))
      if (chain++ > 16) {
        chain = 0
        side *= -1
        lane = 0.2 + h.rng() * 0.6
        // Each ultra-fast chain is telegraphed along its full band before it fires.
        const y = b.y + lane * b.h
        h.telegraph(b.x, y, b.x + b.w, y, (amp + 4) * 2, MIN_WARN)
        h.sound('warn')
        hold = MIN_WARN
        break
      }
      const base = b.y + lane * b.h
      h.spawn({ x: side > 0 ? b.x + 6 : b.x + b.w - 6, y: base, vx: side * p.speed * 1.5, vy: 0, r: 4, dmg: p.dmg, color: WHITE, kind: 'orb', wave: { amp, freq: 7, base, phase: t * 2 } })
    }
  }
}

const BAND_PATTERNS: string[][] = [
  ['bone-sweep', 'energy-lines'],
  ['gaster-sides', 'bone-sweep', 'energy-lines'],
  ['symbol-rings', 'number-rain', 'gaster-sides'],
  ['gaster-diagonal', 'bone-mesh', 'serpent'],
]

const REGISTRY: { name: string; label: string; minTier: number; fn: Pattern }[] = [
  { name: 'bone-sweep', label: 'HUESOS', minTier: 99, fn: boneSweep },
  { name: 'energy-lines', label: 'LÍNEAS DE ENERGÍA', minTier: 99, fn: energyLines },
  { name: 'gaster-sides', label: 'BLASTERS LATERALES', minTier: 99, fn: gasterSides },
  { name: 'symbol-rings', label: 'ANILLOS SIMBÓLICOS', minTier: 99, fn: symbolRings },
  { name: 'number-rain', label: 'LLUVIA NUMÉRICA', minTier: 99, fn: numberRain },
  { name: 'gaster-diagonal', label: 'BLASTERS DIAGONALES', minTier: 99, fn: gasterDiagonal },
  { name: 'bone-mesh', label: 'MALLA DE HUESOS', minTier: 99, fn: boneMesh },
  { name: 'serpent', label: 'RÁFAGA SERPIENTE', minTier: 99, fn: serpent },
  { name: 'aimed', label: 'DISPARO', minTier: 0, fn: aimed },
  { name: 'rain', label: 'LLUVIA', minTier: 0, fn: rain },
  { name: 'sweep', label: 'BARRIDO', minTier: 0, fn: sweep },
  { name: 'diagonal', label: 'DIAGONAL', minTier: 0, fn: diagonal },
  { name: 'ring', label: 'ANILLO', minTier: 1, fn: ring },
  { name: 'wave', label: 'ONDA', minTier: 1, fn: wave },
  { name: 'bounce', label: 'REBOTE', minTier: 1, fn: bounce },
  { name: 'blaster', label: 'CANON', minTier: 2, fn: blaster },
  { name: 'spiral', label: 'ESPIRAL', minTier: 2, fn: spiral },
  { name: 'grid', label: 'REJILLA', minTier: 3, fn: grid },
  { name: 'vertical-impact', label: 'GOLPE VERTICAL', minTier: 0, fn: verticalImpact },
  { name: 'arena-compression', label: 'COMPRESIÓN DE ARENA', minTier: 0, fn: arenaCompression },
  { name: 'energy-fracture', label: 'FRAGMENTACIÓN DE ENERGÍA', minTier: 0, fn: energyFracture },
  { name: 'central-pulse', label: 'PULSO CENTRAL', minTier: 0, fn: centralPulse },
]

function makeParams(enemy: Enemy, eff: number, phase: number, index: number, difficulty: DifficultyProfile): Params {
  const t = enemy.tier
  const hard = phase >= 2
  return {
    tier: eff,
    phase,
    speed: (difficulty.projectileSpeed + [30, 12, 0, -12][t]) * difficulty.attackSpeed * (hard ? 1.08 : 1) * (phase === 2 ? 0.7 : 1),
    rate: Math.max(0.22, (1 / difficulty.spawnRate) * 0.18) * [1.3, 1.1, 1, 0.95][t] * difficulty.attackFrequency * (1 + index * 0.012) * (phase === 2 ? 2.8 : 1) * DENSITY,
    r: [3, 4, 5, 6.5][t],
    dmg: [3, 4, 6, 8][t] + (hard ? 2 : 0) + Math.floor(difficulty.score * 2),
    difficulty,
    color: enemy.color,
    label: enemy.label,
    enemy,
  }
}

const milestonePatterns: Record<number, string[]> = {
  1: ['aimed', 'sweep', 'diagonal'], 15: ['aimed', 'sweep', 'wave'], 20: ['sweep', 'aimed', 'diagonal'],
  30: ['spiral', 'diagonal', 'aimed'], 40: ['rain', 'wave', 'sweep'], 50: ['rain', 'sweep', 'diagonal'],
  60: ['bounce', 'aimed', 'wave'], 70: ['diagonal', 'wave', 'sweep'], 80: ['grid', 'rain', 'sweep'],
  90: ['ring', 'spiral', 'wave'], 100: ['ring', 'spiral', 'blaster'], 200: ['wave', 'diagonal', 'bounce'],
  300: ['rain', 'grid', 'ring'], 400: ['blaster', 'grid', 'diagonal'], 500: ['blaster', 'sweep', 'bounce'],
  600: ['wave', 'diagonal', 'rain'], 700: ['spiral', 'ring', 'wave'], 800: ['ring', 'diagonal', 'blaster'],
  900: ['grid', 'sweep', 'ring'], 1000: ['blaster', 'grid', 'spiral'], 2000: ['blaster', 'ring', 'wave'],
  3000: ['grid', 'spiral', 'blaster'], 4000: ['blaster', 'grid', 'ring'], 5000: ['blaster', 'spiral', 'grid'],
  8000: ['blaster', 'ring', 'grid'], 9000: ['blaster', 'grid', 'spiral'],
}

export function getRandomAttackPattern(currentNumber: number, rng: () => number, last?: string) {
  const points = Object.keys(milestonePatterns).map(Number).filter((point) => point <= currentNumber)
  const point = points.at(-1) ?? 1
  const pool = milestonePatterns[point].filter((name) => name !== last)
  return pool[Math.floor(rng() * pool.length)] ?? milestonePatterns[point][0]
}

export function createAttack(
  enemies: Enemy[],
  index: number,
  phase: number,
  rng: () => number,
  host: AttackHost,
  difficulty: DifficultyProfile,
  last?: string,
): Attack {
  const enemy = enemies[index % enemies.length]
  const eff = Math.min(3, enemy.tier + (phase === 2 ? 1 : 0) + (difficulty.patternComplexity > 1.15 ? 1 : 0))
  if (phase === 3 || phase === 4) {
    const specialNames = phase === 4
      ? ['vertical-impact', 'arena-compression', 'central-pulse', 'energy-fracture', 'grid', 'blaster', 'wave', 'ring', 'spiral']
      : ['vertical-impact', 'arena-compression', 'energy-fracture', 'central-pulse', 'sweep', 'ring']
    const special = REGISTRY.filter((p) => specialNames.includes(p.name) && p.name !== last)
    const chosen = special[index % special.length]
    const runners: Runner[] = [chosen.fn(makeParams(enemy, Math.max(1, eff), phase, index, difficulty), host)]
    const supportPool = REGISTRY.filter((p) => p.minTier <= Math.max(1, eff - 1) && p.name !== chosen.name && p.name !== last)
    const supportCount = phase === 4 ? Math.min(4, 2 + Math.floor(difficulty.patternComplexity * 1.8)) : Math.min(3, 1 + Math.floor(difficulty.patternComplexity * 1.5))
    for (let slot = 0; slot < supportCount; slot++) {
      const support = supportPool[(index + slot * 2) % supportPool.length]
      const supportParams = makeParams(enemies[(index + slot + 1) % enemies.length], Math.max(0, eff - 1), phase, index + slot + 1, difficulty)
      supportParams.rate *= 0.72 + slot * 0.06
      runners.push(support.fn(supportParams, host))
    }
    const name = chosen.name
    return {
      name,
      label: chosen.label,
      enemy,
      duration: (chosen.name === 'arena-compression' ? 4.8 : phase === 4 ? 4.5 : 4.1) + difficulty.comboLength * 0.16,
      update(t, dt) {
        for (const run of runners) run(t, dt)
      },
    }
  }
  const band = getDifficultyBand(difficulty.currentNumber)
  const byName = (name: string) => REGISTRY.find((p) => p.name === name)!
  const bandNames = BAND_PATTERNS[band]
  const choices = bandNames.filter((name) => name !== last)
  const main = byName(choices[Math.floor(rng() * choices.length)] ?? bandNames[0])
  const runners: Runner[] = [main.fn(makeParams(enemy, eff, phase, index, difficulty), host)]

  // Expert mode layers patterns chaotically; phase 2 always adds a lighter support pattern.
  const layered = band === 3 || phase === 2 || rng() < difficulty.specialAttackChance * 0.3
  if (layered) {
    const supportNames = bandNames.filter((name) => name !== main.name)
    const support = byName(supportNames[Math.floor(rng() * supportNames.length)] ?? bandNames[0])
    const sp = makeParams(enemies[(index + 1) % enemies.length], eff, phase, index, difficulty)
    sp.rate *= band === 3 ? 0.55 : Math.max(0.38, 0.6 - difficulty.arenaPressure * 0.12)
    runners.push(support.fn(sp, host))
  }

  return {
    name: main.name,
    label: main.label,
    enemy,
    duration: (phase >= 3 ? 4.6 : phase === 2 ? 3.8 : 3.4) + eff * 0.35 + difficulty.comboLength * 0.18,
    update(t, dt) {
      for (const run of runners) run(t, dt)
    },
  }
}
