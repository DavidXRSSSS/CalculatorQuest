'use client'

import { useEffect, useRef, useState } from 'react'
import { sfx } from '@/lib/game/audio'
import { CatAudio } from '@/lib/game/cat-audio'
import { MAX_HP } from '@/lib/game/engine'
import { cn } from '@/lib/utils'

type Mode = 'enter' | 'fight' | 'dead' | 'victory'

type Spear = { x: number; y: number; vy: number; len: number; state: 'warn' | 'fall' | 'stuck'; t: number }
type Sweep = { bands: [number, number][]; x: number; state: 'warn' | 'go'; t: number; warn: number }
type Orb = { cx: number; cy: number; r: number; th: number; vr: number; w: number }

const FIGHT_DURATION = 105
const PHASE2_AT = 35
const PHASE3_AT = 75
const ENTER_DURATION = 1.6
const HEART_SPEED = 150
const HIT_RADIUS = 3
const DAMAGE = 12
const IFRAMES = 1.3
const CYAN = '#3ff5ff'
const CYAN_DEEP = '#0a8fa3'
const RED = '#e8232b'
const HEART = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']
const SPEAR_TIP = { x: 0.815, y: 0.15 }
const PHASE_NAMES = ['', 'LANZAS CELESTES', 'ESTOCADA Y BARRIDO', 'RÁFAGA EN ESPIRAL']
const BAND_PATTERNS: [number, number][][] = [
  [[0, 0.55]],
  [[0.45, 1]],
  [[0.28, 0.72]],
]
const HARD_BAND_PATTERNS: [number, number][][] = [...BAND_PATTERNS, [[0, 0.36], [0.64, 1]]]

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function layout(W: number, H: number) {
  const boxW = Math.min(460, W * 0.9)
  const boxH = Math.min(230, Math.max(160, H * 0.3))
  const boxX = (W - boxW) / 2
  const boxY = H - boxH - 84
  const size = clamp(Math.min(boxY - 90, W * 0.7), 90, 300)
  const spriteX = W / 2 - size / 2
  const spriteY = boxY - 40 - size
  return { boxW, boxH, boxX, boxY, size, spriteX, spriteY }
}

function drawHeart(c: CanvasRenderingContext2D, cx: number, cy: number, p: number, color: string) {
  const ox = Math.round(cx - 4.5 * p)
  const oy = Math.round(cy - 4 * p)
  c.fillStyle = color
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') c.fillRect(ox + x * p, oy + y * p, p, p)
  })
}

function circleHitsRect(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number) {
  return Math.hypot(cx - clamp(cx, x0, x1), cy - clamp(cy, y0, y1)) < r
}

function drawSmallSpear(c: CanvasRenderingContext2D, x: number, tipY: number, len: number, alpha: number) {
  c.save()
  c.globalAlpha = alpha
  const px = Math.round(x)
  const ty = Math.round(tipY)
  c.fillStyle = CYAN_DEEP
  c.fillRect(px - 1, ty - len, 2, len - 8)
  c.fillStyle = CYAN
  c.beginPath()
  c.moveTo(px, ty)
  c.lineTo(px - 5, ty - 10)
  c.lineTo(px + 5, ty - 10)
  c.closePath()
  c.fill()
  c.fillStyle = '#ffffff'
  c.fillRect(px - 1, ty - 8, 2, 4)
  c.restore()
}

