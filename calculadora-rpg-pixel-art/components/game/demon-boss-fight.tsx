'use client'

import { useEffect, useRef, useState } from 'react'
import { sfx } from '@/lib/game/audio'
import { MAX_HP } from '@/lib/game/engine'
import { DENSITY, MIN_WARN } from '@/lib/game/types'
import { DemonAudio } from '@/lib/game/demon-audio'

type Mode = 'intro' | 'doom' | 'freeze' | 'refused' | 'fight' | 'dead' | 'ashes'

type Bullet =
  | { kind: 'num'; x: number; y: number; vx: number; vy: number; ch: string; color: string }
  | { kind: 'bone'; x: number; y: number; w: number; h: number; vx: number }
  | { kind: 'blast'; x: number; y: number; ang: number; t: number; charge: number; fire: number; w: number; fired: boolean }

type Ash = { x: number; y: number; vx: number; vy: number; size: number; r: number; g: number; b: number; delay: number }
type SpritePixel = { u: number; v: number; r: number; g: number; b: number }

type GameState = {
  mode: Mode
  t: number
  time: number
  hp: number
  heart: { x: number; y: number }
  bullets: Bullet[]
  timers: { num: number; bone: number; blast: number; wall: number }
  boneDir: number
  invuln: number
  shake: number
  flash: number
  broke: boolean
  snapped: boolean
  typed: number
  fightT: number
  fightDur: number
  audioFailed: boolean
  ashes: Ash[]
  finished: boolean
  keys: Set<string>
  drag: { px: number; py: number; hx: number; hy: number } | null
}

const TITLE = 'PHASE 3: MEPHISTOPHELES_CALC_0.1'
const REFUSED = 'But it refused.'
const FALLBACK_DURATION = 100
const HEART_SPEED = 150
// Sprite is 9px wide; the hitbox is 30% smaller than its visual radius.
const HIT_RADIUS = 4.5 * 0.7
const SAFE_GAP = 9 * 1.5
const HEART = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']
const HEART_SPLIT = [4, 3, 4, 3, 4, 3, 4, 4]
const GLYPHS = '0123456789+−×÷=π∞√'
const RUNES = 'ᚱᛟᚦᚨᛉᛊᚷᛗ∑∫√π∞÷×±≠Ω6'
const SEAL = { u0: 0.35, u1: 0.66, v0: 0.635 }
const DISPLAY = { u0: 0.38, u1: 0.62, v0: 0.36, v1: 0.63 }
const AURAS = [
  { u: 0.2, v: 0.66, r: 0.2, a: 0.4 },
  { u: 0.8, v: 0.66, r: 0.2, a: 0.4 },
  { u: 0.3, v: 0.12, r: 0.15, a: 0.28 },
  { u: 0.7, v: 0.12, r: 0.15, a: 0.28 },
  { u: 0.5, v: 0.82, r: 0.24, a: 0.45 },
]

function layout(W: number, H: number) {
  const boxW = Math.min(500, W * 0.86)
  const boxH = Math.min(250, Math.max(175, H * 0.3))
  const boxX = (W - boxW) / 2
  const boxY = H - boxH - 92
  // Keep the boss above the play area so the sprite never covers the soul arena.
  const bossW = Math.min(300, W * 0.52)
  const bossH = bossW * 0.44
  const bossX = (W - bossW) / 2
  const bossY = Math.max(54, boxY - bossH - 42)
  return { boxW, boxH, boxX, boxY, bossW, bossH, bossX, bossY }
}

function drawHeart(c: CanvasRenderingContext2D, cx: number, cy: number, p: number, color: string, part: 'full' | 'left' | 'right' = 'full') {
  const ox = Math.round(cx - 4.5 * p)
  const oy = Math.round(cy - 4 * p)
  c.fillStyle = color
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'X') continue
      if (part === 'left' && x > HEART_SPLIT[y]) continue
      if (part === 'right' && x <= HEART_SPLIT[y]) continue
      c.fillRect(ox + x * p, oy + y * p, p, p)
    }
  })
}

