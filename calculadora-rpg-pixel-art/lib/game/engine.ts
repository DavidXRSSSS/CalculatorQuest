import { sfx, type SfxName } from './audio'
import { createAttack, tierOf } from './attacks'
import { createDifficultyProfile, getDifficultyBand, scaleDifficulty, type DifficultyProfile } from './difficulty'
import { drawBeam, drawBlasterVisual, drawBossArms, drawBullet, drawFinalBoss, drawGasterHead, drawHeart, drawRefusal, drawSansBoss, drawText } from './render'
import { drawEnemy, drawScreenFace, type BossState, type CalcMood, type ScreenRect } from './calc-sprite'
import { IFRAMES, MIN_WARN, SOUL_HIT_R, SPAWN_BLINK } from './types'
import type {
  Attack,
  AttackHost,
  Beam,
  BeamInit,
  Box,
  Bullet,
  BulletInit,
  Enemy,
  FloatText,
  Marker,
  Particle,
  Player,
  Vec,
} from './types'

type Mode = 'intro' | 'break' | 'fight' | 'phase' | 'refusal' | 'victory' | 'defeat'

export interface EnemySpec {
  label: string
  value: number
}

export interface EngineEvents {
  onHp(hp: number): void
  onAttack(n: number, total: number, phase: number): void
  onPhase(phase: number): void
  onShake(): void
  onVictory(): void
  onDefeat(): void
  onRefusal(): void
  onBoss?(state: BossState, mood: CalcMood): void
}

export const PHASE_TOTALS = [20, 18] as const
export const MAX_HP = 100
const HEART_R = 6
const MAX_BULLETS = 150
  const BOSS_COLOR = '#ff3b5c'
  const indexColor = (value: number) => value < 0.33 ? '#36e2ff' : value < 0.66 ? '#ff3b5c' : '#ffd23f'
  const LANE = 30