export function CatKnightFight({ muted, onFinish }: { muted: boolean; onFinish: (won: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mutedRef = useRef(muted)
  const onFinishRef = useRef(onFinish)
  const controlsRef = useRef<{ retry: () => void; exit: () => void } | null>(null)
  const [dead, setDead] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [status, setStatus] = useState('La bestia de nueve vidas desciende sobre la calculadora.')

  onFinishRef.current = onFinish

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    if (!canvas || !c) return

    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-press').trim() || 'monospace'
    const audio = new CatAudio(() => mutedRef.current)
    const sprite = new Image()
    sprite.crossOrigin = 'anonymous'
    sprite.src = '/images/cat-knight.png'

    let W = window.innerWidth
    let H = window.innerHeight
    let L = layout(W, H)

    const G = {
      mode: 'enter' as Mode,
      t: 0,
      time: 0,
      fightT: 0,
      phase: 1,
      phaseBanner: 0,
      hp: MAX_HP,
      heart: { x: L.boxW / 2, y: L.boxH * 0.8 },
      spears: [] as Spear[],
      sweeps: [] as Sweep[],
      orbs: [] as Orb[],
      nextVolley: 1,
      nextSweep: 1.2,
      nextRing: 1.2,
      nextStream: 0,
      ringCount: 0,
      attack: 0,
      beam: 0,
      invuln: 0,
      shake: 0,
      flash: 0,
      finished: false,
      keys: new Set<string>(),
      drag: null as { px: number; py: number; hx: number; hy: number } | null,
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.imageSmoothingEnabled = false
      L = layout(W, H)
      G.heart.x = clamp(G.heart.x, 9, L.boxW - 9)
      G.heart.y = clamp(G.heart.y, 8, L.boxH - 8)
    }
    resize()

    const setMode = (mode: Mode) => {
      G.mode = mode
      G.t = 0
    }

    const triggerAttack = (strength = 1) => {
      G.attack = Math.max(G.attack, strength)
      G.beam = Math.max(G.beam, strength)
    }

    const setPhase = (phase: number) => {
      G.phase = phase
      G.phaseBanner = 1.8
      audio.setPhase(phase)
      audio.meow()
      triggerAttack(1)
      G.shake = 6
      if (phase === 3) {
        G.spears = []
        G.sweeps = []
        audio.plant()
        G.flash = 0.5
      }
      setStatus(`Fase ${phase}: ${PHASE_NAMES[phase].toLowerCase()}.`)
    }

    const startFight = () => {
      G.hp = MAX_HP
      G.fightT = 0
      G.spears = []
      G.sweeps = []
      G.orbs = []
      G.invuln = 0
      G.nextVolley = 1
      G.nextSweep = 1.2
      G.nextRing = 1.2
      G.nextStream = 0
      G.ringCount = 0
      G.heart = { x: L.boxW / 2, y: L.boxH * 0.8 }
      setMode('fight')
      audio.start()
      setPhase(1)
    }

    const die = () => {
      G.hp = 0
      G.shake = 8
      G.flash = 0.6
      audio.stop()
      sfx.play('gameover')
      setMode('dead')
      setStatus('La lanza celeste ha atravesado tu alma.')
      setDead(true)
    }

    const win = () => {
      G.spears = []
      G.sweeps = []
      G.orbs = []
      audio.stop()
      audio.plant()
      audio.victory()
      G.shake = 10
      G.flash = 0.6
      setMode('victory')
      setStatus('La lanza se clava en el suelo. El gato te saluda. Guardián felino superado.')
    }

    controlsRef.current = {
      retry: () => {
        setDead(false)
        sfx.play('equals')
        startFight()
      },
      exit: () => {
        audio.close()
        onFinishRef.current(false)
      },
    }

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

    const spawnVolley = (count: number) => {
      const lane = L.boxW / (count + 1)
      for (let i = 0; i < count; i++) {
        const x = clamp(lane * (i + 1) + (Math.random() - 0.5) * lane * 0.8, 10, L.boxW - 10)
        G.spears.push({ x, y: 0, vy: 280 + G.fightT * 4, len: 30, state: 'warn', t: 0 })
      }
      triggerAttack(0.7)
      audio.warn()
    }

    const spawnSweep = () => {
      const pool = G.fightT > 55 ? HARD_BAND_PATTERNS : BAND_PATTERNS
      const bands = pool[Math.floor(Math.random() * pool.length)]
      const warn = G.fightT > 60 ? 0.65 : 0.85
      G.sweeps.push({ bands, x: -L.boxW, state: 'warn', t: 0, warn })
      triggerAttack(1)
      audio.warn()
    }

    const spawnRing = () => {
      const cx = L.boxW / 2
      const cy = L.boxH * 0.42
      const count = 16
      const gapStart = Math.floor(Math.random() * count)
      const gapSize = 3
      const dir = G.ringCount % 2 === 0 ? 1 : -1
      const base = Math.random() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        if ((i - gapStart + count) % count < gapSize) continue
        G.orbs.push({ cx, cy, r: 8, th: base + (i / count) * Math.PI * 2, vr: 72 + G.ringCount * 0.8, w: dir * 0.9 })
      }
      G.ringCount++
      triggerAttack(0.8)
      audio.ring()
    }

    const updatePatterns = (dt: number) => {
      const t = G.fightT

      if (G.phase === 1) {
        G.nextVolley -= dt
        if (G.nextVolley <= 0) {
          spawnVolley(Math.min(5, 2 + Math.floor(t / 10)))
          G.nextVolley = Math.max(0.6, 1.25 - t * 0.018)
        }
      } else if (G.phase === 2) {
        G.nextSweep -= dt
        if (G.nextSweep <= 0) {
          spawnSweep()
          G.nextSweep = t > 60 ? 1.9 : 2.4
        }
        if (t > 55) {
          G.nextVolley -= dt
          if (G.nextVolley <= 0) {
            spawnVolley(2)
            G.nextVolley = 1.6
          }
        }
      } else {
        G.nextRing -= dt
        if (G.nextRing <= 0) {
          spawnRing()
          G.nextRing = Math.max(0.75, 1.15 - (t - PHASE3_AT) * 0.015)
        }
        if (t > 90) {
          G.nextStream -= dt
          if (G.nextStream <= 0) {
            G.nextStream = 0.16
            for (let arm = 0; arm < 2; arm++) {
              G.orbs.push({ cx: L.boxW / 2, cy: L.boxH * 0.42, r: 8, th: G.time * 2.2 + arm * Math.PI, vr: 95, w: 0.4 })
            }
          }
        }
      }

      G.spears = G.spears.filter((sp) => {
        sp.t += dt
        if (sp.state === 'warn' && sp.t >= 0.5) {
          sp.state = 'fall'
          sp.t = 0
          audio.spear()
        } else if (sp.state === 'fall') {
          sp.y += sp.vy * dt
          if (sp.y >= L.boxH - 2) {
            sp.y = L.boxH - 2
            sp.state = 'stuck'
            sp.t = 0
            audio.thud()
          }
        }
        return !(sp.state === 'stuck' && sp.t > 1.3)
      })

      G.sweeps = G.sweeps.filter((sw) => {
        sw.t += dt
        if (sw.state === 'warn' && sw.t >= sw.warn) {
          sw.state = 'go'
          sw.t = 0
          G.shake = 5
          audio.sweep()
        } else if (sw.state === 'go') {
          sw.x += ((L.boxW * 2.2) / 0.6) * dt
        }
        return sw.x < L.boxW * 1.3
      })

      const maxR = Math.hypot(L.boxW, L.boxH) + 20
      G.orbs = G.orbs.filter((o) => {
        o.r += o.vr * dt
        o.th += o.w * dt
        return o.r < maxR
      })
    }

    const heartHit = () => {
      const { x, y } = G.heart
      for (const sp of G.spears) {
        if (sp.state === 'warn') continue
        if (sp.state === 'stuck' && sp.t > 1.0) continue
        if (circleHitsRect(x, y, HIT_RADIUS, sp.x - 3, sp.y - sp.len, sp.x + 3, sp.y)) return true
      }
      for (const sw of G.sweeps) {
        if (sw.state !== 'go') continue
        const x0 = sw.x - L.boxW * 0.95
        for (const [a, b] of sw.bands) {
          if (circleHitsRect(x, y, HIT_RADIUS, x0, a * L.boxH, sw.x, b * L.boxH)) return true
        }
      }
      for (const o of G.orbs) {
        const ox = o.cx + Math.cos(o.th) * o.r
        const oy = o.cy + Math.sin(o.th) * o.r
        if (Math.hypot(x - ox, y - oy) < 4 + HIT_RADIUS) return true
      }
      return false
    }

    const updateFight = (dt: number) => {
      G.fightT += dt
      if (G.phase === 1 && G.fightT >= PHASE2_AT) setPhase(2)
      else if (G.phase === 2 && G.fightT >= PHASE3_AT) setPhase(3)
      if (G.fightT >= FIGHT_DURATION) {
        win()
        return
      }
      moveHeart(dt)
      updatePatterns(dt)
      if (G.invuln <= 0 && heartHit()) {
        G.hp = Math.max(0, G.hp - DAMAGE)
        G.invuln = IFRAMES
        G.shake = 6
        audio.hit()
        sfx.play('hit')
        if (G.hp <= 0) die()
      }
    }

    const update = (dt: number) => {
      G.t += dt
      if (G.mode !== 'dead') G.time += dt
      G.shake = Math.max(0, G.shake - dt * 20)
      G.flash = Math.max(0, G.flash - dt * 1.6)
      G.attack = Math.max(0, G.attack - dt * 2.2)
      G.beam = Math.max(0, G.beam - dt * 3)
      G.invuln = Math.max(0, G.invuln - dt)
      G.phaseBanner = Math.max(0, G.phaseBanner - dt)

      if (G.mode === 'enter') {
        if (G.t >= ENTER_DURATION) startFight()
      } else if (G.mode === 'fight') updateFight(dt)
      else if (G.mode === 'victory' && G.t >= 4.2 && !G.finished) {
        G.finished = true
        setLeaving(true)
        window.setTimeout(() => {
          audio.close()
          onFinishRef.current(true)
        }, 700)
      }
    }

    const drawBackground = () => {
      c.fillStyle = '#050608'
      c.fillRect(0, 0, W, H)
      c.strokeStyle = 'rgba(63, 245, 255, 0.06)'
      c.lineWidth = 1
      const offset = (G.time * 24) % 32
      for (let x = -32 + offset; x < W; x += 32) {
        c.beginPath()
        c.moveTo(Math.round(x) + 0.5, 0)
        c.lineTo(Math.round(x) + 0.5, H)
        c.stroke()
      }
      for (let y = offset; y < H; y += 32) {
        c.beginPath()
        c.moveTo(0, Math.round(y) + 0.5)
        c.lineTo(W, Math.round(y) + 0.5)
        c.stroke()
      }
      const glow = c.createRadialGradient(W / 2, L.spriteY + L.size * 0.55, 0, W / 2, L.spriteY + L.size * 0.55, L.size)
      glow.addColorStop(0, `rgba(232, 35, 43, ${0.18 + G.attack * 0.12})`)
      glow.addColorStop(1, 'rgba(232, 35, 43, 0)')
      c.fillStyle = glow
      c.fillRect(0, 0, W, H)
    }

    const drawCat = () => {
      if (!sprite.complete || sprite.naturalWidth === 0) return
      const s = L.size
      let x = L.spriteX
      let y = L.spriteY
      let tilt = 0
      let breath = (Math.sin(G.time * 2.6) * 0.5 + 0.5) * Math.max(2, s * 0.012)
      let alpha = 1

      if (G.mode === 'enter') {
        const e = easeOut(clamp(G.t / 1.1, 0, 1))
        y = -s + (L.spriteY + s) * e
        alpha = e
      }
      if (G.mode === 'fight' || G.mode === 'dead') {
        y += G.attack * s * 0.05
        tilt = G.attack * 0.05
      }
      if (G.mode === 'victory') {
        const plant = clamp(G.t / 0.35, 0, 1)
        y += Math.sin(plant * Math.PI) * s * 0.06
        if (G.t > 1) {
          const salute = Math.sin((G.t - 1) * 5) * clamp((G.t - 1) * 2, 0, 1)
          tilt = salute * 0.06
          breath = Math.max(0, salute) * s * 0.03
        }
      }

      const iw = sprite.naturalWidth
      const ih = sprite.naturalHeight
      const split = 0.46
      c.save()
      c.globalAlpha = alpha
      c.translate(Math.round(x + s / 2), Math.round(y + s))
      c.rotate(tilt)
      c.translate(-s / 2, -s)
      c.drawImage(sprite, 0, ih * split, iw, ih * (1 - split), 0, Math.round(s * split), s, Math.round(s * (1 - split)))
      c.drawImage(sprite, 0, 0, iw, ih * (split + 0.05), 0, -Math.round(breath), s, Math.round(s * (split + 0.05)))

      const flicker = 0.55 + 0.45 * Math.abs(Math.sin(G.time * 7)) + G.attack * 0.6
      const tipX = SPEAR_TIP.x * s
      const tipY = SPEAR_TIP.y * s - breath
      c.globalCompositeOperation = 'lighter'
      const glow = c.createRadialGradient(tipX, tipY, 0, tipX, tipY, s * 0.16)
      glow.addColorStop(0, `rgba(160, 255, 255, ${0.55 * flicker})`)
      glow.addColorStop(0.4, `rgba(63, 245, 255, ${0.3 * flicker})`)
      glow.addColorStop(1, 'rgba(63, 245, 255, 0)')
      c.fillStyle = glow
      c.fillRect(tipX - s * 0.16, tipY - s * 0.16, s * 0.32, s * 0.32)
      c.restore()

      if (G.beam > 0.05 && G.mode === 'fight') {
        const bx = x + SPEAR_TIP.x * s
        const top = y + s * 0.92
        c.save()
        c.globalCompositeOperation = 'lighter'
        c.fillStyle = `rgba(63, 245, 255, ${G.beam * 0.55})`
        const w = Math.max(2, Math.round(6 * G.beam))
        c.fillRect(Math.round(bx - w / 2), Math.round(top), w, Math.max(0, L.boxY - top))
        c.fillStyle = `rgba(255, 255, 255, ${G.beam * 0.8})`
        c.fillRect(Math.round(bx - 1), Math.round(top), 2, Math.max(0, L.boxY - top))
        c.restore()
      }

      if (G.mode === 'victory' && G.t > 1.1) {
        const text = '¡MIAU! Bien luchado.'
        const size = Math.max(8, Math.min(11, Math.floor(W / 60)))
        c.font = `${size}px ${font}`
        const tw = c.measureText(text).width
        const bx = Math.round(clamp(x + s * 0.08 - tw, 8, W - tw - 28))
        const by = Math.round(y + s * 0.05)
        c.globalAlpha = clamp((G.t - 1.1) * 3, 0, 1)
        c.fillStyle = '#ffffff'
        c.fillRect(bx, by, tw + 20, size + 16)
        c.fillRect(bx + tw + 8, by + size + 16, 8, 6)
        c.fillStyle = '#000000'
        c.textAlign = 'left'
        c.textBaseline = 'middle'
        c.fillText(text, bx + 10, by + (size + 16) / 2 + 1)
        c.globalAlpha = 1
      }
    }

    const drawGiantSpear = (sw: Sweep, a: number, b: number) => {
      const y0 = a * L.boxH
      const y1 = b * L.boxH
      const h = y1 - y0
      const mid = (y0 + y1) / 2
      const tipLen = Math.min(h * 1.1, 80)
      const tail = sw.x - L.boxW * 0.95
      c.fillStyle = 'rgba(63, 245, 255, 0.22)'
      c.fillRect(Math.round(tail), Math.round(y0), Math.round(sw.x - tail), Math.round(h))
      c.fillStyle = 'rgba(255, 255, 255, 0.25)'
      for (let i = 0; i < 5; i++) {
        const ly = Math.round(y0 + (h * (i + 0.5)) / 5)
        c.fillRect(Math.round(tail + ((i * 37) % 60)), ly, Math.round(sw.x - tail - tipLen - 20), 1)
      }
      const shaftH = Math.max(6, Math.round(h * 0.22))
      c.fillStyle = CYAN_DEEP
      c.fillRect(Math.round(tail), Math.round(mid - shaftH / 2), Math.round(sw.x - tipLen - tail), shaftH)
      c.fillStyle = CYAN
      c.fillRect(Math.round(tail), Math.round(mid - shaftH / 2), Math.round(sw.x - tipLen - tail), 2)
      c.beginPath()
      c.moveTo(Math.round(sw.x), Math.round(mid))
      c.lineTo(Math.round(sw.x - tipLen), Math.round(y0 + 2))
      c.lineTo(Math.round(sw.x - tipLen), Math.round(y1 - 2))
      c.closePath()
      c.fill()
      c.fillStyle = '#ffffff'
      c.fillRect(Math.round(sw.x - tipLen * 0.7), Math.round(mid - 2), Math.round(tipLen * 0.4), 4)
    }

    const drawBox = () => {
      const open = G.mode === 'enter' ? easeOut(clamp((G.t - 0.9) / 0.6, 0, 1)) : 1
      if (open <= 0) return
      c.save()
      c.translate(L.boxX + L.boxW / 2, L.boxY + L.boxH / 2)
      c.scale(open, open)
      c.translate(-L.boxW / 2, -L.boxH / 2)
      c.fillStyle = '#000'
      c.fillRect(0, 0, L.boxW, L.boxH)
      c.save()
      c.beginPath()
      c.rect(0, 0, L.boxW, L.boxH)
      c.clip()

      for (const sw of G.sweeps) {
        if (sw.state === 'warn') {
          const blink = Math.abs(Math.sin(sw.t * 18))
          for (const [a, b] of sw.bands) {
            c.fillStyle = `rgba(232, 35, 43, ${0.15 + blink * 0.25})`
            c.fillRect(0, Math.round(a * L.boxH), L.boxW, Math.round((b - a) * L.boxH))
            c.fillStyle = `rgba(255, 255, 255, ${0.5 + blink * 0.5})`
            c.font = `10px ${font}`
            c.textAlign = 'left'
            c.textBaseline = 'middle'
            c.fillText('>>>', 6, Math.round(((a + b) / 2) * L.boxH))
          }
        } else {
          for (const [a, b] of sw.bands) drawGiantSpear(sw, a, b)
        }
      }

      for (const sp of G.spears) {
        if (sp.state === 'warn') {
          const blink = Math.abs(Math.sin(sp.t * 20))
          c.fillStyle = `rgba(63, 245, 255, ${0.08 + blink * 0.1})`
          c.fillRect(Math.round(sp.x - 3), 0, 6, L.boxH)
          c.fillStyle = `rgba(63, 245, 255, ${0.5 + blink * 0.5})`
          c.beginPath()
          c.moveTo(sp.x, 10)
          c.lineTo(sp.x - 5, 2)
          c.lineTo(sp.x + 5, 2)
          c.closePath()
          c.fill()
        } else {
          const alpha = sp.state === 'stuck' && sp.t > 1.0 ? clamp(1 - (sp.t - 1.0) / 0.3, 0, 1) : 1
          drawSmallSpear(c, sp.x, sp.y, sp.len, alpha)
          if (sp.state === 'stuck' && sp.t < 0.2) {
            c.fillStyle = `rgba(255, 255, 255, ${1 - sp.t / 0.2})`
            c.fillRect(Math.round(sp.x - 8), L.boxH - 3, 16, 2)
          }
        }
      }

      if (G.phase === 3 && G.mode === 'fight') {
        const cx = L.boxW / 2
        const cy = L.boxH * 0.42
        const pulse = 0.5 + 0.5 * Math.sin(G.time * 10)
        c.strokeStyle = `rgba(63, 245, 255, ${0.35 + pulse * 0.4})`
        c.lineWidth = 2
        c.beginPath()
        c.arc(cx, cy, 6 + pulse * 4, 0, Math.PI * 2)
        c.stroke()
      }

      for (const o of G.orbs) {
        const ox = Math.round(o.cx + Math.cos(o.th) * o.r)
        const oy = Math.round(o.cy + Math.sin(o.th) * o.r)
        c.fillStyle = CYAN
        c.fillRect(ox - 4, oy - 2, 8, 4)
        c.fillRect(ox - 2, oy - 4, 4, 8)
        c.fillStyle = '#ffffff'
        c.fillRect(ox - 1, oy - 1, 2, 2)
      }

      if (G.phaseBanner > 0 && G.mode === 'fight') {
        c.globalAlpha = clamp(G.phaseBanner, 0, 1)
        c.font = `10px ${font}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillStyle = CYAN
        c.fillText(`FASE ${G.phase} · ${PHASE_NAMES[G.phase]}`, L.boxW / 2, 16)
        c.globalAlpha = 1
      }

      const blink = G.invuln > 0 ? Math.sin(G.time * 40) > 0 : true
      if (blink && G.mode !== 'victory') drawHeart(c, G.heart.x, G.heart.y, 2, '#ff1f3d')
      c.restore()
      c.strokeStyle = '#ffffff'
      c.lineWidth = 3
      c.strokeRect(-1.5, -1.5, L.boxW + 3, L.boxH + 3)
      c.restore()
    }

    const drawHud = () => {
      if (G.mode === 'enter' && G.t < 1) return
      const title = 'GUARDIÁN FELINO · 9 VIDAS'
      const size = Math.max(8, Math.min(12, Math.floor(W / 50)))
      c.font = `${size}px ${font}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = '#6b0a0e'
      c.fillText(title, W / 2 + 2, L.boxY - 20 + 2)
      c.fillStyle = '#ffffff'
      c.fillText(title, W / 2, L.boxY - 20)

      const y = L.boxY + L.boxH + 28
      const barW = Math.min(110, L.boxW * 0.28)
      const left = L.boxX
      c.font = `9px ${font}`
      c.textAlign = 'left'
      c.fillStyle = '#ffffff'
      c.fillText('HP', left, y)
      c.fillStyle = '#b3001e'
      c.fillRect(left + 28, y - 7, barW, 14)
      c.fillStyle = '#ffff00'
      c.fillRect(left + 28, y - 7, (barW * G.hp) / MAX_HP, 14)
      c.fillStyle = '#ffffff'
      c.fillText(`${G.hp}/${MAX_HP}`, left + 36 + barW, y)

      const remaining = Math.max(0, Math.ceil(FIGHT_DURATION - G.fightT))
      const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
      c.textAlign = 'right'
      c.fillStyle = CYAN
      c.fillText(`FASE ${G.phase}/3 · AGUANTA ${clock}`, L.boxX + L.boxW, y)

      const progress = clamp(G.fightT / FIGHT_DURATION, 0, 1)
      const py = y + 18
      c.fillStyle = '#1a1d22'
      c.fillRect(L.boxX, py, L.boxW, 4)
      c.fillStyle = RED
      c.fillRect(L.boxX, py, L.boxW * progress, 4)
      c.fillStyle = '#ffffff'
      for (const mark of [PHASE2_AT, PHASE3_AT]) c.fillRect(Math.round(L.boxX + (L.boxW * mark) / FIGHT_DURATION), py - 2, 2, 8)
    }

    const draw = () => {
      c.save()
      if (G.shake > 0) c.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake)
      drawBackground()
      drawCat()
      drawBox()
      drawHud()
      c.restore()
      if (G.flash > 0) {
        c.fillStyle = `rgba(200, 255, 255, ${G.flash * 0.6})`
        c.fillRect(0, 0, W, H)
      }
    }

    audio.meow()
    sfx.play('crack')

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
      aria-label="Modo 999: combate contra el Guardián Felino"
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none [image-rendering:pixelated]" />
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/75">
          <p className="font-pixel text-2xl text-[#3ff5ff] sm:text-4xl">GAME OVER</p>
          <p className="max-w-[90vw] text-center font-pixel text-[9px] leading-relaxed text-white/80 sm:text-[10px]">
            {'* Al gato le quedan 8 vidas... a ti solo te queda la determinación.'}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => controlsRef.current?.retry()}
              className="border-2 border-white px-4 py-3 font-pixel text-[10px] text-white transition-colors hover:border-[#3ff5ff] hover:text-[#3ff5ff] focus-visible:outline-2 focus-visible:outline-[#3ff5ff]"
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
