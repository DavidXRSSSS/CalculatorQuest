'use client'

import { useEffect, useRef } from 'react'

type SoulCanvasProps = { active: boolean }

type Particle = { angle: number; radius: number; speed: number; size: number; hue: number; phase: number }

export function SoulCanvas({ active }: SoulCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    const particles: Particle[] = Array.from({ length: 110 }, (_, index) => ({
      angle: (index / 110) * Math.PI * 2,
      radius: 46 + (index % 11) * 9 + Math.random() * 22,
      speed: 0.25 + Math.random() * 0.8,
      size: 1 + Math.random() * 2.7,
      hue: index % 3 === 0 ? 348 : index % 3 === 1 ? 316 : 190,
      phase: Math.random() * Math.PI * 2,
    }))
    let frame = 0
    let last = performance.now()
    let beat = 0
    let shock = 0
    let nextLightning = 0

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const drawLightning = (now: number, cx: number, cy: number, w: number, h: number) => {
      if (now < nextLightning) return
      nextLightning = now + 160 + Math.random() * 480
      const angle = Math.random() * Math.PI * 2
      const length = Math.max(w, h) * (0.42 + Math.random() * 0.42)
      context.save(); context.strokeStyle = Math.random() > .35 ? '#36e2ff' : '#ff4f9a'; context.globalAlpha = .5 + Math.random() * .45; context.lineWidth = 1.5; context.shadowBlur = 9; context.shadowColor = context.strokeStyle; context.beginPath(); context.moveTo(cx, cy)
      for (let step = 1; step <= 8; step++) { const t = step / 8; const jitter = (Math.random() - .5) * 20; context.lineTo(cx + Math.cos(angle) * length * t + Math.cos(angle + Math.PI / 2) * jitter, cy + Math.sin(angle) * length * t + Math.sin(angle + Math.PI / 2) * jitter) }
      context.stroke(); context.restore()
    }

    const draw = (timestamp: number) => {
      const now = timestamp / 1000
      const dt = Math.min(.05, (timestamp - last) / 1000); last = timestamp
      const rect = canvas.getBoundingClientRect(); const w = rect.width; const h = rect.height; const cx = w / 2; const cy = h / 2
      context.fillStyle = '#020207'; context.fillRect(0, 0, w, h)
      const pulse = 1 + Math.max(0, Math.sin(now * 5.1)) ** 18 * .26
      const plasma = context.createRadialGradient(cx, cy, 8, cx, cy, 180)
      plasma.addColorStop(0, `rgba(255,48,79,${.28 * pulse})`); plasma.addColorStop(.36, `rgba(255,45,154,${.18 * pulse})`); plasma.addColorStop(.7, 'rgba(54,226,255,.07)'); plasma.addColorStop(1, 'transparent')
      context.fillStyle = plasma; context.fillRect(0, 0, w, h)
      if (Math.sin(now * 5.1) > .985) { shock = 1; beat = now }
      if (shock > 0) { const radius = (1 - shock) * Math.max(w, h) * 0.7; context.save(); context.globalAlpha = shock * .42; context.lineWidth = 2 + shock * 4; context.strokeStyle = '#ff3b5c'; context.shadowBlur = 18; context.shadowColor = '#36e2ff'; context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke(); context.restore(); shock = Math.max(0, shock - dt * .9) }
      drawLightning(timestamp, cx, cy, w, h)
      for (const particle of particles) { particle.angle += dt * particle.speed; const wave = Math.sin(now * 3.3 + particle.phase) * 10; const radius = particle.radius + wave + Math.sin(now * 1.7 + particle.phase) * 7; const x = cx + Math.cos(particle.angle) * radius; const y = cy + Math.sin(particle.angle) * radius; context.fillStyle = `hsla(${particle.hue}, 100%, 66%, ${.38 + .52 * Math.abs(Math.sin(now * 2 + particle.phase))})`; context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size * (1.5 + Math.abs(Math.sin(particle.phase)))) }
      const heartScale = pulse * (1 + Math.sin(now * 7) * .025)
      context.save(); context.translate(cx, cy); context.scale(heartScale, heartScale); context.rotate(-Math.PI / 4); context.fillStyle = '#ff304f'; context.shadowBlur = 20; context.shadowColor = '#ff304f'; context.fillRect(-15, -15, 30, 30); context.beginPath(); context.arc(0, -15, 15, 0, Math.PI * 2); context.arc(15, 0, 15, 0, Math.PI * 2); context.fill(); context.restore()
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [active])

  return <canvas ref={canvasRef} className="soul-canvas" aria-label="Determinación cargándose" />
}