const ENEMY_COLORS = ['#ffd23f', '#36e2ff', '#ff7ad9', '#7dff6b']
const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift']

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export class Engine implements AttackHost {
  box: Box = { x: 0, y: 0, w: 0, h: 0 }
  player: Player = { x: 0, y: 0, hp: MAX_HP, maxHp: MAX_HP }
  rng = mulberry32(Math.floor(Math.random() * 1e9))

  private ctx: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private dpr = 1
  private bullets: Bullet[] = []
  private beams: Beam[] = []
  private particles: Particle[] = []
  private texts: FloatText[] = []
  private markers: Marker[] = []
  private enemies: Enemy[]
  private mode: Mode = 'intro'
  private modeT = 0
  private time = 0
  private phase = 1
  private attackIndex = 0
  private attack: Attack | null = null
  private attackT = 0
  private lastPattern?: string
  private damaged = false
  private iframes = 0
  private spawnBlink = 0
  private shakeAmt = 0
  private flash = 0
  private flashRGB = '255,59,92'
  private keys = new Set<string>()
  private pointer: Vec | null = null
  private raf = 0
  private last = 0
  private running = true
  private placed = false
  private heartDead = false
  private fired = false
  private dodgeCd = 0
  private fusionT = 0
  private fusionSurvival = false
  private fusionIntro = false
  private phase3Boss = false
  private phase3AudioDuration = 0
  private phase3Elapsed = 0
  private phase4Intro = false
  private phase4PostRefused = false
  private heartBlue = false
  private secretShielded = false
  private difficulty: DifficultyProfile
  private paused = false
  private immortal = false
  private playerSpeed = 1
  private attackSpeed = 1
  private adminDifficulty = 1
  private bossHost: HTMLElement | null = null
  private bossScreen: ScreenRect | null = null
  private bossState: BossState | null = null
  private bossMoodSent: CalcMood | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private zone: HTMLElement,
    specs: EnemySpec[],
    private ev: EngineEvents,
    private font: string,
    private phase4Enabled = false,
  ) {
    this.difficulty = createDifficultyProfile(specs.map((spec) => spec.value))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D no disponible')
    this.ctx = ctx
    this.enemies = specs.map((s, i) => ({
      label: s.label,
      value: s.value,
      tier: tierOf(s.value),
      color: ENEMY_COLORS[i % ENEMY_COLORS.length],
      u: i / specs.length + 0.125,
      x: 0,
      y: 0,
      pulse: 0,
      alive: true,
      seed: i * 1.7,
      enter: 0,
    }))
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('resize', this.resize)
    window.addEventListener('blur', this.onBlur)
    this.resize()
    this.enemies.forEach((_, i) => window.setTimeout(() => this.running && sfx.play('emerge'), 150 + i * 120))
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('blur', this.onBlur)
  }

  setPhase3AudioDuration(duration: number) {
    if (Number.isFinite(duration) && duration > 0) this.phase3AudioDuration = duration
  }

  finishPhase3FromAudio() {
    if (this.phase !== 3 || !this.phase3Boss) return
    this.clearBullets()
    this.attack = null
    this.setMode('victory')
    this.ev.onVictory()
  }

  activateSecretPhase() {
    if (this.mode === 'refusal' || this.phase >= 3) return
    this.clearBullets()
    this.attack = null
    this.secretShielded = true
    this.player.hp = 0
    this.ev.onHp(0)
    this.ev.onRefusal()
    this.fired = false
    this.modeT = 0
    this.setMode('refusal')
    this.flashRGB = '255,0,32'
    this.flash = 1
    this.shakeAmt = 22
    sfx.play('error')
  }

  solveSecretShield() {
    if (!this.secretShielded) return
    this.secretShielded = false
    this.flashRGB = '255,210,63'
    this.flash = 0.8
    this.shakeAmt = 8
    this.clearBullets()
    this.ev.onShake()
    sfx.play('phase')
  }

  adminAction(action: string, value?: unknown) {
    if (action === 'set_hp' && typeof value === 'number') { this.player.hp = Math.max(0, Math.min(this.player.maxHp, value)); this.ev.onHp(this.player.hp); return }
    if (action === 'set_max_hp' && typeof value === 'number') { this.player.maxHp = Math.max(1, Math.min(9999, Math.round(value))); this.player.hp = Math.min(this.player.hp, this.player.maxHp); this.ev.onHp(this.player.hp); return }
    if (action === 'immortal') { this.immortal = value === true; return }
    if (action === 'speed' && typeof value === 'number') { this.playerSpeed = Math.max(0.1, Math.min(5, value)); return }
    if (action === 'attack_speed' && typeof value === 'number') { this.attackSpeed = Math.max(0.1, Math.min(5, value)); return }
    if (action === 'difficulty' && typeof value === 'number') { this.adminDifficulty = Math.max(0.1, Math.min(5, value)); return }
    if (action === 'pause') { this.paused = true; return }
    if (action === 'resume') { this.paused = false; this.last = performance.now(); return }
    if (action === 'restart') { this.restartAdmin(); return }
    if (action === 'victory') { this.attack = null; this.clearBullets(); this.fired = false; this.setMode('victory'); return }
    if (action === 'gameover') { this.attack = null; this.clearBullets(); this.player.hp = 0; this.ev.onHp(0); this.fired = false; this.setMode('defeat'); return }
    if (action === 'phase' && typeof value === 'number') { this.setAdminPhase(value); return }
    if (action === 'launch_attack' && this.mode === 'break') { this.beginAttack() }
  }

  private restartAdmin() {
    this.paused = false; this.immortal = false; this.player.hp = this.player.maxHp; this.attackIndex = 0; this.lastPattern = undefined; this.clearBullets(); this.fusionSurvival = false; this.phase3Boss = false; this.heartDead = false; this.fired = false; this.setMode('intro'); this.ev.onHp(this.player.hp)
  }

  private setAdminPhase(next: number) {
    this.phase = Math.max(1, Math.min(4, Math.round(next)))
    this.attackIndex = 0; this.attack = null; this.lastPattern = undefined; this.clearBullets(); this.fusionSurvival = false; this.phase3Boss = false; this.heartDead = false; this.setMode('break'); this.ev.onPhase(this.phase); this.ev.onAttack(1, this.total(), this.phase)
  }

  // ---------- AttackHost ----------
  private clampAttackPoint(x: number, y: number, radius = 4): Vec {
    const b = this.box
    const r = Math.max(1, Math.min(radius, Math.min(b.w, b.h) / 2))
    return { x: Math.max(b.x + r, Math.min(b.x + b.w - r, x)), y: Math.max(b.y + r, Math.min(b.y + b.h - r, y)) }
  }

  private isAttackInside(x: number, y: number, radius = 4) {
    const b = this.box
    return x - radius >= b.x && x + radius <= b.x + b.w && y - radius >= b.y && y + radius <= b.y + b.h
  }

  spawn(b: BulletInit) {
    if (this.bullets.length >= MAX_BULLETS) return
    const x = b.x
    const y = b.y
    const radius = Math.max(1, b.r ?? 4)
    const point = this.clampAttackPoint(x, y, radius)
    const bullet = { ...b, x: point.x, y: point.y }
    this.bullets.push({
      ...bullet,
      vx: 0,
      vy: 0,
      r: 4,
      color: '#f4f4f4',
      dmg: 4,
      kind: 'sq',
      bounces: 0,
      inside: false,
      age: 0,
      life: 8,
      grazed: false,
      dead: false,
      ...bullet,
      x: point.x,
      y: point.y,
    })
  }

  beam(b: BeamInit) {
    const left = this.box.x
    const right = this.box.x + this.box.w
    const top = this.box.y
    const bottom = this.box.y + this.box.h
    const visualOutside = b.visual === 'blaster' || b.warnOnly
    this.beams.push({ ...b, warn: b.warnOnly ? b.warn : Math.max(MIN_WARN, b.warn), x1: visualOutside ? b.x1 : Math.max(left, Math.min(right, b.x1)), y1: visualOutside ? b.y1 : Math.max(top, Math.min(bottom, b.y1)), x2: visualOutside ? b.x2 : Math.max(left, Math.min(right, b.x2)), y2: visualOutside ? b.y2 : Math.max(top, Math.min(bottom, b.y2)), age: 0, fired: false, dead: false })
  }

  marker(x: number, y: number, dur: number, color: string) {
    this.markers.push({ x, y, life: dur, max: dur, color })
  }

  telegraph(x1: number, y1: number, x2: number, y2: number, thick: number, dur: number) {
    this.beam({ x1, y1, x2, y2, thick, warn: dur, dur: 0, dmg: 0, color: '#ff2a3c', warnOnly: true })
  }

  emitFrom(e: Enemy): Vec {
    e.pulse = 1
    if (this.phase <= 2) return this.bossEmit()
    return { x: e.x, y: e.y }
  }

  setBossHost(el: HTMLElement | null) {
    this.bossHost = el
  }

  /** Projectiles pour out of the main calculator's bottom edge, straight into the top wall of the box. */
  private bossEmit(): Vec {
    const b = this.box
    const s = this.bossScreen
    const center = s ? s.x + s.w / 2 : b.x + b.w / 2
    const spread = Math.min(b.w, s?.w ?? b.w) * 0.4
    const x = Math.max(b.x + 6, Math.min(b.x + b.w - 6, center + (this.rng() - 0.5) * spread))
    return { x, y: b.y + 2 }
  }

  private readBossScreen() {
    const el = this.bossHost?.querySelector<HTMLElement>('[data-boss-screen]')
    if (!el) { this.bossScreen = null; return }
    const r = el.getBoundingClientRect()
    this.bossScreen = r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  }

  private currentBossState(): BossState {
    if (this.phase > 2) return 'idle'
    if (!this.enemies.some((e) => e.alive)) return 'dead'
    if (this.mode === 'fight') return 'attack'
    if (this.mode === 'intro' || this.mode === 'break' || this.mode === 'phase' || this.mode === 'defeat') return 'talk'
    return 'idle'
  }

  private syncBossState() {
    const state = this.currentBossState()
    const mood = this.calcMood()
    if (state === this.bossState && mood === this.bossMoodSent) return
    this.bossState = state
    this.bossMoodSent = mood
    this.ev.onBoss?.(state, mood)
  }

  private calcMood(): CalcMood {
    const band = getDifficultyBand(this.difficulty.currentNumber)
    return Math.min(3, band + (this.phase === 2 ? 1 : 0)) as CalcMood
  }

  sound(name: SfxName) {
    sfx.play(name)
  }

  // ---------- Input ----------
  private onKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '')) return
  const k = e.key.toLowerCase()
    if (MOVE_KEYS.includes(k)) {
      e.preventDefault()
      this.keys.add(k)
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '')) return
  this.keys.delete(e.key.toLowerCase())
  }

  private onBlur = () => this.keys.clear()

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || (e.target as HTMLElement | null)?.closest('button')) return
    this.pointer = { x: e.clientX, y: e.clientY }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointer || this.heartDead) return
    this.player.x += (e.clientX - this.pointer.x) * 1.25
    this.player.y += (e.clientY - this.pointer.y) * 1.25
    this.pointer = { x: e.clientX, y: e.clientY }
  }

  private onPointerUp = () => {
    this.pointer = null
  }

  private resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.canvas.width = Math.floor(this.W * this.dpr)
    this.canvas.height = Math.floor(this.H * this.dpr)
    this.canvas.style.width = `${this.W}px`
    this.canvas.style.height = `${this.H}px`
  }

  // ---------- Loop ----------
  private loop = (ts: number) => {
    if (!this.running) return
    const dt = Math.min(0.033, Math.max(0, (ts - this.last) / 1000))
    this.last = ts
    this.update(dt)
    this.render()
    this.raf = requestAnimationFrame(this.loop)
  }

  private updateBox() {
    const r = this.zone.getBoundingClientRect()
    const insetX = this.W - r.width < 180 ? 40 : 0
    const insetY = Math.min(34, r.height * 0.2)
    this.box = {
      x: Math.round(r.left + insetX),
      y: Math.round(r.top + insetY),
      w: Math.max(0, Math.round(r.width - insetX * 2)),
      h: Math.max(0, Math.round(r.height - insetY * 2)),
    }
  }

  private perim(u: number): Vec {
    const d = Math.min(18, Math.max(8, LANE * 0.45))
    const x = this.box.x - d
    const y = this.box.y - d
    const w = this.box.w + 2 * d
    const h = this.box.h + 2 * d
    let s = (((u % 1) + 1) % 1) * 2 * (w + h)
    if (s < w) return { x: x + s, y }
    s -= w
    if (s < h) return { x: x + w, y: y + s }
    s -= h
    if (s < w) return { x: x + w - s, y: y + h }
    s -= w
    return { x, y: y + h - s }
  }

  private update(dt: number) {
    if (this.paused) return
    this.time += dt
    this.modeT += dt
    this.updateBox()
    this.readBossScreen()
    this.syncBossState()
    const b = this.box

    if (!this.placed && b.h > 60) {
      this.player.x = b.x + b.w / 2
      this.player.y = b.y + b.h / 2
      this.placed = true
      this.spawnBlink = SPAWN_BLINK
    }

    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    for (const e of this.enemies) {
      if (this.phase === 3) {
        // During the seven-second fusion the source numbers visibly travel into one another.
        e.enter = Math.min(1, e.enter + dt / 0.9)
        const fusion = this.mode === 'phase' ? Math.min(1, this.modeT / 11.5) : 1
        const sourceIndex = this.enemies.indexOf(e)
        const fusionY = b.y + Math.min(82, Math.max(58, b.h * 0.16))
        const sourceX = cx + (sourceIndex % 2 === 0 ? -1 : 1) * Math.min(150, b.w * 0.28)
        const sourceY = fusionY + (sourceIndex % 2 === 0 ? -1 : 1) * 8
        const pull = Math.max(0, (fusion - 0.28) / 0.72)
        e.u = 0.5
        e.x = sourceX + (cx - sourceX) * pull * (0.72 + fusion * 0.28)
        e.y = sourceY + (fusionY - sourceY) * pull * (0.72 + fusion * 0.28) + Math.sin(this.time * 5 + e.seed) * (fusion < 1 ? 3 : 0)
        if (e.alive && Math.random() < (fusion < 1 ? 0.95 : 0.8)) this.particle(e.x + (Math.random() - 0.5) * 90, e.y + (Math.random() - 0.5) * 34, e.color, fusion < 1 ? 120 : 70, 0.35, 3, 0)
      } else {
        e.u += dt * 0.012
        const target = this.perim(e.u)
        if (e.enter < 1) {
          e.enter = Math.min(1, e.enter + dt / 1.1)
          const k = easeOutBack(e.enter)
          e.x = cx + (target.x - cx) * k
          e.y = cy + (target.y - cy) * k
          if (e.alive && Math.random() < 0.6) this.particle(e.x, e.y, e.color, 60, 0.4, 3, 0)
        } else {
          e.x = target.x
          e.y = target.y
        }
      }
      e.pulse = Math.max(0, e.pulse - dt * 3)
    }

    if (this.placed && !this.heartDead && this.mode !== 'victory') {
      let mx = 0
      let my = 0
      const k = this.keys
      if (k.has('arrowleft') || k.has('a')) mx -= 1
      if (k.has('arrowright') || k.has('d')) mx += 1
      if (k.has('arrowup') || k.has('w')) my -= 1
      if (k.has('arrowdown') || k.has('s')) my += 1
      if (mx && my) {
        mx *= Math.SQRT1_2
        my *= Math.SQRT1_2
      }
      const heartMultiplier = this.phase === 4 && this.phase4PostRefused ? 1.2 : this.phase === 2 ? 1.2 : 1
      const speed = (k.has('shift') ? 115 : 225) * this.playerSpeed * heartMultiplier
      this.player.x += mx * speed * dt
      this.player.y += my * speed * dt
    }
    if (this.placed) {
      const m = HEART_R + 3
      this.player.x = Math.max(b.x + m, Math.min(b.x + b.w - m, this.player.x))
      this.player.y = Math.max(b.y + m, Math.min(b.y + b.h - m, this.player.y))
    }

    this.stepMode(dt)
    if (this.mode !== 'defeat') {
      this.updateBullets(dt)
      this.updateBeams(dt)
    }
    this.updateFx(dt)
    this.iframes = Math.max(0, this.iframes - dt)
    this.spawnBlink = Math.max(0, this.spawnBlink - dt)
    this.dodgeCd = Math.max(0, this.dodgeCd - dt)
    this.shakeAmt *= Math.pow(0.001, dt)
    this.flash = Math.max(0, this.flash - dt * 2.2)
  }

  private total() {
    return PHASE_TOTALS[this.phase - 1]
  }

  private stepMode(dt: number) {
    switch (this.mode) {
      case 'intro':
        if (this.modeT > 1.6) this.toBreak()
        break
      case 'break':
        if (this.modeT > (this.phase === 1 ? 0.9 : 0.6)) this.beginAttack()
        break
      case 'fight':
        if (!this.attack) return
      const phaseRate = this.phase === 4 ? (this.phase4PostRefused ? 0.62 : 0.84) : this.phase === 3 ? 0.86 : this.phase === 2 ? 0.8 : 1
      this.attackT += dt * this.attackSpeed * this.adminDifficulty * phaseRate
      this.attack.update(this.attackT, dt)
    if (this.heartBlue) {
      const drift = Math.sin(this.attackT * 3) * 34
      this.player.y = Math.min(this.box.y + this.box.h - 18, this.player.y + (this.attackT < 1.2 ? 78 : -28) * dt)
      this.player.x = Math.max(this.box.x + 14, Math.min(this.box.x + this.box.w - 14, this.player.x + drift * dt))
      if (Math.floor(this.attackT * 18) % 2 === 0) this.particle(this.player.x, this.player.y, '#36e2ff', 80, 0.25, 2, 0)
    }
    if (this.attackT >= this.attack.duration) this.endAttack()
        break
  case 'refusal':
  if (this.modeT < 1.2) {
    this.heartDead = true
    if (Math.random() < 0.8) this.particle(this.player.x + (this.rng() - .5) * 40, this.player.y + (this.rng() - .5) * 40, '#fff', 220, .7, 4, 0)
  } else if (this.modeT < 2.4) {
    this.heartDead = false
    this.heartBlue = false
    this.player.hp = Math.max(1, this.player.hp)
    this.ev.onHp(this.player.hp)
    if (Math.random() < 0.9) this.particle(this.player.x + (this.rng() - .5) * 70, this.player.y + (this.rng() - .5) * 70, '#ffd23f', 180, .8, 3, 0)
  } else if (this.modeT > 3.1) {
    this.phase = 3
    this.phase3Boss = true
    this.phase3Elapsed = 0
    this.fusionSurvival = false
    this.attackIndex = 0
    this.lastPattern = undefined
    this.heartDead = false
    this.player.hp = 1
    this.ev.onHp(1)
    this.ev.onPhase(3)
    this.setMode('break')
    this.flash = 0
    this.shakeAmt = 12
    sfx.play('phase')
  }
  break
  case 'phase':
  if (this.phase === 3 && this.fusionSurvival) {
          this.fusionT = this.modeT
          const progress = Math.min(1, this.modeT / 4.2)
          const cx = this.box.x + this.box.w / 2
          const cy = this.box.y + Math.min(82, Math.max(58, this.box.h * 0.16))
          if (this.fusionIntro) {
            for (const [index, enemy] of this.enemies.entries()) {
              const side = index === 0 ? -1 : 1
              const startX = cx + side * Math.min(150, this.box.w * 0.32)
              const startY = cy + 12 + Math.sin(this.time * 5 + index) * 12
              const pull = Math.pow(progress, 1.35)
              const orbit = (1 - pull) * Math.sin(this.time * 8 + index) * 34
              enemy.x = startX + (cx - startX) * pull + orbit
              enemy.y = startY + (cy - startY) * pull + Math.cos(this.time * 7 + index) * (1 - pull) * 18
              enemy.pulse = 1
            }
            if (Math.random() < 0.8) this.particle(cx + (this.rng() - 0.5) * (this.box.w * (1 - progress) * 0.8 + 12), cy + (this.rng() - 0.5) * 70, progress > 0.8 ? '#fff' : indexColor(this.rng()), 120, 0.45, 3, 0)
            if (this.modeT > 4.2) { this.fusionIntro = false; this.attackIndex = 0; this.toBreak() }
          }
          break
        }
  if (this.phase === 3 && this.phase3Boss) {
  this.phase3Elapsed += dt
  if (this.phase3AudioDuration > 0 && this.phase3Elapsed >= this.phase3AudioDuration) { this.finishPhase3FromAudio(); return }
  if (this.modeT > 1.8) this.toBreak()
          break
        }
        if (this.phase === 4) {
          if (this.phase4Intro) {
            if (this.modeT > 5.8) { this.phase4Intro = false; this.phase4PostRefused = true; this.attackIndex = 0; this.ev.onPhase(4); this.toBreak() }
            break
          }
          if (this.modeT > 0.8 && this.modeT < 4.8 && Math.floor(this.modeT * 4) % 2 === 0) {
            this.flashRGB = '255,59,92'
            this.flash = 0.08
            this.shakeAmt = Math.max(this.shakeAmt, 1.5)
          }
          if (this.modeT > 5.4) this.toBreak()
          break
        }
        // Phase changes are committed only by endAttack after the current phase's real attack quota.
        break
      case 'victory': {
        const idx = Math.floor((this.modeT - 0.7) / 0.45)
        this.enemies.forEach((e, i) => {
          if (e.alive && i <= idx) this.explodeEnemy(e)
        })
        if (!this.fired && this.modeT > 0.7 + this.enemies.length * 0.45 + 1) {
          this.fired = true
          this.ev.onVictory()
        }
        break
      }
      case 'defeat':
        if (!this.fired && this.modeT > 1.3) {
          this.fired = true
          this.ev.onDefeat()
        }
        break
    }
  }

  private setMode(m: Mode) {
    this.mode = m
    this.modeT = 0
  }

  private toBreak() {
    this.setMode('break')
    this.ev.onAttack(this.attackIndex + 1, this.total(), this.phase)
    sfx.play('attack')
  }

  private beginAttack() {
    this.heartBlue = this.phase === 4 && this.attackIndex % 3 === 0
    const phaseDifficulty = scaleDifficulty(this.difficulty, this.phase, this.phase === 3 ? 2 : this.phase === 4 ? 3 : 1)
    this.attack = createAttack(this.enemies, this.attackIndex, this.phase, this.rng, this, phaseDifficulty, this.lastPattern)
    this.lastPattern = this.attack.name
    this.attack.enemy.pulse = 1
    this.attackT = 0
    this.damaged = false
    this.setMode('fight')
    this.text(`${this.attack.enemy.label}: ${this.attack.label}`, this.box.x + this.box.w / 2, this.box.y + 14, this.attack.enemy.color, 8, 1.4, -6)
  }

  private endAttack() {
    this.heartBlue = false
    if (!this.damaged) {
      this.text('PERFECT!', this.player.x, this.player.y - 18, '#7dff6b', 8, 1, -30)
      this.burst(this.player.x, this.player.y, ['#7dff6b', '#fff'], 14, 120)
      sfx.play('dodge')
    }
    this.attack = null
    this.attackIndex++
    if (this.attackIndex < this.total()) {
      this.toBreak()
      return
    }
    this.clearBullets()
    if (this.phase === 3 && this.fusionSurvival) {
      this.fusionSurvival = false
      this.phase3Boss = true
      const bossValue = this.enemies.reduce((sum, enemy) => sum + enemy.value, 0)
      const boss: Enemy = {
        label: String(bossValue), value: bossValue, tier: tierOf(bossValue), color: BOSS_COLOR,
        u: 0.5, x: this.box.x + this.box.w / 2, y: this.box.y + Math.min(82, Math.max(58, this.box.h * 0.16)), pulse: 1, alive: true, seed: 7, enter: 0,
      }
      this.enemies = [boss]
      this.fusionT = 0
      this.flashRGB = '255,59,92'
      this.flash = 1
      this.shakeAmt = 24
      this.attackIndex = 0
      this.setMode('phase')
      this.ev.onPhase(3)
      sfx.play('phase')
      return
    }
    if (this.phase === 1) {
      this.phase = 2
      this.attackIndex = 0
      this.setMode('intro')
      this.flash = 1
      this.flashRGB = '255,255,255'
      this.shakeAmt = 12
      this.ev.onPhase(2)
      this.ev.onShake()
      this.enemies.forEach((e) => (e.pulse = 1))
      sfx.play('phase')
    } else if (this.phase === 2) {
      this.setMode('victory')
      this.fired = false
      sfx.play('victory')
    }
  }

  private clearBullets() {
    for (const b of this.bullets) this.particle(b.x, b.y, b.color, 80, 0.5, 3, 0)
    this.bullets = []
    this.beams = []
    this.markers = []
  }

  // ---------- Bullets & collisions ----------
  private updateBullets(dt: number) {
    const b = this.box
    const p = this.player
    const canHit = this.placed && !this.heartDead && !this.secretShielded && (this.mode === 'fight' || this.mode === 'break')
    for (const bl of this.bullets) {
      bl.age += dt
      bl.x += bl.vx * dt
      if (bl.wave) bl.y = bl.wave.base + Math.sin(bl.age * bl.wave.freq + bl.wave.phase) * bl.wave.amp
      else bl.y += bl.vy * dt

      if (bl.kind === 'glyph') {
        const inX = bl.x > b.x + bl.r && bl.x < b.x + b.w - bl.r
        const inY = bl.y > b.y + bl.r && bl.y < b.y + b.h - bl.r
        if (!bl.inside && inX && inY) bl.inside = true
        if (bl.inside && bl.bounces > 0) {
          if (bl.x < b.x + bl.r || bl.x > b.x + b.w - bl.r) {
            bl.vx *= -1
            bl.x = Math.max(b.x + bl.r, Math.min(b.x + b.w - bl.r, bl.x))
            bl.bounces--
            sfx.play('bounce')
          }
          if (bl.y < b.y + bl.r || bl.y > b.y + b.h - bl.r) {
            bl.vy *= -1
            bl.y = Math.max(b.y + bl.r, Math.min(b.y + b.h - bl.r, bl.y))
            bl.bounces--
            sfx.play('bounce')
          }
        }
      }

      if (!this.isAttackInside(bl.x, bl.y, bl.r) || bl.age > bl.life) {
        bl.dead = true
        continue
      }

      if (!canHit) continue
      let dx = bl.x - p.x
      let dy = bl.y - p.y
      if (bl.len) {
        if (bl.vertical) dy = Math.sign(dy) * Math.max(0, Math.abs(dy) - bl.len)
        else dx = Math.sign(dx) * Math.max(0, Math.abs(dx) - bl.len)
      }
      const d2 = dx * dx + dy * dy
      const hitR = bl.r + SOUL_HIT_R
      if (d2 < hitR * hitR) {
        if (this.iframes <= 0) {
          bl.dead = true
          this.takeDamage(bl.dmg)
        }
      } else if (!bl.grazed && d2 < (hitR + 12) * (hitR + 12)) {
        bl.grazed = true
        this.graze()
      }
    }
    this.bullets = this.bullets.filter((bl) => !bl.dead)
  }

  private updateBeams(dt: number) {
    const p = this.player
    const canHit = this.placed && !this.heartDead && !this.secretShielded && (this.mode === 'fight' || this.mode === 'break')
    for (const bm of this.beams) {
      bm.age += dt
      if (bm.warnOnly) {
        if (bm.age >= bm.warn) bm.dead = true
        continue
      }
      if (!bm.fired && bm.age >= bm.warn) {
        bm.fired = true
        this.shakeAmt = Math.max(this.shakeAmt, 4)
        sfx.play('beam')
      }
      const k = (bm.age - bm.warn) / bm.dur
      if (bm.fired && k >= 0.1 && k <= 1 && canHit && this.iframes <= 0) {
        const d = distToSegment(p.x, p.y, bm.x1, bm.y1, bm.x2, bm.y2)
        if (d < bm.thick * 0.42 + SOUL_HIT_R * 0.5) this.takeDamage(bm.dmg)
      }
      if (k > 1.2) bm.dead = true
    }
    this.beams = this.beams.filter((bm) => !bm.dead)
    for (const m of this.markers) m.life -= dt
    this.markers = this.markers.filter((m) => m.life > 0)
  }

  private takeDamage(amount: number) {
    const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0
    if (damage <= 0 || this.iframes > 0 || this.heartDead || this.player.hp <= 0) return false
    if (this.immortal) { this.player.hp = Math.max(1, this.player.hp); this.ev.onHp(this.player.hp); return true }
    this.player.hp = Math.max(0, Math.min(this.player.maxHp, this.player.hp - damage))
    this.iframes = IFRAMES
    this.shakeAmt = 9
    this.flash = 0.6
    this.flashRGB = '255,59,92'
    this.damaged = true
    this.burst(this.player.x, this.player.y, ['#ff3b5c', '#fff'], 16, 160)
    this.text(`-${damage}`, this.player.x, this.player.y - 16, '#ff3b5c', 8, 0.8, -40)
    sfx.play('hit')
    this.ev.onHp(this.player.hp)
    this.ev.onShake()
    if (this.player.hp <= 0) this.defeat()
    return true
  }

  private graze() {
    this.burst(this.player.x, this.player.y, ['#36e2ff', '#fff'], 4, 90)
    sfx.play('graze')
    if (this.dodgeCd <= 0) {
      this.dodgeCd = 0.7
      this.text('MISS', this.player.x + 18, this.player.y - 10, '#36e2ff', 8, 0.6, -30)
    }
  }

  private defeat() {
    this.heartDead = true
    this.setMode('defeat')
    this.fired = false
    // The soul-shatter sequence is rendered by the GameOver overlay at the heart's last position.
    this.fired = true
    this.ev.onDefeat()
  }

  // ---------- Effects ----------
  private particle(x: number, y: number, color: string, speed: number, life: number, size: number, g: number) {
    const a = Math.random() * Math.PI * 2
    const s = Math.random() * speed
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size, color, g })
  }

  private burst(x: number, y: number, colors: string[], n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      this.particle(x, y, colors[i % colors.length], speed, 0.4 + Math.random() * 0.4, 2 + Math.floor(Math.random() * 3), 0)
    }
  }

  private explodeEnemy(e: Enemy) {
    e.alive = false
    if (this.phase <= 2) {
      const s = this.bossScreen
      const at = s ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : this.bossEmit()
      e.x = at.x + (Math.random() - 0.5) * (s ? s.w * 0.6 : 60)
      e.y = at.y + (Math.random() - 0.5) * (s ? s.h * 0.6 : 40)
    }
    for (let i = 0; i < 46; i++) {
      this.particle(e.x, e.y, i % 3 === 0 ? '#fff' : e.color, 260, 0.6 + Math.random() * 0.8, 3 + Math.floor(Math.random() * 4), 260)
    }
    this.text(e.label, e.x, e.y, e.color, 16, 0.9, -50)
    this.shakeAmt = Math.max(this.shakeAmt, 7)
    sfx.play('pop')
  }

  explodeRects(rects: DOMRect[]) {
    const colors = ['#f4f4f4', '#ffd23f', '#ff3b5c', '#36e2ff', '#1a1a2e']
    for (const r of rects) {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      for (let i = 0; i < 160; i++) {
        const x = r.left + Math.random() * r.width
        const y = r.top + Math.random() * r.height
        const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.8
        const s = 80 + Math.random() * 380
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1 + Math.random() * 1.2, max: 2.2, size: 3 + Math.floor(Math.random() * 6), color: colors[i % colors.length], g: 420 })
      }
    }
    this.flash = 1
    this.flashRGB = '255,210,63'
    this.shakeAmt = 20
  }

  private text(text: string, x: number, y: number, color: string, size: number, life: number, vy: number) {
    this.texts.push({ text, x, y, color, size, life, max: life, vy })
  }

  private updateFx(dt: number) {
    for (const pt of this.particles) {
      pt.life -= dt
      pt.vy += pt.g * dt
      pt.x += pt.vx * dt
      pt.y += pt.vy * dt
      pt.vx *= Math.pow(0.4, dt)
    }
    this.particles = this.particles.filter((pt) => pt.life > 0)
    if (this.particles.length > 1400) this.particles.splice(0, this.particles.length - 1400)
    for (const t of this.texts) {
      t.life -= dt
      t.y += t.vy * dt
    }
    this.texts = this.texts.filter((t) => t.life > 0)
  }

  // ---------- Render ----------
  private render() {
    const c = this.ctx
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.clearRect(0, 0, this.W, this.H)
    c.imageSmoothingEnabled = false
    c.save()
    if (this.shakeAmt > 0.3) {
      c.translate(Math.round((Math.random() - 0.5) * this.shakeAmt * 2), Math.round((Math.random() - 0.5) * this.shakeAmt * 2))
    }

    const b = this.box
    if (b.w > 8 && b.h > 8) {
      c.fillStyle = '#000'
      c.fillRect(b.x, b.y, b.w, b.h)
      c.fillStyle = 'rgba(255,255,255,0.04)'
      for (let x = b.x + 20; x < b.x + b.w; x += 20) c.fillRect(x, b.y, 1, b.h)
      for (let y = b.y + 20; y < b.y + b.h; y += 20) c.fillRect(b.x, y, b.w, 1)
      let border = '#f4f4f4'
      if (this.mode === 'defeat') border = Math.floor(this.time * 12) % 2 ? '#ff3b5c' : '#f4f4f4'
      else if (this.phase === 2) {
        const g = Math.round(200 + Math.sin(this.time * 4) * 55)
        border = `rgb(255,${g},${g})`
      }
      c.fillStyle = border
      c.fillRect(b.x - 4, b.y - 4, b.w + 8, 4)
      c.fillRect(b.x - 4, b.y + b.h, b.w + 8, 4)
      c.fillRect(b.x - 4, b.y, 4, b.h)
      c.fillRect(b.x + b.w, b.y, 4, b.h)
      c.save()
      c.beginPath()
      c.rect(b.x, b.y, b.w, b.h)
      c.clip()
    }

    for (const m of this.markers) {
      if (Math.floor(m.life * 14) % 2 === 0) {
        const r = 10 + (1 - m.life / m.max) * 18
        c.fillStyle = m.color
        c.fillRect(m.x - r, m.y - 1, r * 2, 2)
        c.fillRect(m.x - 1, m.y - r, 2, r * 2)
        drawText(c, '!', m.x, m.y - r - 8, 16, '#ff3b5c', this.font)
      }
    }

    for (const bm of this.beams) drawBeam(c, bm, this.time)
    for (const bm of this.beams) if (bm.visual === 'blaster' && !bm.dead) drawBlasterVisual(c, bm, this.time)
    for (const bm of this.beams) if (bm.visual === 'gaster' && !bm.dead) drawGasterHead(c, bm, this.time)
    const bulletAlpha = this.mode === 'defeat' ? Math.max(0, 1 - this.modeT) : 1
    c.globalAlpha = bulletAlpha
    for (const bl of this.bullets) drawBullet(c, bl, this.font)
    c.globalAlpha = 1
    if (b.w > 8 && b.h > 8) c.restore()

    if (this.phase === 3 && this.enemies[0]?.alive) {
      const boss = this.enemies[0]
      if (this.mode === 'phase' && this.enemies.length > 1) {
        const fusion = Math.min(1, this.modeT / 4.2)
        const cx = b.x + b.w / 2
        const cy = b.y + Math.min(82, Math.max(58, b.h * 0.16))
        c.save()
        c.globalAlpha = 0.25 + fusion * 0.65
        c.strokeStyle = fusion > 0.58 ? '#ff3b5c' : '#36e2ff'
        c.lineWidth = 3 + fusion * 5
        c.setLineDash([10, 7])
        c.beginPath()
        c.arc(cx, cy, 38 + fusion * 54 + Math.sin(this.time * 8) * 4, 0, Math.PI * 2)
        c.stroke()
        c.restore()
        for (const e of this.enemies) if (e.alive) drawEnemy(c, e, this.font, this.time, this.player)
        if (fusion > 0.62) drawText(c, 'FUSIÓN', cx, cy - 58, 12, '#ff3b5c', this.font, fusion)
      } else {
        if (this.phase3Boss) {
          drawFinalBoss(c, { ...boss, x: b.x + b.w / 2, y: b.y + Math.min(92, Math.max(64, b.h * 0.18)), label: '666' }, this.font, this.time, this.player, b, this.attack?.name ?? '', this.attackT)
        } else {
          drawBossArms(c, b.x + b.w / 2, boss.y + 8, b, this.time, BOSS_COLOR, this.attack?.name ?? '', this.attackT)
          drawEnemy(c, boss, this.font, this.time, this.player, true)
        }
      }
    } else if (this.phase === 4) {
      for (const e of this.enemies) if (e.alive) drawEnemy(c, e, this.font, this.time, this.player)
    }

    if (this.mode === 'refusal') {
      drawRefusal(c, this.player.x, this.player.y, this.time, Math.min(1, this.modeT / 3.1))
      drawText(c, 'BUT IT REFUSED', b.x + b.w / 2, b.y + b.h * .72, 14, '#fff', this.font, Math.min(1, this.modeT / .4))
    }
    if (this.phase === 4 && !this.phase4Intro && this.enemies[0]?.alive) {
      const boss = { ...this.enemies[0], x: b.x + b.w / 2, y: b.y + Math.min(92, Math.max(64, b.h * 0.18)) }
      drawSansBoss(c, boss, this.font, this.time, this.player, b, this.attack?.name ?? '', this.attackT)
    }

    if (this.phase === 4 && this.phase4Intro && this.enemies[0]?.alive) {
      const p = Math.min(1, this.modeT / 5.8)
      const cx = b.x + b.w / 2
      const cy = b.y + Math.min(82, Math.max(58, b.h * 0.16))
      c.save(); c.globalAlpha = 0.35 + p * 0.65; c.strokeStyle = p > 0.65 ? '#ff3b5c' : '#ffd23f'; c.lineWidth = 3 + p * 5; c.setLineDash([12, 8]); c.beginPath(); c.arc(cx, cy, 24 + (1 - p) * 100 + Math.sin(this.time * 9) * 5, 0, Math.PI * 2); c.stroke(); c.restore()
      drawBossArms(c, cx, cy + 8, b, this.time, '#ff3b5c', '', 0)
      for (let i = 0; i < 16; i++) { const a = this.time * 1.8 + i * Math.PI / 8; const radius = 110 * (1 - p) + 12; c.fillStyle = i % 2 ? '#ffd23f' : '#ff3b5c'; c.fillRect(Math.round(cx + Math.cos(a) * radius - 3), Math.round(cy + Math.sin(a) * radius - 3), 6, 6) }
      drawFinalBoss(c, { ...this.enemies[0], x: cx, y: cy, enter: p, pulse: 1 }, this.font, this.time, this.player, b, '', 0, p)
    }

    const spawnHidden = this.spawnBlink > 0 && Math.floor(this.spawnBlink * 12) % 2 === 1
    if (this.placed && !this.heartDead && !spawnHidden && (this.iframes <= 0 || Math.floor(this.time * 20) % 2 === 0)) {
      if (this.heartBlue) {
      c.save()
      c.globalAlpha = 0.35 + Math.sin(this.time * 8) * 0.1
      c.strokeStyle = '#36e2ff'
      c.lineWidth = 3
      c.beginPath()
      c.arc(this.player.x, this.player.y, 15, 0, Math.PI * 2)
      c.stroke()
      c.restore()
    }
    drawHeart(c, this.player.x, this.player.y, this.heartBlue ? '#36e2ff' : '#ff3b5c')
    }

    for (const pt of this.particles) {
      c.globalAlpha = Math.min(1, pt.life / (pt.max * 0.5))
      c.fillStyle = pt.color
      const s = Math.round(pt.size)
      c.fillRect(Math.round(pt.x - s / 2), Math.round(pt.y - s / 2), s, s)
    }
    c.globalAlpha = 1

    for (const t of this.texts) drawText(c, t.text, t.x, t.y, t.size, t.color, this.font, Math.min(1, t.life / (t.max * 0.4)))

    const mx = b.x + b.w / 2
    const my = b.y + b.h / 2
    if (b.h > 60) {
      if (this.mode === 'intro' && this.modeT > 0.6) {
        drawText(c, 'ESQUIVA!', mx, my - 30, 16, '#ffd23f', this.font, Math.min(1, (this.modeT - 0.6) * 3))
        drawText(c, 'WASD / FLECHAS · SHIFT: PRECISIÓN', mx, my + 24, 8, '#f4f4f4', this.font, Math.min(1, (this.modeT - 0.6) * 3))
        drawText(c, 'MÓVIL: ARRASTRA', mx, my + 40, 8, '#999', this.font, Math.min(1, (this.modeT - 0.6) * 3))
      } else if (this.mode === 'break') {
        const a = Math.min(1, this.modeT * 5)
        drawText(c, `ATTACK ${this.attackIndex + 1}/${this.total()}`, mx, b.y + 28, 8, '#ffd23f', this.font, a)
      } else if (this.mode === 'phase') {
        if (this.phase === 4 && !this.phase4Intro) {
          const refuse = Math.min(1, Math.max(0, (this.modeT - 1.4) * 2.4))
          drawText(c, 'BUT IT REFUSED', mx, my - 10, 18 + Math.round(Math.sin(this.time * 12) * 2), '#ff3b5c', this.font, refuse)
          drawText(c, 'EL JEFE FINAL DESPIERTA', mx, my + 24, 8, '#fff', this.font, refuse)
        }
        const phaseAlpha = Math.min(1, this.modeT * 4)
        if (!(this.phase === 4 && this.phase4Intro)) drawText(c, `FASE ${this.phase}`, mx, my - 28, 24, '#ff3b5c', this.font, phaseAlpha)
        if (this.phase === 3) {
          const fusionProgress = Math.min(1, this.modeT / 11.5)
          if (fusionProgress < 0.9) drawText(c, 'FUSIÓN', mx, my + 4, 10, '#ffd23f', this.font, Math.min(1, this.modeT * 2))
          else drawText(c, 'COMBATE FINAL', mx, my + 4, 9, '#f4f4f4', this.font, Math.min(1, (fusionProgress - 0.9) * 10))
        } else {
          drawText(c, 'TRANSICI��N', mx, my + 4, 8, '#f4f4f4', this.font, Math.min(1, this.modeT * 2))
        }
      } else if (this.mode === 'victory') {
        const progress = Math.min(1, this.modeT / 3.2)
        const pulse = Math.abs(Math.sin(this.modeT * 4))
        c.save()
        c.globalAlpha = 0.18 + pulse * 0.12
        c.strokeStyle = '#ffd23f'
        c.lineWidth = 3
        c.beginPath()
        c.arc(mx, my + 12, 28 + progress * Math.min(this.box.w, this.box.h) * 0.42, 0, Math.PI * 2)
        c.stroke()
        c.globalAlpha = 0.1 + progress * 0.18
        c.fillStyle = '#ffd23f'
        c.fillRect(this.box.x, this.box.y, this.box.w, this.box.h)
        c.restore()
        const s = 18 + Math.round(pulse * 6)
        drawText(c, 'VICTORIA!', mx, my - 10, s, '#ffd23f', this.font, Math.min(1, this.modeT * 3))
        drawText(c, 'PARTIDA COMPLETADA', mx, my + 25, 8, '#fff', this.font, Math.min(1, Math.max(0, this.modeT - 0.8) * 2))
      }
    }

    c.restore()
    const screen = this.bossScreen
    if (screen && this.phase <= 2 && !(this.mode === 'defeat' && this.modeT > 0.72)) {
      drawScreenFace(c, screen, {
        time: this.time,
        mood: this.calcMood(),
        state: this.bossState ?? 'idle',
        player: this.player,
        pulse: Math.max(0, ...this.enemies.map((e) => e.pulse)),
      })
    }
    if (this.flash > 0) {
      c.fillStyle = `rgba(${this.flashRGB},${this.flash * 0.35})`
      c.fillRect(0, 0, this.W, this.H)
    }
  }
}
