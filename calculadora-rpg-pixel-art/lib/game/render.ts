import type { Beam, Bullet, Enemy, Vec } from './types'

type Ctx = CanvasRenderingContext2D

const HEART = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
]

export function drawHeart(c: Ctx, x: number, y: number, color: string, px = 2) {
  const ox = Math.round(x - (HEART[0].length * px) / 2)
  const oy = Math.round(y - (HEART.length * px) / 2)
  c.fillStyle = color
  for (let r = 0; r < HEART.length; r++) {
    for (let col = 0; col < HEART[r].length; col++) {
      if (HEART[r][col] === 'X') c.fillRect(ox + col * px, oy + r * px, px, px)
    }
  }
}

export function drawText(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  font: string,
  alpha = 1,
) {
  c.save()
  c.globalAlpha = alpha
  c.font = `${size}px ${font}`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineJoin = 'miter'
  c.lineWidth = Math.max(3, size / 4)
  c.strokeStyle = '#000'
  c.strokeText(text, Math.round(x), Math.round(y))
  c.fillStyle = color
  c.fillText(text, Math.round(x), Math.round(y))
  c.restore()
}

const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['00100', '00100', '11111', '00100', '00100'],
  '-': ['00000', '00000', '11111', '00000', '00000'],
  '×': ['10001', '01010', '00100', '01010', '10001'],
  '÷': ['00100', '00000', '11111', '00000', '00100'],
  '=': ['00000', '11111', '00000', '11111', '00000'],
  C: ['111', '100', '100', '100', '111'],
  '.': ['0', '0', '0', '0', '1'],
}

export function drawGlyph(c: Ctx, ch: string, x: number, y: number, px: number, color: string, outline?: string) {
  const rows = GLYPHS[ch] ?? GLYPHS['8']
  const w = rows[0].length * px
  const h = rows.length * px
  const ox = Math.round(x - w / 2)
  const oy = Math.round(y - h / 2)
  const paint = (dx: number, dy: number) => {
    for (let r = 0; r < rows.length; r++) {
      for (let col = 0; col < rows[r].length; col++) {
        if (rows[r][col] === '1') c.fillRect(ox + dx + col * px, oy + dy + r * px, px, px)
      }
    }
  }
  if (outline) {
    c.fillStyle = outline
    for (const [dx, dy] of [[-px, 0], [px, 0], [0, -px], [0, px]]) paint(dx, dy)
  }
  c.fillStyle = color
  paint(0, 0)
}

function drawBone(c: Ctx, x: number, y: number, len: number, r: number, vertical: boolean, color: string) {
  const t = Math.max(2, Math.round(r * 0.75))
  const knob = Math.max(3, Math.round(r))
  const L = Math.round(len)
  c.save()
  c.translate(x, y)
  if (!vertical) c.rotate(Math.PI / 2)
  c.fillStyle = '#000'
  c.fillRect(-t - 1, -L, t * 2 + 2, L * 2)
  c.fillStyle = color
  c.fillRect(-t, -L + knob, t * 2, L * 2 - knob * 2)
  for (const end of [-1, 1]) {
    const ey = end < 0 ? -L : L - knob * 2
    c.fillStyle = '#000'
    c.fillRect(-knob - 2, ey - 1, knob * 2 + 4, knob * 2 + 2)
    c.fillStyle = color
    c.fillRect(-knob - 1, ey, knob, knob * 2)
    c.fillRect(1, ey, knob, knob * 2)
    c.fillRect(-knob + 1, ey + 1, knob * 2 - 2, knob * 2 - 2)
  }
  c.fillStyle = 'rgba(0,0,0,0.25)'
  c.fillRect(t - 2, -L + knob, 2, L * 2 - knob * 2)
  c.restore()
}

