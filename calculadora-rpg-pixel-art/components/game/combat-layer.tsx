'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { Engine, type EngineEvents, type EnemySpec } from '@/lib/game/engine'

interface CombatLayerProps {
  zoneRef: RefObject<HTMLDivElement | null>
  bossRef: RefObject<HTMLDivElement | null>
  engineRef: RefObject<Engine | null>
  enemies: EnemySpec[]
  events: EngineEvents
}

export function CombatLayer({ zoneRef, bossRef, engineRef, enemies, events }: CombatLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const eventsRef = useRef(events)

  useEffect(() => {
    eventsRef.current = events
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const zone = zoneRef.current
    if (!canvas || !zone) return
    const font =
      getComputedStyle(document.documentElement).getPropertyValue('--font-press').trim() || 'monospace'
    const engine = new Engine(
      canvas,
      zone,
      enemies,
      {
        onHp: (hp) => eventsRef.current.onHp(hp),
        onAttack: (n, total, phase) => eventsRef.current.onAttack(n, total, phase),
        onPhase: (phase) => eventsRef.current.onPhase(phase),
        onShake: () => eventsRef.current.onShake(),
        onVictory: () => eventsRef.current.onVictory(),
        onDefeat: () => eventsRef.current.onDefeat(),
        onRefusal: () => eventsRef.current.onRefusal(),
        onBoss: (state, mood) => eventsRef.current.onBoss?.(state, mood),
      },
      font,
  )
    engine.setBossHost(bossRef.current)
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // Engine is created once per mount; parent remounts via key to restart a battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="combat-build-canvas pointer-events-none fixed inset-0 z-30" style={{ clipPath: 'inset(0)' }} aria-hidden />
}
