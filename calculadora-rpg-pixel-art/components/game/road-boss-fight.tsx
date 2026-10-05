'use client'

import { useEffect, useRef, useState } from 'react'

type Phase = 1 | 2

interface RoadBossFightProps {
  muted: boolean
  onFinish: () => void
}

const PHASE_ONE_MS = 31_000
const PHASE_TWO_MS = 58_000

export function RoadBossFight({ muted, onFinish }: RoadBossFightProps) {
  const [phase, setPhase] = useState<Phase>(1)
  const [phaseOneHp, setPhaseOneHp] = useState(100)
  const [transitioning, setTransitioning] = useState(false)
  const [victory, setVictory] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    const audio = new Audio('/sounds/driving_meme.mp3')
    audio.volume = muted ? 0 : 0.5
    audioRef.current = audio
    void audio.play().catch(() => undefined)

    const damageTimer = window.setInterval(() => {
      setPhaseOneHp((hp) => Math.max(0, hp - 4))
    }, 2600)
    const phaseTimer = window.setTimeout(() => {
      audio.pause()
      audio.currentTime = 0
      setPhaseOneHp(0)
      setTransitioning(true)
      window.setTimeout(() => {
        setPhase(2)
        setTransitioning(false)
        const divine = new Audio('/sounds/Asgore_Chad_Meme_angelical.mp3')
        divine.volume = muted ? 0 : 0.5
        audioRef.current = divine
        void divine.play().catch(() => undefined)
        divine.onended = () => {
          setVictory(true)
          window.setTimeout(onFinish, 1800)
        }
      }, 3000)
    }, PHASE_ONE_MS)

    return () => {
      window.clearInterval(damageTimer)
      window.clearTimeout(phaseTimer)
      audio.pause()
      audio.src = ''
    }
  }, [muted, onFinish])

  useEffect(() => {
    if (phase !== 2) return
    const timer = window.setTimeout(() => {
      if (!victory) {
        setVictory(true)
        onFinish()
      }
    }, PHASE_TWO_MS + 500)
    return () => window.clearTimeout(timer)
  }, [phase, victory, onFinish])

  const elapsed = Date.now() - startedAt.current
  const isClimax = phase === 2 && elapsed > PHASE_ONE_MS + 45_000

  return (
    <section className="road-boss-overlay" aria-label="Batalla secreta del conductor">
      <div className="road-boss-box">
        <div className="road-boss-header">
          <span>{phase === 1 ? 'EL CONDUCTOR' : 'ASGORE CHAD ANGELICAL'}</span>
          <span>FASE {phase}/2</span>
        </div>
        <div className="road-boss-arena">
          {transitioning && <div className="divine-flash" aria-hidden />}
          <div className={`road-car road-car-${phase}`} aria-hidden>▰</div>
          <img
            src={phase === 1 ? '/images/asgore_conductor.jpeg' : '/images/asgore_angelical.png'}
            alt={phase === 1 ? 'Asgore conductor' : 'Asgore angelical'}
            className={`road-boss-sprite ${phase === 2 ? 'angelical' : ''} ${victory ? 'disintegrate' : ''}`}
          />
          <div className="road-projectile projectile-a" aria-hidden>{phase === 1 ? '▲' : '✦'}</div>
          <div className="road-projectile projectile-b" aria-hidden>{phase === 1 ? '▰' : '✧'}</div>
          {isClimax && <div className="light-warning" aria-hidden />}
        </div>
        <div className="road-boss-status">
          <span>{phase === 1 ? 'HP' : 'ASCENSIÓN'}</span>
          <div className="road-hp-track"><div className="road-hp-fill" style={{ width: `${phase === 1 ? phaseOneHp : victory ? 0 : 100}%` }} /></div>
          <span className="road-boss-copy">{victory ? '[ASCENSIÓN VIAL]' : phase === 1 ? 'TRÁFICO HOSTIL' : 'CLÍMAX CELESTIAL'}</span>
        </div>
      </div>
    </section>
  )
}