export function drawBullet(c: Ctx, b: Bullet, font: string) {
  c.imageSmoothingEnabled = false
  const x = Math.round(b.x)
  const y = Math.round(b.y)
  const r = Math.max(2, Math.round(b.r))
  if (b.kind === 'glyph') {
    drawText(c, b.text ?? '?', x, y + 1, b.r >= 11 ? 24 : 16, b.color, font)
    return
  }
  if (b.kind === 'symbol' || b.kind === 'digit') {
    const px = b.kind === 'symbol' ? Math.max(2, Math.round(r / 2.6)) : Math.max(2, Math.round(r / 2.4))
    drawGlyph(c, b.text ?? '+', x, y, px, b.color, '#000')
    return
  }
  if (b.kind === 'bone' && b.len) {
    drawBone(c, x, y, b.len, r, b.vertical ?? true, b.color)
    return
  }
  c.fillStyle = b.color
  if (b.kind === 'bone') {
    const horizontal = Math.abs(b.vx) >= Math.abs(b.vy)
    const length = Math.max(16, r * 4)
    const thickness = Math.max(3, Math.round(r * 0.55))
    if (horizontal) {
      c.fillRect(x - length, y - thickness, length * 2, thickness * 2)
      c.fillRect(x - length, y - r * 1.5, r * 1.5, r * 3)
      c.fillRect(x + length - r * 1.5, y - r * 1.5, r * 1.5, r * 3)
    } else {
      c.fillRect(x - thickness, y - length, thickness * 2, length * 2)
      c.fillRect(x - r * 1.5, y - length, r * 3, r * 1.5)
      c.fillRect(x - r * 1.5, y + length - r * 1.5, r * 3, r * 1.5)
    }
    return
  }
  if (b.kind === 'orb') {
    const half = Math.max(1, Math.round(r / 2))
    c.fillRect(x - r, y - half, r * 2, half * 2)
    c.fillRect(x - half, y - r, half * 2, r * 2)
    c.fillStyle = '#fff'
    c.fillRect(x - 1, y - 1, 2, 2)
  } else {
    c.fillRect(x - r, y - r, r * 2, r * 2)
    c.fillStyle = 'rgba(255,255,255,0.85)'
    c.fillRect(x - r, y - r, Math.max(1, r - 1), Math.max(1, r - 1))
  }
}

/** Undertale-style telegraph: a blinking red line along the exact path of the incoming beam. */
function drawWarningLine(c: Ctx, bm: Beam, len: number) {
  const blink = Math.floor(bm.age * 20) % 2 === 0
  const half = Math.round(bm.thick / 2)
  c.fillStyle = blink ? 'rgba(255,40,60,0.22)' : 'rgba(255,40,60,0.08)'
  c.fillRect(0, -half, len, half * 2)
  c.fillStyle = blink ? '#ff2a3c' : 'rgba(255,42,60,0.55)'
  c.fillRect(0, -half, len, 2)
  c.fillRect(0, half - 2, len, 2)
  c.fillRect(0, -1, len, 2)
}

function drawGasterBeam(c: Ctx, bm: Beam, time: number) {
  const ang = Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1)
  const len = Math.hypot(bm.x2 - bm.x1, bm.y2 - bm.y1)
  c.save()
  c.translate(Math.round(bm.x1), Math.round(bm.y1))
  c.rotate(ang)
  if (bm.age < bm.warn) {
    const k = bm.age / Math.max(0.01, bm.warn)
    drawWarningLine(c, bm, len)
    c.fillStyle = '#fff'
    const orb = Math.round(3 + k * 7)
    c.fillRect(6, -orb, orb * 2, orb * 2)
  } else {
    const k = (bm.age - bm.warn) / bm.dur
    const fade = k > 1 ? Math.max(0, 1 - (k - 1) * 6) : 1
    const grow = k < 0.12 ? k / 0.12 : 1
    const flicker = Math.floor(time * 30) % 2 ? 2 : 0
    const th = Math.round(bm.thick * grow * fade) + flicker
    const step = Math.max(2, Math.round(th / 6))
    c.fillStyle = 'rgba(255,255,255,0.28)'
    c.fillRect(0, -Math.round(th / 2) - step, len, th + step * 2)
    c.fillStyle = '#e8e8ff'
    c.fillRect(0, -Math.round(th / 2), len, th)
    c.fillStyle = '#fff'
    c.fillRect(0, -Math.round(th / 3), len, Math.round((th * 2) / 3))
  }
  c.restore()
}

