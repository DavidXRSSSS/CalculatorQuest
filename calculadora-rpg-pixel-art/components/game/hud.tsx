'use client'

import { Heart, Volume2, VolumeX } from 'lucide-react'
import { MAX_HP } from '@/lib/game/engine'
import { cn } from '@/lib/utils'

interface HudProps {
  hp: number
  maxHp?: number
  username?: string
  attack: { n: number; total: number; phase: number }
}

export function Hud({ hp, maxHp = MAX_HP, username, attack }: HudProps) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const low = hp <= 25
  return (
    <div className="fade-in flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 font-pixel text-[8px] sm:gap-x-4 sm:text-[10px]">
      {username && <span className="hud-player max-w-[25vw] truncate text-foreground" title={username}>{username.toUpperCase()}</span>}
      <span className={cn('hud-phase whitespace-nowrap', attack.phase === 2 ? 'text-destructive' : 'text-accent')}>
        FASE {attack.phase}
      </span>
      <span className="whitespace-nowrap text-primary" aria-live="polite">
        ATTACK {Math.max(1, attack.n)}/{attack.total}
      </span>
      <div className="hud-health flex min-w-0 items-center gap-1.5 sm:gap-2" role="meter" aria-label="Puntos de vida" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
        <Heart className={cn('hud-heart size-3.5 fill-destructive text-destructive', low && 'blink')} aria-hidden />
        <span>HP</span>
        <div key={hp} className="hp-hit h-3 w-20 border-2 border-foreground bg-destructive sm:w-28">
          <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <span key={`${hp}-${maxHp}`} className="hud-hp-value min-w-[4.5rem] whitespace-nowrap tabular-nums" aria-live="polite">
          {hp}/{maxHp}
        </span>
      </div>
    </div>
  )
}

export function SoundButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      className="flex shrink-0 items-center gap-2 border-2 border-foreground bg-secondary px-2 py-1.5 font-pixel text-[8px] shadow-[3px_3px_0_#000] hover:text-primary active:translate-y-0.5"
    >
      {muted ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
      {muted ? 'MUTE' : 'SOUND'}
    </button>
  )
}
