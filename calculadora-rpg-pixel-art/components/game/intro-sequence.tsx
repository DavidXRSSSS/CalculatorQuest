'use client'

import { useEffect, useRef, useState } from 'react'

type IntroSequenceProps = { onComplete: () => void }

const INTRO_LINES = [
  'Long ago, two races ruled over Earth: CALCULATORS and DETERMINATION.',
  'But one day, a legendary battle began...',
]

type AudioHandle = { context: AudioContext; master: GainNode }

function createAudioHandle() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass()
  const master = context.createGain(); master.gain.value = 0.08; master.connect(context.destination)
  return { context, master }
}

function playTone(audio: AudioHandle | null, frequency: number, duration: number, type: OscillatorType, volume = 0.12, slide = 0) {
  if (!audio || audio.context.state !== 'running') return
  const now = audio.context.currentTime
  const oscillator = audio.context.createOscillator(); const gain = audio.context.createGain()
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.linearRampToValueAtTime(Math.max(20, frequency + slide), now + duration)
  gain.gain.setValueAtTime(0.001, now); gain.gain.exponentialRampToValueAtTime(volume, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  oscillator.connect(gain); gain.connect(audio.master); oscillator.start(now); oscillator.stop(now + duration + 0.02)
}

export function IntroSequence({ onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<'intro' | 'done'>('intro')
  const [lineIndex, setLineIndex] = useState(0)
  const [visibleLength, setVisibleLength] = useState(0)
  const audioRef = useRef<AudioHandle | null>(null)
  const lastTypedSound = useRef(0)

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioRef.current) audioRef.current = createAudioHandle()
      void audioRef.current?.context.resume()
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    return () => { window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio) }
  }, [])

  useEffect(() => {
    if (phase === 'intro' && visibleLength > 0 && performance.now() - lastTypedSound.current > 28) {
      lastTypedSound.current = performance.now(); playTone(audioRef.current, 170 + (visibleLength % 4) * 24, 0.045, 'square', 0.045, -45)
    }
  }, [phase, visibleLength])

  useEffect(() => {
    if (phase !== 'intro') return
    const line = INTRO_LINES[lineIndex]
    if (visibleLength < line.length) {
      const timer = window.setTimeout(() => setVisibleLength((length) => length + 1), 26)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      if (lineIndex < INTRO_LINES.length - 1) {
        setLineIndex((index) => index + 1)
        setVisibleLength(0)
      } else {
        playTone(audioRef.current, 72, 0.72, 'sine', 0.12, 760)
        playTone(audioRef.current, 180, 0.34, 'triangle', 0.06, 520)
        setPhase('done')
      }
    }, lineIndex === 0 ? 850 : 1200)
    return () => window.clearTimeout(timer)
  }, [lineIndex, phase, visibleLength])



  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(onComplete, 1050)
    return () => window.clearTimeout(timer)
  }, [onComplete, phase])

  const currentLine = INTRO_LINES[lineIndex]

  return (
    <main className={`intro-sequence intro-sequence--${phase}`} aria-label="Game introduction">
      {(phase === 'intro' || phase === 'done') && (
        <div className={`intro-story ${phase === 'done' ? 'intro-story--impact' : ''}`} aria-live="polite">
          <p>{currentLine.slice(0, visibleLength)}<span className="intro-caret" aria-hidden="true">_</span></p>
          <span className="sr-only">{currentLine}</span>
        </div>
      )}


    </main>
  )
}