export function drawGasterHead(c: Ctx, bm: Beam, time: number) {
  const ang = Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1)
  const charging = bm.age < bm.warn
  const firing = !charging && (bm.age - bm.warn) / bm.dur <= 1.05
  const slide = charging ? Math.round((1 - bm.age / Math.max(0.01, bm.warn)) * -18) : firing ? -Math.round(Math.sin(time * 60) * 1) - 4 : -8
  const open = firing ? 5 : charging ? Math.round((bm.age / Math.max(0.01, bm.warn)) * 2) : 0
  const px = Math.max(2, Math.round(bm.thick / 12))
  const P = (x: number, y: number, w: number, h: number) => c.fillRect(x * px, y * px, w * px, h * px)
  c.save()
  c.translate(Math.round(bm.x1) + Math.round(Math.cos(ang) * slide), Math.round(bm.y1) + Math.round(Math.sin(ang) * slide))
  c.rotate(ang)
  c.imageSmoothingEnabled = false
  const eye = charging ? (Math.floor(bm.age * 30) % 2 ? '#36e2ff' : '#fff') : '#36e2ff'
  for (const side of [-1, 1]) {
    c.save()
    c.translate(0, side * open)
    c.scale(1, side)
    c.fillStyle = '#000'
    P(-15, -9, 17, 10)
    P(-19, -11, 6, 4)
    c.fillStyle = '#f4f4f4'
    P(-14, -8, 15, 8)
    P(-18, -10, 5, 3)
    P(1, -5, 3, 5)
    c.fillStyle = '#b8b8c8'
    P(-14, -1, 15, 1)
    c.fillStyle = '#000'
    P(-9, -6, 4, 3)
    P(-2, -2, 1, 2)
    P(1, -1, 1, 1)
    P(3, -1, 1, 1)
    c.fillStyle = eye
    P(-8, -5, 2, 1)
    c.restore()
  }
  c.restore()
}

export function drawBeam(c: Ctx, bm: Beam, time: number) {
  if (bm.visual === 'gaster') { drawGasterBeam(c, bm, time); return }
  const ang = Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1)
  const len = Math.hypot(bm.x2 - bm.x1, bm.y2 - bm.y1)
  c.save()
  c.translate(Math.round(bm.x1), Math.round(bm.y1))
  c.rotate(ang)
  const active = bm.age >= bm.warn
  if (!active) {
    drawWarningLine(c, bm, len)
  } else {
    const k = (bm.age - bm.warn) / bm.dur
    const fade = k > 1 ? Math.max(0, 1 - (k - 1) * 6) : 1
    const grow = k < 0.15 ? k / 0.15 : 1
    const th = bm.thick * grow * fade * (1 + Math.sin(time * 60) * 0.08)
    c.fillStyle = bm.color
    c.fillRect(0, -th / 2, len, th)
    c.fillStyle = '#fff'
    c.fillRect(0, -th / 4, len, th / 2)
  }
  if (bm.visual === 'blaster' || bm.warnOnly) { c.restore(); return }
  // Cannon head: an original pixel "key" turret that opens its jaw when firing.
  const open = active ? 6 : 0
  c.fillStyle = '#000'
  c.fillRect(-16, -12 - open, 22, 24 + open * 2)
  c.fillStyle = bm.color
  c.fillRect(-16, -12 - open, 22, 3)
  c.fillRect(-16, 9 + open, 22, 3)
  c.fillRect(-16, -12 - open, 3, 24 + open * 2)
  c.fillRect(3, -12 - open, 3, 8)
  c.fillRect(3, 4 + open, 3, 8)
  c.fillStyle = '#fff'
  c.fillRect(-10, -7 - open, 4, 4)
  c.fillRect(-10, 3 + open, 4, 4)
  c.restore()
}