function prepareSprite(img: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const c = canvas.getContext('2d', { willReadFrequently: true })
  if (!c) return { canvas, seal: null, pixels: [] as SpritePixel[] }
  c.drawImage(img, 0, 0)
  const { width: w, height: h } = canvas
  const data = c.getImageData(0, 0, w, h)
  const d = data.data
  const isBackground = (i: number) => {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    return d[i + 3] < 10 || (r > 222 && g > 222 && b > 222 && spread < 30) || (r < 16 && g < 16 && b < 16)
  }
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const p = stack.pop() as number
    if (seen[p]) continue
    seen[p] = 1
    if (!isBackground(p * 4)) continue
    d[p * 4 + 3] = 0
    const x = p % w
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (p >= w) stack.push(p - w)
    if (p < w * (h - 1)) stack.push(p + w)
  }
  // White pockets enclosed by horns/arms are unreachable from the edges; only the 666 display keeps pure white.
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const u = (p % w) / w
    const v = Math.floor(p / w) / h
    if (u > DISPLAY.u0 && u < DISPLAY.u1 && v > DISPLAY.v0 && v < DISPLAY.v1) continue
    const r = d[i], g = d[i + 1], b = d[i + 2]
    if (Math.min(r, g, b) > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 25) d[i + 3] = 0
  }

  // Light anti-aliasing fringe left by the white source background would read as a white outline on black.
  for (let pass = 0; pass < 2; pass++) {
    const clear: number[] = []
    for (let p = 0; p < w * h; p++) {
      const i = p * 4
      if (d[i + 3] === 0) continue
      const r = d[i], g = d[i + 1], b = d[i + 2]
      if (Math.min(r, g, b) < 170 || Math.max(r, g, b) - Math.min(r, g, b) > 40) continue
      const x = p % w
      const nearClear =
        (x > 0 && d[i - 1] === 0) || (x < w - 1 && d[i + 7] === 0) || (p >= w && d[i - w * 4 + 3] === 0) || (p < w * (h - 1) && d[i + w * 4 + 3] === 0)
      if (nearClear) clear.push(i)
    }
    clear.forEach((i) => (d[i + 3] = 0))
  }

  // The summoning seal is baked onto white; unmix white into alpha so only its red light remains.
  const seal = document.createElement('canvas')
  seal.width = w
  seal.height = h
  const sc = seal.getContext('2d')
  const sealData = sc ? sc.createImageData(w, h) : null
  const x0 = Math.floor(w * SEAL.u0), x1 = Math.ceil(w * SEAL.u1), y0 = Math.floor(h * SEAL.v0)
  for (let y = y0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      const r = d[i], g = d[i + 1], b = d[i + 2]
      const isSealTone = r >= g - 10 && Math.abs(g - b) < 50 && r > 60
      if (!isSealTone) continue
      d[i + 3] = 0
      if (!sealData) continue
      const a = Math.max(255 - r, 255 - g, 255 - b) / 255
      if (a < 0.03) continue
      const unmix = (v: number) => Math.max(0, Math.min(255, Math.round((v - 255 * (1 - a)) / a)))
      const s = sealData.data
      s[i] = unmix(r)
      s[i + 1] = unmix(g)
      s[i + 2] = unmix(b)
      s[i + 3] = Math.round(a * 255)
    }
  }
  if (sc && sealData) sc.putImageData(sealData, 0, 0)
  c.putImageData(data, 0, 0)

  const step = Math.max(4, Math.floor(w / 150))
  const pixels: SpritePixel[] = []
  const sd = sealData?.data
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (d[i + 3] >= 128) pixels.push({ u: x / w, v: y / h, r: d[i], g: d[i + 1], b: d[i + 2] })
      else if (sd && sd[i + 3] >= 128) pixels.push({ u: x / w, v: y / h, r: sd[i], g: sd[i + 1], b: sd[i + 2] })
    }
  }
  return { canvas, seal, pixels }
}

