'use client'

import { useEffect, useRef, useState } from 'react'
import { sfx } from '@/lib/game/audio'
import { cn } from '@/lib/utils'
import { useTypewriter } from './use-typewriter'

type Phase = 'freeze' | 'crack' | 'shatter' | 'screen'
type Choice = 'retry' | 'exit'

const HEART = [
  '.XXX...XXX.',
  'XXXXX.XXXXX',
  'XXXXXXXXXXX',
  'XXXXXXXXXXX',
  'XXXXXXXXXXX',
  '.XXXXXXXXX.',
  '..XXXXXXX..',
  '...XXXXX...',
  '....XXX....',
  '.....X.....',
]
const CRACK_COLUMN = [5, 5, 4, 6, 4, 6, 5, 4, 5, 5]
const PX = 3
const HEART_W = HEART[0].length * PX
const HEART_H = HEART.length * PX
const MESSAGE = '¡No te rindas! ¡Aún puedes corregir la ecuación!'

function heartCells(part: 'whole' | 'left' | 'right') {
  const cells: { x: number; y: number }[] = []
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'X') continue
      const split = CRACK_COLUMN[y]
      if (part === 'left' && x >= split) continue
      if (part === 'right' && x <= split) continue
      cells.push({ x, y })
    }
  })
  return cells
}

function PixelHeart({ part = 'whole', className }: { part?: 'whole' | 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${HEART[0].length} ${HEART.length}`}
      width={HEART_W}
      height={HEART_H}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {heartCells(part).map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#ff0000" />
      ))}
    </svg>
  )
}

export function GameOver({
  soul,
  onRetry,
  onExit,
}: {
  soul: { x: number; y: number } | null
  onRetry: () => void
  onExit: () => void
}) {
  const [phase, setPhase] = useState<Phase>('freeze')
  const [typeKey, setTypeKey] = useState(0)
  const [choice, setChoice] = useState<Choice>('retry')
  const retryRef = useRef<HTMLButtonElement>(null)
  const exitRef = useRef<HTMLButtonElement>(null)
  const chosen = useRef(false)

  const typed = useTypewriter(MESSAGE, typeKey, 45)
  const message = typeKey === 0 ? '' : typed
  const showOptions = typeKey > 0 && typed === MESSAGE

  useEffect(() => {
    const ids = [
      window.setTimeout(() => {
        setPhase('crack')
        sfx.play('soulcrack')
      }, 500),
      window.setTimeout(() => {
        setPhase('shatter')
        sfx.play('soulshatter')
      }, 1000),
      window.setTimeout(() => {
        setPhase('screen')
        sfx.play('gameover')
      }, 1800),
      window.setTimeout(() => setTypeKey(1), 2700),
    ]
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [])

  const confirm = (value: Choice) => {
    if (chosen.current) return
    chosen.current = true
    if (value === 'retry') onRetry()
    else onExit()
  }

  const select = (value: Choice) => {
    setChoice((current) => {
      if (current !== value) sfx.play('menu')
      return value
    })
  }

  useEffect(() => {
    if (!showOptions) return
    ;(choice === 'retry' ? retryRef : exitRef).current?.focus()
  }, [showOptions, choice])

  useEffect(() => {
    if (!showOptions) return
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) {
        e.preventDefault()
        select(e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a' ? 'retry' : 'exit')
        return
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        confirm(choice)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const heartStyle = {
    left: (soul?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0)) - HEART_W / 2,
    top: (soul?.y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0)) - HEART_H / 2,
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
      aria-describedby="gameover-message"
      className="ut-death fixed inset-0 z-50 overflow-hidden bg-black"
    >
      {phase !== 'screen' && (
        <div className="absolute" style={heartStyle}>
          {phase === 'freeze' ? (
            <PixelHeart />
          ) : (
            <div className={cn('ut-soul-split relative', phase === 'shatter' && 'is-shattering')} style={{ width: HEART_W, height: HEART_H }}>
              <PixelHeart part="left" className="ut-soul-half ut-soul-left absolute inset-0" />
              <PixelHeart part="right" className="ut-soul-half ut-soul-right absolute inset-0" />
            </div>
          )}
        </div>
      )}

      {phase === 'screen' && (
        <div className="ut-screen flex h-full flex-col items-center justify-center gap-10 px-6 text-center">
          <div className="ut-lcd w-[min(90vw,420px)] border-2 border-white px-4 py-6">
            <h2 id="gameover-title" className="ut-syntax font-pixel text-xl text-[#ff3b5c] sm:text-3xl">
              SYNTAX ERROR
            </h2>
          </div>

          <p id="gameover-message" className="min-h-16 max-w-md font-pixel text-xs leading-relaxed text-white sm:text-sm" aria-live="polite">
            {message}
            {typeKey > 0 && !showOptions && <span className="ut-caret" aria-hidden />}
          </p>

          <div className={cn('flex flex-wrap items-center justify-center gap-6 sm:gap-12', !showOptions && 'invisible')}>
            {(
              [
                { id: 'retry', label: 'REINTENTAR', ref: retryRef },
                { id: 'exit', label: 'RENUNCIAR', ref: exitRef },
              ] as const
            ).map((option) => {
              const selected = choice === option.id
              return (
                <button
                  key={option.id}
                  ref={option.ref}
                  type="button"
                  disabled={!showOptions}
                  onMouseEnter={() => select(option.id)}
                  onFocus={() => select(option.id)}
                  onClick={() => confirm(option.id)}
                  className={cn(
                    'ut-option flex items-center gap-3 font-pixel text-xs outline-none sm:text-sm',
                    selected ? 'text-[#ffff00]' : 'text-white',
                  )}
                >
                  <span className={cn('flex w-[18px] justify-center', !selected && 'invisible')} aria-hidden>
                    <PixelHeart className="ut-option-soul h-[15px] w-[16px]" />
                  </span>
                  <span>
                    {'[ '}
                    {option.label}
                    {' ]'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