export function drawBlasterVisual(c: Ctx, bm: Beam, time: number) {
  const angle = Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1)
  const active = bm.age >= bm.warn
  const pulse = active ? Math.sin(time * 18) * 2 : 0
  c.save(); c.translate(Math.round(bm.x1), Math.round(bm.y1)); c.rotate(angle)
  c.imageSmoothingEnabled = false
  c.fillStyle = '#05050b'; c.fillRect(-24, -20 - Math.round(pulse), 34, 40 + Math.round(pulse * 2))
  c.fillStyle = bm.color; c.fillRect(-24, -20 - pulse, 34, 5); c.fillRect(-24, 15 + pulse, 34, 5); c.fillRect(-24, -20 - pulse, 5, 40 + pulse * 2)
  c.fillStyle = '#10101c'; c.fillRect(-14, -12 - pulse, 20, 24 + pulse * 2)
  c.fillStyle = active ? '#fff' : '#ffd23f'; c.fillRect(2, -5 - pulse, 13, 10 + pulse * 2)
  c.fillStyle = bm.color; c.fillRect(13, -3 - pulse, 8, 6 + pulse * 2)
  c.fillStyle = '#fff'; c.fillRect(-17, -14 - pulse, 4, 4); c.fillRect(-17, 10 + pulse, 4, 4)
  c.restore()
}

export function drawBossArms(c: Ctx, cx: number, cy: number, arena: { x: number; y: number; w: number; h: number }, time: number, color: string, attack = '', attackT = 0) {
  const phase = Math.min(1, attackT / 1.2)
  const active = attackT > 0.9
  const leftShoulder = { x: cx - 42, y: cy + 8 }
  const rightShoulder = { x: cx + 42, y: cy + 8 }
  const side = attack.includes('left') ? -1 : 1
  const sweep = attack.includes('sweep') || attack.includes('arena-compression') ? Math.min(arena.w * 0.62, 290) * Math.sin(Math.min(1, attackT / 2.4) * Math.PI) : 0
  const slam = attack.includes('impact') || attack.includes('pulse') ? Math.min(arena.h * 0.52, 230) * Math.sin(Math.min(1, attackT / 1.5) * Math.PI) : 0
  const drawArm = (shoulder: { x: number; y: number }, handX: number, handY: number, flip: number, glow: boolean) => {
    const dx = handX - shoulder.x
    const dy = handY - shoulder.y
    const length = Math.hypot(dx, dy)
    const ang = Math.atan2(dy, dx)
    c.save()
    c.translate(shoulder.x, shoulder.y)
    c.rotate(ang)
    c.scale(flip, 1)
    c.fillStyle = '#05050b'
    c.fillRect(0, -18, length, 36)
    c.fillStyle = color
    c.fillRect(0, -12, length, 24)
    c.fillStyle = glow ? '#fff' : '#10101c'
    c.fillRect(12, -5, Math.max(4, length - 26), 7)
    c.fillStyle = color
    c.fillRect(length - 22, -28, 42, 56)
    c.fillStyle = '#05050b'
    c.fillRect(length - 12, -24, 22, 48)
    for (let finger = 0; finger < 4; finger++) c.fillRect(length + 14 + finger * 7, -20 + finger * 10, 24, 6)
    c.restore()
  }
  const idle = Math.sin(time * 3) * 8
  drawArm(leftShoulder, cx - 116, cy + 24 + idle, -1, false)
  drawArm(rightShoulder, cx + 116, cy + 24 - idle, 1, false)
  if (attack.includes('sweep') || attack.includes('compression')) {
    const hx = cx + side * (90 + sweep)
    drawArm(side < 0 ? leftShoulder : rightShoulder, hx, arena.y + arena.h * 0.52, side, active)
  } else if (attack.includes('impact') || attack.includes('pulse')) {
    const hx = cx + side * (90 + sweep)
    drawArm(side < 0 ? leftShoulder : rightShoulder, hx, arena.y + arena.h * 0.52, side, active)
  } else if (attack.includes('slam')) {
    drawArm(leftShoulder, cx - 34, arena.y - 20 + slam, -1, active)
    drawArm(rightShoulder, cx + 34, arena.y - 20 + slam, 1, active)
  } else if (attack.includes('double')) {
    const gap = Math.max(28, arena.w * 0.08) + Math.sin(attackT * 5) * 18
    drawArm(leftShoulder, cx - gap, arena.y + arena.h * 0.52, -1, active)
    drawArm(rightShoulder, cx + gap, arena.y + arena.h * 0.52, 1, active)
  }
  if (attack && active) {
    c.save()
    c.globalAlpha = 0.55 + Math.sin(time * 18) * 0.2
    c.strokeStyle = '#ffd23f'
    c.lineWidth = 3
    c.setLineDash([8, 6])
    c.strokeRect(arena.x + 8, arena.y + 8, arena.w - 16, arena.h - 16)
    c.restore()
  }
}

