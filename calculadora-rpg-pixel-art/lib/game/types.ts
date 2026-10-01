import type { SfxName } from './audio'

/** Visual size of the soul sprite (7x6 pixel heart drawn at 2px). */
export const SOUL_SIZE = 14
/** Collision radius: 30% smaller than the sprite's visual radius (Touhou-style graze hitbox). */
export const SOUL_HIT_R = (SOUL_SIZE / 2) * 0.7
/** Minimum clear space (edge to edge) every pattern must leave open: 1.5x the soul. */
export const MIN_GAP = SOUL_SIZE * 1.5
/** Minimum telegraph time before beams and fast bursts become active. */
export const MIN_WARN = 0.3
/** Global projectile density multiplier (-25%). */
export const DENSITY = 0.75
/** Base soul speed, used to keep gap shifts between consecutive walls reachable. */
export const SOUL_SPEED = 225
export const IFRAMES = 0.5
/** Seconds the soul blinks after appearing in the battle box (visual only, no invulnerability). */
export const SPAWN_BLINK = 0.8

export interface Vec {
  x: number
  y: number
}

export interface Player extends Vec {
  hp: number
  maxHp: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type BulletKind = 'sq' | 'orb' | 'glyph' | 'bone' | 'symbol' | 'digit'

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
  dmg: number
  kind: BulletKind
  text?: string
  bounces: number
  inside: boolean
  age: number
  life: number
  grazed: boolean
  dead: boolean
  wave?: { amp: number; freq: number; base: number; phase: number }
  /** Half-length of a bone shaft; bones with `len` collide as capsules instead of circles. */
  len?: number
  vertical?: boolean
}

export type BulletInit = Partial<Bullet> & { x: number; y: number }

export interface Beam {
  x1: number
  y1: number
  x2: number
  y2: number
  thick: number
  warn: number
  dur: number
  age: number
  dmg: number
  color: string
  fired: boolean
  dead: boolean
  visual?: 'blaster' | 'gaster'
  /** Pure warning line: blinks for `warn` seconds and never deals damage. */
  warnOnly?: boolean
}

export type BeamInit = Omit<Beam, 'age' | 'fired' | 'dead'>

export interface Enemy {
  label: string
  value: number
  tier: number
  color: string
  u: number
  x: number
  y: number
  pulse: number
  alive: boolean
  seed: number
  enter: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  g: number
}

export interface FloatText {
  x: number
  y: number
  vy: number
  text: string
  life: number
  max: number
  color: string
  size: number
}

export interface Marker {
  x: number
  y: number
  life: number
  max: number
  color: string
}

export interface AttackHost {
  box: Box
  player: Vec
  rng: () => number
  spawn(b: BulletInit): void
  beam(b: BeamInit): void
  marker(x: number, y: number, dur: number, color: string): void
  telegraph(x1: number, y1: number, x2: number, y2: number, thick: number, dur: number): void
  emitFrom(e: Enemy): Vec
  sound(name: SfxName): void
}

export interface Attack {
  name: string
  label: string
  enemy: Enemy
  duration: number
  update(t: number, dt: number): void
}