export function DemonBossFight({ muted, onFinish }: { muted: boolean; onFinish: (won: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phase4StartedRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mutedRef = useRef(muted)
  const onFinishRef = useRef(onFinish)
  const controlsRef = useRef<{ retry: () => void; exit: () => void } | null>(null)
  const [dead, setDead] = useState(false)
  const [status, setStatus] = useState('Un jefe demoníaco aparece.')

  onFinishRef.current = onFinish

  useEffect(() => {
    mutedRef.current = muted
    if (audioRef.current) audioRef.current.volume = muted ? 0 : 0.55
  }, [muted])

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    if (!canvas || !c) return

    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-press').trim() || 'monospace'
    const demonAudio = new DemonAudio(() => mutedRef.current)
    const runes = Array.from({ length: 48 }, () => ({
      x: Math.random(),
      y: Math.random(),
      ch: RUNES[Math.floor(Math.random() * RUNES.length)],
      size: 10 + Math.random() * 10,
      speed: 4 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
    }))

    let sprite: HTMLCanvasElement | null = null
    let sealSprite: HTMLCanvasElement | null = null
    let spritePixels: SpritePixel[] = []
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const prepared = prepareSprite(img)
      sprite = prepared.canvas
      sealSprite = prepared.seal
      spritePixels = prepared.pixels
    }
    img.src = '/images/demon-calc-boss.png'

    let W = window.innerWidth
    let H = window.innerHeight
    let L = layout(W, H)
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
      G.heart.x = Math.min(Math.max(G.heart.x, 9), L.boxW - 9)
      G.heart.y = Math.min(Math.max(G.heart.y, 8), L.boxH - 8)
    }

    const G: GameState = {
      mode: 'intro',
      t: 0,
      time: 0,
      hp: MAX_HP,
      heart: { x: L.boxW / 2, y: L.boxH / 2 },
      bullets: [],
      timers: { num: 0, bone: 0, blast: 0, wall: 0 },
      boneDir: 1,
      invuln: 0,
      shake: 0,
      flash: 0,
      broke: false,
      snapped: false,
      typed: 0,
      fightT: 0,
      fightDur: FALLBACK_DURATION,
      audioFailed: false,
      ashes: [],
      finished: false,
      keys: new Set(),
      drag: null,
    }
    resize()

    const setMode = (mode: Mode) => {
      G.mode = mode
      G.t = 0
    }

    const startMusic = () => {
      if (phase4StartedRef.current) return
      phase4StartedRef.current = true
      const audio = new Audio('/music/phase4.mp3')
      audioRef.current = audio
      audio.loop = false
      audio.volume = mutedRef.current ? 0 : 0.55
      const syncDuration = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) G.fightDur = audio.duration
      }
      audio.addEventListener('loadedmetadata', syncDuration)
      audio.onended = () => startAshes()
      audio.onerror = () => {
        G.audioFailed = true
      }
      syncDuration()
      void audio.play().catch(() => {
        G.audioFailed = true
      })
    }

    const startAshes = () => {
      if (G.mode !== 'fight') return
      G.bullets = []
      G.ashes = spritePixels.map((p) => ({
        x: L.bossX + p.u * L.bossW,
        y: L.bossY + p.v * L.bossH,
        vx: (Math.random() - 0.5) * 40,
        vy: -(15 + Math.random() * 45),
        size: Math.max(2, Math.ceil((L.bossW / 150) * 1.1)),
        r: p.r,
        g: p.g,
        b: p.b,
        delay: p.v * 1.4 + Math.random() * 0.35,
      }))
      G.shake = 10
      G.flash = 1
      demonAudio.thud()
      sfx.play('victory')
      setStatus('El jefe se disuelve en cenizas. ¡Victoria!')
      setMode('ashes')
    }

    const die = () => {
      G.hp = 0
      G.shake = 8
      G.flash = 0.8
      audioRef.current?.pause()
      demonAudio.stopAll()
      demonAudio.thud()
      sfx.play('hit')
      setMode('dead')
      setStatus('Tu alma ha caído.')
      setDead(true)
    }

    controlsRef.current = {
      retry: () => {
        G.bullets = []
        G.hp = 1
        G.fightT = 0
        G.invuln = 1.5
        G.timers = { num: 0, bone: 0, blast: 0, wall: 0 }
        G.heart = { x: L.boxW / 2, y: L.boxH / 2 }
        setMode('fight')
        setDead(false)
        setStatus('Lucha hasta que la música termine.')
        const audio = audioRef.current
        if (audio) {
          audio.currentTime = 0
          void audio.play().catch(() => {
            G.audioFailed = true
          })
        }
        sfx.play('equals')
      },
      exit: () => {
        audioRef.current?.pause()
        demonAudio.stopAll()
        onFinishRef.current(false)
      },
    }

    let safeLane = 0.5
    const spawnFight = (dt: number) => {
      const progress = Math.min(1, G.fightT / G.fightDur)
      const k = 1 + progress * 1.1
      if (G.fightT < 1.5) return
      const pattern = ['matrix', 'bones', 'blasters', 'mix'][Math.floor((G.fightT - 1.5) / 8) % 4]
      const T = G.timers
      T.num -= dt
      T.bone -= dt
      T.blast -= dt
      if ((pattern === 'matrix' || pattern === 'mix') && T.num <= 0) {
        T.num = (pattern === 'mix' ? 0.42 : 0.22) / k / DENSITY
        // A drifting column stays free of falling glyphs (glyph radius 6 on each side of the gap).
        safeLane = Math.min(0.85, Math.max(0.15, safeLane + (Math.random() - 0.5) * 0.08))
        const laneHalf = SAFE_GAP / 2 + 6 + 12
        const laneX = safeLane * L.boxW
        const count = Math.random() < 0.3 ? 2 : 1
        for (let i = 0; i < count; i++) {
          let x = 8 + Math.random() * (L.boxW - 16 - laneHalf * 2)
          if (x > laneX - laneHalf) x += laneHalf * 2
          G.bullets.push({
            kind: 'num',
            x,
            y: -10,
            vx: 0,
            vy: (70 + Math.random() * 60) * k,
            ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            color: Math.random() < 0.7 ? '#ff3b4a' : '#ffffff',
          })
        }
      }
      if (pattern === 'bones' && T.bone <= 0) {
        T.bone = 1.5 / k / DENSITY
        const gap = Math.max(40, SAFE_GAP + 8, 52 - progress * 12)
        const gapY = gap / 2 + 8 + Math.random() * (L.boxH - gap - 16)
        const dir = G.boneDir
        G.boneDir *= -1
        const x = dir > 0 ? -14 : L.boxW + 14
        const vx = dir * 120 * k
        G.bullets.push({ kind: 'bone', x, y: 0, w: 12, h: gapY - gap / 2, vx })
        G.bullets.push({ kind: 'bone', x, y: gapY + gap / 2, w: 12, h: L.boxH - gapY - gap / 2, vx })
      }
      if ((pattern === 'blasters' || pattern === 'mix') && T.blast <= 0) {
        T.blast = (pattern === 'mix' ? 1.7 : 1.1) / k / DENSITY
        const side = Math.floor(Math.random() * 4)
        const x = side === 2 ? 12 : side === 3 ? L.boxW - 12 : Math.random() * L.boxW
        const y = side === 0 ? 12 : side === 1 ? L.boxH - 12 : Math.random() * L.boxH
        const ang = Math.atan2(G.heart.y - y, G.heart.x - x)
        G.bullets.push({ kind: 'blast', x, y, ang, t: 0, charge: Math.max(MIN_WARN, 0.75), fire: 0.42, w: 22, fired: false })
        sfx.play('warn')
      }
    }

    const beamWidth = (b: Extract<Bullet, { kind: 'blast' }>) => {
      const ft = b.t - b.charge
      if (ft < 0) return 0
      if (ft < 0.08) return (b.w * ft) / 0.08
      const tail = ft - (b.fire - 0.12)
      return tail > 0 ? b.w * Math.max(0, 1 - tail / 0.12) : b.w
    }

    const updateBullets = (dt: number) => {
      const hx = G.heart.x
      const hy = G.heart.y
      let hit = false
      G.bullets = G.bullets.filter((b) => {
        if (b.kind === 'num') {
          b.x += b.vx * dt
          b.y += b.vy * dt
          if (Math.hypot(b.x - hx, b.y - hy) < 6 + HIT_RADIUS) hit = true
          return b.y < L.boxH + 20
        }
        if (b.kind === 'bone') {
          b.x += b.vx * dt
          const cx = Math.max(b.x - b.w / 2, Math.min(hx, b.x + b.w / 2))
          const cy = Math.max(b.y, Math.min(hy, b.y + b.h))
          if (Math.hypot(cx - hx, cy - hy) < HIT_RADIUS) hit = true
          return b.x > -40 && b.x < L.boxW + 40
        }
        b.t += dt
        if (!b.fired && b.t >= b.charge) {
          b.fired = true
          G.shake = Math.max(G.shake, 3)
          sfx.play('beam')
        }
        const width = beamWidth(b)
        if (width > 4) {
          const dx = hx - b.x
          const dy = hy - b.y
          const along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang)
          const perp = Math.abs(-dx * Math.sin(b.ang) + dy * Math.cos(b.ang))
          if (along > 0 && perp < width * 0.4 + HIT_RADIUS) hit = true
        }
        return b.t < b.charge + b.fire
      })
      return hit
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
      G.heart.x = Math.min(Math.max(G.heart.x + (dx / len) * HEART_SPEED * dt, 9), L.boxW - 9)
      G.heart.y = Math.min(Math.max(G.heart.y + (dy / len) * HEART_SPEED * dt, 8), L.boxH - 8)
    }

    const update = (dt: number) => {
      if (G.mode !== 'freeze' && G.mode !== 'dead') G.time += dt
      G.t += dt
      G.shake = Math.max(0, G.shake - dt * 20)
      G.flash = Math.max(0, G.flash - dt * 2.5)
      G.invuln = Math.max(0, G.invuln - dt)

      if (G.mode === 'doom' || G.mode === 'fight') moveHeart(dt)

      switch (G.mode) {
        case 'intro':
          if (G.t >= 1) {
            setMode('doom')
            sfx.play('warn')
            setStatus('El jefe lanza un ataque imposible de esquivar.')
          }
          break
        case 'doom': {
          if (G.t >= 0.8) {
            if (!demonAudio.rumbling) {
              demonAudio.startRumble()
              sfx.play('beam')
            }
            G.timers.wall -= dt
            if (G.timers.wall <= 0) {
              G.timers.wall = 0.03
              G.bullets.push({
                kind: 'num',
                x: Math.random() * L.boxW,
                y: -10,
                vx: 0,
                vy: 260 + Math.random() * 80,
                ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
                color: Math.random() < 0.6 ? '#ff3b4a' : '#ffffff',
              })
            }
            G.bullets.forEach((b) => {
              if (b.kind === 'num') b.y += b.vy * dt
            })
            G.bullets = G.bullets.filter((b) => b.kind !== 'num' || b.y < L.boxH + 20)
            G.hp = Math.max(0, Math.round(MAX_HP * (1 - Math.min(1, (G.t - 0.8) / 2.2))))
            G.shake = Math.max(G.shake, 4)
          }
          if (G.t >= 3) {
            G.hp = 0
            demonAudio.stopAll()
            setMode('freeze')
          }
          break
        }
        case 'freeze':
          if (G.t >= 0.5) {
            G.bullets = []
            setMode('refused')
            setStatus(REFUSED)
          }
          break
        case 'refused': {
          const r = G.t
          if (r >= 0.5 && !G.broke) {
            G.broke = true
            demonAudio.thud()
          }
          const typed = Math.max(0, Math.min(REFUSED.length, Math.floor((r - 1.1) / 0.075)))
          if (typed > G.typed) {
            G.typed = typed
            if (REFUSED[typed - 1] !== ' ') sfx.play('type')
          }
          if (r >= 4 && !G.snapped) {
            G.snapped = true
            G.shake = 14
            G.hp = 1
            demonAudio.bassDrop()
            startMusic()
          }
          if (r >= 5.4) {
            G.heart = { x: L.boxW / 2, y: L.boxH / 2 }
            G.fightT = 0
            G.invuln = 1.5
            setMode('fight')
            setStatus('Lucha hasta que la música termine.')
          }
          break
        }
        case 'fight': {
          G.fightT += dt
          spawnFight(dt)
          const hit = updateBullets(dt)
          if (hit && G.invuln <= 0) die()
          const timerDone = G.audioFailed ? G.fightT >= G.fightDur : G.fightT >= G.fightDur + 3
          if (G.mode === 'fight' && timerDone) startAshes()
          break
        }
        case 'ashes':
          G.ashes.forEach((a) => {
            if (G.t < a.delay) return
            a.x += a.vx * dt
            a.y += a.vy * dt
            a.vy -= 10 * dt
          })
          if (G.t >= 5.5 && !G.finished) {
            G.finished = true
            onFinishRef.current(true)
          }
          break
      }
    }

    const drawBackground = () => {
      c.fillStyle = '#000'
      c.fillRect(0, 0, W, H)
      c.strokeStyle = 'rgba(120, 10, 20, 0.25)'
      c.lineWidth = 1
      c.beginPath()
      for (let x = 0; x < W; x += 32) {
        c.moveTo(x + 0.5, 0)
        c.lineTo(x + 0.5, H)
      }
      for (let y = 0; y < H; y += 32) {
        c.moveTo(0, y + 0.5)
        c.lineTo(W, y + 0.5)
      }
      c.stroke()
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      runes.forEach((r) => {
        const y = (((r.y * H - G.time * r.speed) % H) + H) % H
        c.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(G.time * 2 + r.phase))
        c.fillStyle = '#ff2a3a'
        c.font = `${Math.round(r.size)}px monospace`
        c.fillText(r.ch, r.x * W, y)
      })
      c.globalAlpha = 1
    }

    const drawFrame = () => {
      c.save()
      c.shadowColor = '#ff2a3a'
      c.shadowBlur = 14
      c.strokeStyle = '#ff2a3a'
      c.lineWidth = 3
      c.strokeRect(10, 10, W - 20, H - 20)
      c.shadowBlur = 0
      c.lineWidth = 1
      c.strokeStyle = '#ff8a94'
      c.strokeRect(17.5, 17.5, W - 35, H - 35)
      c.restore()
    }

    const drawBoss = () => {
      if (!sprite || G.mode === 'ashes') return
      const appear = G.mode === 'intro' ? Math.min(1, G.t) : 1
      const bob = Math.round(Math.sin(G.time * 2) * 3)
      const scale = 0.85 + 0.15 * appear
      const w = L.bossW * scale
      const h = L.bossH * scale
      const x = L.bossX + (L.bossW - w) / 2
      const y = L.bossY + (L.bossH - h) / 2 + bob
      const pulse = 0.5 + 0.5 * Math.sin(G.time * 3)
      const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h)
      c.save()
      c.globalCompositeOperation = 'screen'
      AURAS.forEach((aura) => {
        const ax = x + aura.u * w
        const ay = y + aura.v * h
        const radius = aura.r * w
        const strength = aura.a * appear * (0.75 + 0.25 * pulse)
        const glow = c.createRadialGradient(ax, ay, 0, ax, ay, radius)
        glow.addColorStop(0, `rgba(170, 12, 20, ${strength})`)
        glow.addColorStop(0.45, `rgba(90, 0, 8, ${strength * 0.5})`)
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
        c.fillStyle = glow
        c.fillRect(ax - radius, ay - radius, radius * 2, radius * 2)
      })
      c.restore()
      c.imageSmoothingEnabled = false
      if (sealSprite) {
        c.save()
        c.globalCompositeOperation = 'screen'
        c.globalAlpha = appear * (0.8 + 0.2 * pulse)
        c.shadowColor = 'rgba(255, 30, 40, 0.9)'
        c.shadowBlur = 10 + pulse * 10
        c.drawImage(sealSprite, rx, ry, rw, rh)
        c.restore()
      }
      c.globalAlpha = appear
      c.drawImage(sprite, rx, ry, rw, rh)
      c.globalAlpha = 1
    }

    const drawTitle = () => {
      const size = Math.max(9, Math.min(14, Math.floor(W / 48)))
      const y = L.boxY - 18
      c.font = `${size}px ${font}`
      c.textBaseline = 'middle'
      c.textAlign = 'left'
      c.fillStyle = '#fff'
      c.fillText('EL CONDUCTOR', L.boxX, y)
      c.textAlign = 'right'
      c.fillStyle = '#ffd23f'
      c.fillText('FASE 1/2', L.boxX + L.boxW, y)
      c.textAlign = 'center'
      c.font = `${Math.max(7, size - 2)}px ${font}`
      c.fillStyle = '#ff8a94'
      c.fillText(TITLE, W / 2, L.bossY - 18)
    }

    const drawBlaster = (b: Extract<Bullet, { kind: 'blast' }>) => {
      const width = beamWidth(b)
      if (b.t < b.charge) {
        c.save()
        c.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(b.t * 20))
        c.strokeStyle = '#ff3b4a'
        c.lineWidth = 2
        c.setLineDash([6, 6])
        c.beginPath()
        c.moveTo(b.x, b.y)
        c.lineTo(b.x + Math.cos(b.ang) * 2000, b.y + Math.sin(b.ang) * 2000)
        c.stroke()
        c.restore()
      } else if (width > 0) {
        c.save()
        c.translate(b.x, b.y)
        c.rotate(b.ang)
        c.fillStyle = 'rgba(255, 40, 60, 0.55)'
        c.fillRect(0, -width * 0.75, 2000, width * 1.5)
        c.fillStyle = '#fff'
        c.fillRect(0, -width / 2, 2000, width)
        c.restore()
      }
      c.save()
      c.translate(b.x, b.y)
      c.rotate(b.ang)
      c.fillStyle = '#6b4a1e'
      c.fillRect(-14, -11, 18, 22)
      c.fillStyle = '#c99a3a'
      c.fillRect(-12, -9, 14, 18)
      c.fillStyle = '#111'
      c.fillRect(-4, -6, 7, 12)
      c.fillStyle = b.t < b.charge && Math.sin(b.t * 30) > 0 ? '#fff' : '#ff2a3a'
      c.fillRect(-10, -7, 3, 3)
      c.fillRect(-10, 4, 3, 3)
      c.fillStyle = '#fff'
      for (let i = -5; i < 6; i += 3) c.fillRect(3, i, 3, 2)
      c.restore()
    }

    const drawBox = () => {
      const { boxX, boxY, boxW, boxH } = L
      c.fillStyle = '#000'
      c.fillRect(boxX, boxY, boxW, boxH)
      c.save()
      c.beginPath()
      c.rect(boxX, boxY, boxW, boxH)
      c.clip()
      c.translate(boxX, boxY)
      if (G.mode === 'doom' || G.mode === 'freeze') {
        if (G.t < 0.8 && G.mode === 'doom') {
          c.globalAlpha = 0.25 + 0.25 * Math.abs(Math.sin(G.t * 18))
          c.fillStyle = '#ff2a3a'
          c.fillRect(0, 0, boxW, boxH)
          c.globalAlpha = 1
          c.font = `${Math.round(boxH * 0.3)}px ${font}`
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.fillStyle = '#fff'
          c.fillText('!', boxW / 2, boxH / 2)
        } else {
          const flicker = 0.75 + 0.25 * Math.sin(G.time * 60)
          c.fillStyle = `rgba(255, 30, 50, ${0.5 * flicker})`
          c.fillRect(0, 0, boxW, boxH)
          c.fillStyle = `rgba(255, 255, 255, ${0.65 * flicker})`
          c.fillRect(0, boxH * 0.15, boxW, boxH * 0.7)
        }
      }
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `12px ${font}`
      G.bullets.forEach((b) => {
        if (b.kind === 'num') {
          c.fillStyle = b.color
          c.fillText(b.ch, Math.round(b.x), Math.round(b.y))
        } else if (b.kind === 'bone') {
          c.fillStyle = '#fff'
          c.fillRect(Math.round(b.x - b.w / 2 + 2), Math.round(b.y), b.w - 4, Math.round(b.h))
          c.fillRect(Math.round(b.x - b.w / 2), Math.round(b.y), b.w, 4)
          c.fillRect(Math.round(b.x - b.w / 2), Math.round(b.y + b.h - 4), b.w, 4)
        } else drawBlaster(b)
      })
      const blink = (G.mode === 'doom' && G.t > 0.8) || G.invuln > 0 ? Math.sin(G.time * 40) > 0 : true
      if (blink && G.mode !== 'ashes') drawHeart(c, G.heart.x, G.heart.y, 2, '#ff1f3d')
      c.restore()
      c.strokeStyle = '#fff'
      c.lineWidth = 3
      c.strokeRect(boxX - 1.5, boxY - 1.5, boxW + 3, boxH + 3)
      if (G.mode === 'fight' || G.mode === 'dead') {
        const audio = audioRef.current
        const progress =
          audio && Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.currentTime / audio.duration
            : Math.min(1, G.fightT / G.fightDur)
        c.fillStyle = '#3a0008'
        c.fillRect(boxX, boxY - 8, boxW, 3)
        c.fillStyle = '#ff2a3a'
        c.fillRect(boxX, boxY - 8, boxW * progress, 3)
      }
    }

    const drawHud = () => {
      const y = L.boxY + L.boxH + 36
      const cx = W / 2
      c.save()
      c.shadowColor = '#ff2a3a'
      c.shadowBlur = 12
      drawHeart(c, cx, y, 4, '#b3001e')
      c.restore()
      drawHeart(c, cx, y - 1, 3, '#ff3b4a')
      c.font = `10px ${font}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = '#fff'
      c.fillText(String(G.hp), cx, y - 3)
      c.font = `8px ${font}`
      c.fillStyle = G.hp <= 1 ? '#ff3b4a' : '#ffd23f'
      c.fillText(`HP ${G.hp}/${MAX_HP}`, cx, y + 26)
    }

    const drawRefused = () => {
      const r = G.t
      c.fillStyle = '#000'
      c.fillRect(0, 0, W, H)
      const cx = W / 2
      const cy = H / 2 - 30
      const p = 6
      if (r < 0.5) {
        drawHeart(c, cx, cy, p, '#ff1f3d')
      } else if (!G.snapped) {
        const trembling = r > 2.7
        const jx = trembling ? (Math.random() - 0.5) * 4 : 0
        const jy = trembling ? (Math.random() - 0.5) * 4 : 0
        const color = trembling && Math.floor(r * 14) % 2 === 0 ? '#ffffff' : '#ff1f3d'
        const sep = 8
        drawHeart(c, cx - sep + jx, cy + jy, p, color, 'left')
        drawHeart(c, cx + sep - jx, cy - jy, p, color, 'right')
      } else {
        const since = r - 4
        for (let i = 0; i < 3; i++) {
          const radius = 24 + ((since * 90 + i * 40) % 140)
          c.strokeStyle = `rgba(255, ${120 + i * 40}, 140, ${Math.max(0, 1 - radius / 164)})`
          c.lineWidth = 3
          c.beginPath()
          c.arc(cx, cy, radius, 0, Math.PI * 2)
          c.stroke()
        }
        const glow = c.createRadialGradient(cx, cy, 0, cx, cy, 90)
        glow.addColorStop(0, 'rgba(255, 80, 100, 0.55)')
        glow.addColorStop(1, 'rgba(255, 0, 0, 0)')
        c.fillStyle = glow
        c.fillRect(cx - 90, cy - 90, 180, 180)
        drawHeart(c, cx, cy, p, since < 0.12 ? '#ffffff' : '#ff1f3d')
        c.font = `10px ${font}`
        c.textAlign = 'center'
        c.fillStyle = '#ffd23f'
        c.globalAlpha = Math.min(1, since * 2)
        c.fillText('HP 1', cx, cy + 50)
        c.globalAlpha = 1
      }
      const textAlpha = G.snapped ? Math.max(0, 1 - (r - 4) / 0.8) : 1
      if (G.typed > 0 && textAlpha > 0) {
        const size = Math.max(12, Math.min(20, Math.floor(W / 36)))
        c.font = `${size}px ${font}`
        c.textAlign = 'left'
        c.textBaseline = 'middle'
        c.fillStyle = '#fff'
        c.globalAlpha = textAlpha
        const startX = cx - c.measureText(REFUSED).width / 2
        c.fillText(REFUSED.slice(0, G.typed), startX, cy + 90)
        c.globalAlpha = 1
      }
    }

    const drawAshes = () => {
      G.ashes.forEach((a) => {
        const age = G.t - a.delay
        if (age > 2.5) return
        const gray = Math.min(1, Math.max(0, age) / 0.8)
        const r = Math.round(a.r + (90 - a.r) * gray)
        const g = Math.round(a.g + (90 - a.g) * gray)
        const b = Math.round(a.b + (90 - a.b) * gray)
        c.globalAlpha = age < 0 ? 1 : Math.max(0, 1 - age / 2.5)
        c.fillStyle = `rgb(${r}, ${g}, ${b})`
        c.fillRect(Math.round(a.x), Math.round(a.y), a.size, a.size)
      })
      c.globalAlpha = 1
      if (G.t > 3.4) {
        const size = Math.max(16, Math.min(32, Math.floor(W / 24)))
        c.font = `${size}px ${font}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.globalAlpha = Math.min(1, (G.t - 3.4) * 2)
        c.fillStyle = '#ffd23f'
        c.fillText('VICTORIA', W / 2, L.bossY + L.bossH / 2)
        c.globalAlpha = 1
      }
    }

    const draw = () => {
      c.save()
      if (G.shake > 0) c.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake)
      if (G.mode === 'refused') {
        drawRefused()
      } else {
        drawBackground()
        drawFrame()
        drawBoss()
        if (G.mode === 'ashes') drawAshes()
        drawTitle()
        drawBox()
        drawHud()
      }
      c.restore()
      if (G.flash > 0) {
        c.fillStyle = `rgba(255, 255, 255, ${G.flash * 0.6})`
        c.fillRect(0, 0, W, H)
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
      if (!G.drag || (G.mode !== 'fight' && G.mode !== 'doom')) return
      G.heart.x = Math.min(Math.max(G.drag.hx + e.clientX - G.drag.px, 9), L.boxW - 9)
      G.heart.y = Math.min(Math.max(G.drag.hy + e.clientY - G.drag.py, 8), L.boxH - 8)
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
      const audio = audioRef.current
      if (audio) {
        audio.onended = null
        audio.pause()
      }
      demonAudio.close()
      controlsRef.current = null
    }
  }, [])

  return (
    <div className="demon-fight fixed inset-0 z-[300] overflow-hidden bg-black" role="dialog" aria-modal="true" aria-label="Fase 3: combate contra Mephistopheles_calc">
      <canvas ref={canvasRef} className="block h-full w-full touch-none [image-rendering:pixelated]" />
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/70">
          <p className="font-pixel text-2xl text-[#ff3b4a] sm:text-4xl">GAME OVER</p>
          <p className="font-pixel text-[9px] text-white/80 sm:text-[10px]">{'* No te rindas. Mantén tu DETERMINACIÓN.'}</p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => controlsRef.current?.retry()}
              className="border-2 border-white px-4 py-3 font-pixel text-[10px] text-white transition-colors hover:border-[#ffd23f] hover:text-[#ffd23f] focus-visible:outline-2 focus-visible:outline-[#ffd23f]"
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