export function drawHands(c: Ctx, cx: number, cy: number, spread: number, time: number, color: string, attacking: boolean) {
  const pulse = 1 + Math.sin(time * 5) * 0.08
  for (const side of [-1, 1]) {
    const x = cx + side * spread
    const y = cy + Math.sin(time * 3 + side) * 12
    const punch = attacking ? Math.sin(time * 18) * 12 : 0
    c.save()
    c.translate(Math.round(x - side * punch), Math.round(y))
    c.scale(side * pulse, pulse)
    c.fillStyle = '#000'
    c.fillRect(-18, -28, 36, 56)
    c.fillStyle = color
    c.fillRect(-14, -24, 28, 48)
    c.fillStyle = '#000'
    c.fillRect(-8, -20, 16, 40)
    c.fillStyle = '#fff'
    c.fillRect(-5, -13, 5, 5)
    c.fillRect(2, -13, 5, 5)
    c.fillStyle = color
    for (let i = 0; i < 4; i++) c.fillRect(-18 - i * 4, -18 + i * 10, 12, 4)
    c.restore()
  }
}

export function drawRefusal(c: Ctx, x: number, y: number, time: number, progress: number) {
  const broken = progress < .48
  c.save(); c.translate(Math.round(x), Math.round(y)); c.globalAlpha = Math.min(1, .3 + Math.sin(time * 8) * .18 + progress)
  c.strokeStyle = broken ? '#fff' : '#ffd23f'; c.lineWidth = 3; c.setLineDash([5, 4]); c.beginPath(); c.arc(0, 0, 26 + Math.sin(time * 10) * 4, 0, Math.PI * 2); c.stroke()
  c.fillStyle = broken ? '#fff' : '#ff3b5c'
  const shards = broken ? [[-12, -8], [8, -10], [-8, 12], [12, 9]] : [[0, 0]]
  for (const [sx, sy] of shards) { c.save(); c.translate(sx * (1 - progress), sy * (1 - progress)); c.rotate(time * 2 + sx); c.fillRect(-3, -8, 6, 16); c.fillRect(-8, -3, 16, 6); c.restore() }
  c.restore()
}

export function drawSansBoss(c: Ctx, e: Enemy, font: string, time: number, player: Vec, arena: { x: number; y: number; w: number; h: number }, attack = '', attackT = 0, reveal = 1) {
  const bob = Math.sin(time * 3.2) * 3; const blink = Math.sin(time * 2.4) > .86; const eye = attack ? (Math.floor(time * 8) % 3 === 0 ? '#fff' : '#36e2ff') : '#fff'
  c.save(); c.globalAlpha = reveal; c.translate(Math.round(e.x), Math.round(e.y + bob));
  c.fillStyle = '#0b1020'; c.fillRect(-50, 12, 100, 82); c.fillStyle = '#202b4a'; c.fillRect(-42, 20, 84, 68); c.fillStyle = '#fff'; c.fillRect(-42, 78, 84, 8)
  c.fillStyle = '#f4f4f4'; c.beginPath(); c.arc(0, -20, 48, 0, Math.PI * 2); c.fill(); c.fillStyle = '#080812'; c.fillRect(-28, -30, 20, 10); c.fillRect(8, -30, 20, 10); c.fillStyle = blink ? '#080812' : eye; c.fillRect(-20, -28, 8, 8); c.fillRect(12, -28, 8, 8)
  c.fillStyle = '#080812'; c.fillRect(-25, -4, 50, 5); c.fillStyle = '#f4f4f4'; c.fillRect(-15, 0, 5, 6); c.fillRect(10, 0, 5, 6)
  c.fillStyle = '#fff'; c.fillRect(-44, 20, 12, 34); c.fillRect(32, 20, 12, 34); c.fillStyle = '#202b4a'; c.fillRect(-50, 12, 16, 15); c.fillRect(34, 12, 16, 15)
  c.fillStyle = '#ffd23f'; c.font = `16px ${font}`; c.textAlign = 'center'; c.fillText(e.label, 0, 58)
  if (attack) { c.strokeStyle = eye; c.lineWidth = 3; c.globalAlpha = .65; c.strokeRect(arena.x - e.x + 8, arena.y - e.y + 8, arena.w - 16, arena.h - 16) }
  c.restore()
}

export function drawFinalBoss(c: Ctx, e: Enemy, font: string, time: number, player: Vec, arena: { x: number; y: number; w: number; h: number }, attack = '', attackT = 0, reveal = 1) {
  const cx = e.x
  const cy = e.y + Math.sin(time * 1.4) * 3
  const rage = Math.min(1, attackT / 1.4)
  const unstable = 1 + Math.sin(time * 7) * 0.025 + rage * 0.08
  const lookX = Math.max(-1, Math.min(1, (player.x - cx) / 180))
  const lookY = Math.max(-1, Math.min(1, (player.y - cy) / 180))
  c.save(); c.globalAlpha = Math.min(1, reveal * 1.3); c.translate(cx, cy); c.scale(unstable, unstable)
  c.fillStyle = 'rgba(255,59,92,.12)'; c.beginPath(); c.arc(0, 8, 155 + Math.sin(time * 2) * 8, 0, Math.PI * 2); c.fill()
  for (let i = 0; i < 12; i++) { const a = time * (0.35 + i * .01) + i * Math.PI / 6; const r = 112 + Math.sin(time * 2 + i) * 18; c.fillStyle = i % 3 === 0 ? '#ffd23f' : '#ff3b5c'; c.fillRect(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 5, 5) }
  const stretch = 1 + rage * .2
  c.fillStyle = '#030308'; c.fillRect(-86, -82, 172, 158 * stretch)
  c.fillStyle = '#8f1d2d'; c.fillRect(-80, -76, 160, 146 * stretch)
  c.fillStyle = '#2b080e'; c.fillRect(-72, -68, 144, 136 * stretch)
  c.fillStyle = '#ffd23f'; c.fillRect(-58, -64, 116, 5); c.fillRect(-64, 56, 128, 5)
  c.fillStyle = '#090914'; c.fillRect(-61, -40, 122, 91 * stretch)
  c.fillStyle = '#05050b'; c.fillRect(-74, -98, 22, 32); c.fillRect(52, -98, 22, 32)
  c.fillStyle = '#ffd23f'; c.fillRect(-70, -102, 14, 8); c.fillRect(56, -102, 14, 8)
  c.fillStyle = '#ff3b5c'; c.fillRect(-66, -94, 10, 20); c.fillRect(56, -94, 10, 20)
  c.fillStyle = '#ff3b5c'; c.fillRect(-45, -26, 12, 68); c.fillRect(33, -34, 12, 78)
  c.fillStyle = '#fff'; c.font = `42px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e.label, 0, 30)
  c.fillStyle = '#fff'; c.fillRect(-43, -49, 31, 22); c.fillRect(12, -49, 31, 22)
  c.fillStyle = '#05050b'; c.fillRect(-34 + lookX * 6, -44 + lookY * 5, 12, 12); c.fillRect(21 + lookX * 6, -44 + lookY * 5, 12, 12)
  c.fillStyle = '#ff3b5c'; c.fillRect(-53, -18, 106, 10); c.fillStyle = '#000'; c.fillRect(-45, -15, 90, 4)
  c.fillStyle = rage > .35 ? '#fff' : '#ff3b5c'; c.fillRect(-43, -49, 31, 22); c.fillRect(12, -49, 31, 22)
  c.fillStyle = '#ff0038'; c.fillRect(-34 + lookX * 6, -44 + lookY * 5, 12, 12); c.fillRect(21 + lookX * 6, -44 + lookY * 5, 12, 12)
  c.fillStyle = '#ffd23f'; for (let tooth = 0; tooth < 9; tooth++) c.fillRect(-42 + tooth * 10, -8, 5, 8)
  c.fillStyle = '#ffd23f'; c.fillRect(-12, -2, 24, 5)
  const hand = (side: number, y: number, open: boolean) => { const sx = side * 84; const heavy = attack.includes('impact') || attack.includes('compression') || attack.includes('pulse'); const hx = side * (145 + (heavy ? Math.sin(Math.min(1, attackT / 1.6) * Math.PI) * 95 : 0)); c.save(); c.translate(sx, y); c.rotate(side * (rage * .35 + Math.sin(time * 1.8) * .08)); c.fillStyle = '#030308'; c.fillRect(0, -14, hx * side - sx * side, 28); c.fillStyle = '#ff3b5c'; c.fillRect(0, -9, hx * side - sx * side, 18); c.translate(hx - sx, 0); c.fillStyle = '#030308'; c.fillRect(-25, -31, 50, 62); c.fillStyle = '#ffd23f'; c.fillRect(-19, -25, 38, 50); c.fillStyle = '#ff3b5c'; c.fillRect(-9, -20, 18, 40); for (let i = 0; i < 6; i++) { const finger = open ? Math.sin(time * 3 + i) * 8 : 0; c.fillRect(-15 + i * 6, 22 + finger, 4, 32 + rage * 15) } c.restore() }
  hand(-1, -4 + Math.sin(time * 1.7) * 8, !attack); hand(1, 3 - Math.sin(time * 1.7) * 8, !attack)
  c.strokeStyle = '#ffd23f'; c.lineWidth = 2; c.setLineDash([4, 5]); c.beginPath(); c.arc(0, 92, 116 + Math.sin(time * 2) * 4, 0, Math.PI * 2); c.stroke(); c.setLineDash([])
  c.fillStyle = '#ffd23f'; c.font = `12px ${font}`; c.fillText('∑ 666 ÷ 0 π ∞', 0, 112)
  for (let i = 0; i < 5; i++) { const x = -102 + i * 51; c.fillStyle = i % 2 ? '#ffd23f' : '#ff3b5c'; c.fillRect(x, 78 + Math.sin(time * 2 + i) * 8, 9, 9) }
  for (let i = 0; i < 8; i++) { const x = -72 + i * 21; const y = 78 - ((time * (18 + i * 2) + i * 17) % 54); c.fillStyle = i % 2 ? '#ff3b5c' : '#ffd23f'; c.fillRect(Math.round(x + Math.sin(time * 3 + i) * 5), Math.round(y), 4, 4) }
  c.restore()
  if (rage > .35) { c.save(); c.globalAlpha = .3 + rage * .4; c.strokeStyle = '#ff0038'; c.lineWidth = 3; c.setLineDash([8, 5]); c.strokeRect(arena.x + 8, arena.y + 8, arena.w - 16, arena.h - 16); c.fillStyle = '#fff'; for (let i = 0; i < 5; i++) c.fillRect(-48 + i * 22, -58 + ((i + Math.floor(time * 12)) % 3) * 3, 12, 2); c.restore() }
}
