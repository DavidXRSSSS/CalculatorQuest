'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sfx } from '@/lib/game/audio'
import { evaluate, extractEnemies, formatNumber, hasOperation } from '@/lib/game/calculator'
import { PHASE_TOTALS, MAX_HP, type Engine, type EnemySpec, type EngineEvents } from '@/lib/game/engine'
import type { BossState, CalcMood } from '@/lib/game/calc-sprite'
import { cn } from '@/lib/utils'
import { BOTTOM_ROWS, CalcDisplay, Keypad, TOP_ROWS } from './calculator'
import { CombatLayer } from './combat-layer'
import { GameOver } from './game-over'
import { Hud, SoundButton } from './hud'
import { AdminPanel } from './admin-panel'
import { useTypewriter } from './use-typewriter'
import { IntroSequence } from './intro-sequence'
import { DemonBossFight } from './demon-boss-fight'
import { FibonacciFight } from './fibonacci-fight'
import { CatKnightFight } from './cat-knight-fight'
import { playMeow } from '@/lib/game/cat-audio'
import { MultiplayerRooms } from './multiplayer-rooms'

type Stage = 'calc' | 'entering' | 'cracking' | 'splitting' | 'combat' | 'victory' | 'rejoining' | 'defeat' | 'gameover'

const TOKEN_MAP: Record<string, string> = {
  sin: 'sin(',
  cos: 'cos(',
  tan: 'tan(',
  ln: 'ln(',
  log: 'log(',
  sqrt: '√(',
  x2: '^2',
  pi: 'π',
  ans: 'Ans',
  neg: '(−',
}
const CONTINUES_RESULT = ['+', '−', '×', '÷', '^', '^2', '%', '!']

const KEYBOARD_MAP: Record<string, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  x: '×',
  '/': '÷',
  '^': '^',
  '(': '(',
  ')': ')',
  '%': '%',
  '!': '!',
  '.': '.',
  ',': '.',
  p: 'pi',
  e: 'e',
  Enter: '=',
  '=': '=',
  Backspace: 'del',
  Escape: 'ac',
  Delete: 'ac',
}

function computeZoneHeight() {
  if (typeof window === 'undefined') return 320
  return Math.max(220, Math.min(460, window.innerHeight - 56 - 316 - 20))
}

function flavorFor(enemies: EnemySpec[], username?: string) {
  const labels = enemies.map((e) => e.label)
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}` : labels[0]
  return username
    ? `* ${username}, ¡${list} ${labels.length > 1 ? 'bloquean' : 'bloquea'} el camino!`
    : `* ¡${list} ${labels.length > 1 ? 'bloquean' : 'bloquea'} el camino!`
}

export function Game() {
  const [appState, setAppState] = useState<'intro' | 'loading' | 'game'>('intro')
  const [booting, setBooting] = useState(false)

  useEffect(() => {
    if (!booting) return
    const beep = window.setTimeout(() => sfx.play('boot'), 150)
    const done = window.setTimeout(() => setBooting(false), 1400)
    return () => {
      window.clearTimeout(beep)
      window.clearTimeout(done)
    }
  }, [booting])
  const [tokens, setTokens] = useState<string[]>([])
  const [justEvaluated, setJustEvaluated] = useState(false)
  const [resultText, setResultText] = useState('0')
  const [revealKey, setRevealKey] = useState(0)
  const [ans, setAns] = useState(0)
  const [deg, setDeg] = useState(true)
  const [error, setError] = useState(false)
  const [stage, setStage] = useState<Stage>('calc')
  const [zoneH, setZoneH] = useState(0)
  const [hp, setHp] = useState(MAX_HP)
  const [maxHp, setMaxHp] = useState(MAX_HP)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)
  const [attack, setAttack] = useState({ n: 0, total: PHASE_TOTALS[0] as number, phase: 1 })
  const [flavor, setFlavor] = useState('')
  const [flavorKey, setFlavorKey] = useState(0)
  const [muted, setMuted] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [runId, setRunId] = useState(0)
  const [pressed, setPressed] = useState<string | null>(null)
  const [rebuild, setRebuild] = useState(false)
  const [revive, setRevive] = useState(false)
  const [secretActive, setSecretActive] = useState(false)
  const [demonActive, setDemonActive] = useState(false)
  const [fibActive, setFibActive] = useState(false)
  const [catBoot, setCatBoot] = useState(false)
  const [catActive, setCatActive] = useState(false)
  const [achievement, setAchievement] = useState<{ icon: string; text: string; color: string } | null>(null)
  const [soulPos, setSoulPos] = useState<{ x: number; y: number } | null>(null)
  const [enemies, setEnemies] = useState<EnemySpec[]>([])
  const [boss, setBoss] = useState<{ state: BossState; mood: CalcMood }>({ state: 'idle', mood: 0 })
  const username = ''

  const battleRef = useRef<{ result: number } | null>(null)
  const engineRef = useRef<Engine | null>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const sequenceRef = useRef(0)
  const pressTimer = useRef<number | undefined>(undefined)
  const phase4MusicStarted = useRef(false)
  const phase4Audio = useRef<HTMLAudioElement | null>(null)

  const cancelScheduled = useCallback(() => {
    sequenceRef.current += 1
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const sequence = sequenceRef.current
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((scheduled) => scheduled !== id)
      if (sequence === sequenceRef.current) fn()
    }, ms)
    timers.current.push(id)
  }, [])

  useEffect(() => cancelScheduled, [cancelScheduled])

  const expr = tokens.join('')
  const displayExpr = expr.replace(/Ans/g, 'ANS')
  const typedResult = useTypewriter(resultText, revealKey, 60)
  const typedFlavor = useTypewriter(flavor, flavorKey, 35)

  const inBattle = stage !== 'calc'
  const compact = stage === 'splitting' || stage === 'combat' || stage === 'victory' || stage === 'defeat' || stage === 'gameover'
  const joined = stage === 'calc' || stage === 'cracking'
  const exploding = stage === 'defeat' || stage === 'gameover'
  const showCombat = inBattle && stage !== 'cracking' && runId > 0
  const bossMode = showCombat && compact && !secretActive && attack.phase <= 2 && stage !== 'gameover'

  let line2 = '0'
  let line2Mode: 'result' | 'preview' | 'error' | 'story' = 'preview'
  if (catBoot) {
    line2 = 'MEOW_KERNEL_INIT'
    line2Mode = 'story'
  } else if (inBattle) {
    line2 = stage === 'cracking' ? '!!!' : typedFlavor
    line2Mode = 'story'
  } else if (error) {
    line2 = 'ERROR'
    line2Mode = 'error'
  } else if (justEvaluated) {
    line2 = typedResult
    line2Mode = 'result'
  } else if (expr) {
    try {
      line2 = `= ${formatNumber(evaluate(expr, { deg, ans }))}`
    } catch {
      line2 = ''
    }
  }

  const flashKey = (id: string) => {
    window.clearTimeout(pressTimer.current)
    setPressed(null)
    requestAnimationFrame(() => setPressed(id))
    pressTimer.current = window.setTimeout(() => setPressed(null), id === '=' ? 450 : 140)
  }

  const finish = (value: number) => {
    setAns(value)
    setResultText(formatNumber(value))
    setJustEvaluated(true)
    setRevealKey((k) => k + 1)
  }

  const startBattle = (list: EnemySpec[]) => {
    cancelScheduled()
    setEnemies(list)
    setHp(MAX_HP)
    setAttack({ n: 0, total: PHASE_TOTALS[0], phase: 1 })
    setFlavor(flavorFor(list, username))
    setStage('cracking')
    setShakeKey((k) => k + 1)
    sfx.play('equals')
    later(() => sfx.play('crack'), 160)
    later(() => {
      sfx.play('split')
      setStage('splitting')
      setZoneH(computeZoneHeight())
      setRunId((r) => r + 1)
      setFlavorKey((k) => k + 1)
    }, 560)
    later(() => setStage((s) => (s === 'splitting' ? 'combat' : s)), 1500)
  }

  const equals = () => {
    if (!expr) return
    const compact = expr.replace(/\s/g, '')
    if (compact === '666' || compact === '1÷0' || compact === '1/0') {
      cancelScheduled()
      sfx.play('equals')
      setDemonActive(true)
      return
    }
    if (compact === '999') {
      cancelScheduled()
      sfx.play('equals')
      setCatBoot(true)
      playMeow(muted)
      later(() => {
        setCatBoot(false)
        setCatActive(true)
      }, 1900)
      return
    }
    if (compact === '1+2+3+5+8' || compact === '1.618') {
      cancelScheduled()
      sfx.play('equals')
      setFibActive(true)
      return
    }
    let value: number
    try {
      value = evaluate(expr, { deg, ans })
    } catch {
      setError(true)
      setShakeKey((k) => k + 1)
      sfx.play('error')
      return
    }
    const list = hasOperation(expr) ? extractEnemies(expr, ans) : []
    if (list.length === 0) {
      finish(value)
      return
    }
    battleRef.current = { result: value }
  startBattle(list)
  }

  const press = (id: string) => {
    if (demonActive || fibActive || catBoot || catActive) return
    if (stage !== 'calc' && !secretActive) return
    flashKey(id)
    if (id === '=') {
      equals()
      return
    }
    sfx.play('click')
    if (id === 'ac') {
      setTokens([])
      setJustEvaluated(false)
      setError(false)
      return
    }
    if (id === 'del') {
      setError(false)
      if (justEvaluated) {
        setTokens([])
        setJustEvaluated(false)
      } else setTokens((t) => t.slice(0, -1))
      return
    }
    const tok = TOKEN_MAP[id] ?? id
    setError(false)
    if (justEvaluated) {
      setJustEvaluated(false)
      setTokens(CONTINUES_RESULT.includes(tok) ? ['Ans', tok] : [tok])
      return
    }
    setTokens((t) => (t.length >= 48 ? t : [...t, tok]))
  }

  useEffect(() => {
    if (!achievement) return
    const id = window.setTimeout(() => setAchievement(null), 4800)
    return () => window.clearTimeout(id)
  }, [achievement])

  useEffect(() => {
    if (demonActive || fibActive || catBoot || catActive) return
    if (stage !== 'calc' && !secretActive) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (adminLoginOpen || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON' && e.key === 'Enter') return
      const id = /^[0-9]$/.test(e.key) ? e.key : KEYBOARD_MAP[e.key]
      if (!id) return
      e.preventDefault()
      press(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!compact) return
    const onResize = () => setZoneH(computeZoneHeight())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [compact])

  const events: EngineEvents = {
    onHp: (nextHp) => {
    const safeHp = Math.max(0, Math.min(MAX_HP, Math.round(nextHp)))
    setHp(safeHp)
  },
    onAttack: (n, total, phase) => setAttack({ n, total, phase }),
    onPhase: (phase) => {
      setFlavor(`* ¡Los números se enfurecen! FASE ${phase}`)
      setFlavorKey((k) => k + 1)
    },
    onShake: () => setShakeKey((k) => k + 1),
    onBoss: (state, mood) => setBoss({ state, mood }),
      onVictory: () => {
        setStage('victory')
        setFlavor('* El resultado se desintegra... ¡VICTORIA!')
        setFlavorKey((k) => k + 1)
        setShakeKey((k) => k + 1)
        sfx.play('victory')
        later(() => setShakeKey((k) => k + 1), 500)
        later(() => sfx.play('rebuild'), 2600)
        later(() => {
          setStage('rejoining')
          setZoneH(0)
          setRebuild(true)
          sfx.play('join')
        }, 3000)
        later(() => {
          setRebuild(false)
          setStage('calc')
          if (battleRef.current) finish(battleRef.current.result)
        }, 3800)
      },
    onDefeat: () => {
      const player = engineRef.current?.player
      setSoulPos(player ? { x: player.x, y: player.y } : null)
      setStage('gameover')
    },
      onRefusal: () => {
        setSecretActive(true)
        setStage('combat')
        setFlavor('But it refused.')
        setFlavorKey((k) => k + 1)
        setShakeKey((k) => k + 1)
        sfx.play('explosion')
        if (!phase4MusicStarted.current) {
          phase4MusicStarted.current = true
          const audio = phase4Audio.current ?? new Audio('/music/phase4.mp3')
          phase4Audio.current = audio
          audio.loop = false
          audio.volume = muted ? 0 : 0.5
          const syncDuration = () => engineRef.current?.setPhase3AudioDuration(audio.duration)
          audio.addEventListener('loadedmetadata', syncDuration, { once: true })
          audio.onended = () => engineRef.current?.finishPhase3FromAudio()
          later(() => { syncDuration(); void audio.play().catch(() => undefined) }, 3100)
        }
        later(() => {
          setFlavor('But it refused.')
          setFlavorKey((k) => k + 1)
          setShakeKey((k) => k + 1)
        }, 900)
      },
  }

  const retry = () => {
    cancelScheduled()
    sfx.play('equals')
    setRevive(true)
    later(() => setRevive(false), 520)
    setHp(MAX_HP)
    setAttack({ n: 0, total: PHASE_TOTALS[0], phase: 1 })
    setFlavor(flavorFor(enemies, username))
    setFlavorKey((k) => k + 1)
    setZoneH(computeZoneHeight())
    setRunId((r) => r + 1)
    setStage('splitting')
    later(() => setStage((s) => (s === 'splitting' ? 'combat' : s)), 1000)
  }

  const exit = () => {
    cancelScheduled()
    sfx.play('rebuild')
    setRevive(true)
    setStage('rejoining')
    setZoneH(0)
    later(() => {
      setRevive(false)
      setStage('calc')
      setJustEvaluated(false)
    }, 750)
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    sfx.setMuted(next)
    if (phase4Audio.current) phase4Audio.current.volume = next ? 0 : 0.5
    if (!next) sfx.play('click')
  }

  const shakeClass = shakeKey === 0 ? '' : shakeKey % 2 ? 'shake-a' : 'shake-b'

  if (appState !== 'game') {
    return (
      <IntroSequence
        onComplete={() => {
          setAppState('game')
          setBooting(true)
        }}
      />
    )
  }

  return (
    <main
      className={cn(
        'crt relative flex h-dvh flex-col items-center overflow-hidden',
        inBattle && 'touch-none select-none',
        secretActive && 'corrupted-calculator',
      )}
      data-stage={stage}
      data-boot={booting ? 'on' : undefined}
    >
      <AdminPanel engineRef={engineRef} onLoginOpenChange={setAdminLoginOpen} onLogout={() => undefined} onState={(state) => {
        if (state.hp !== undefined) setHp(Math.max(0, state.hp))
        if (state.maxHp !== undefined) setMaxHp(Math.max(1, state.maxHp))
      }} />

      <>
          <header className="relative z-40 flex h-14 w-full max-w-3xl shrink-0 items-center justify-between gap-3 px-4">
            {compact || stage === 'rejoining' ? (
              <Hud hp={hp} maxHp={maxHp} username={username} attack={attack} />
            ) : (
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="font-pixel text-xs text-foreground sm:text-sm">
                  CALC<span className="text-[#ffff00]">QUEST</span>
                </h1>
              </div>
            )}
            <SoundButton muted={muted} onToggle={toggleMute} />
          </header>

          <div className="flex w-full flex-1 flex-col items-center justify-center pb-4">
            <div className={cn('game-build-shell flex w-[min(92vw,380px)] flex-col', shakeClass, rebuild && 'rebuild')}>
              <div
                ref={topRef}
                data-boss={bossMode ? boss.state : undefined}
                data-mood={bossMode ? boss.mood : undefined}
                data-meow={catBoot ? '' : undefined}
                className={cn(
                  'half half-top z-10 build-piece build-piece--one',
                  joined && 'joined',
                  compact && 'compact',
                  stage === 'cracking' && 'cracking-top',
                  stage === 'splitting' && !revive && 'split-top',
                  exploding && 'explode-top',
                  revive && 'pop-in',
                )}
              >
                <CalcDisplay
                  line1={displayExpr}
                  line2={line2}
                  mode={line2Mode}
                  deg={deg}
                  disabled={inBattle && !secretActive}
                  bossMode={bossMode}
                  onToggleDeg={() => {
                    sfx.play('click')
                    setDeg((d) => !d)
                  }}
                />
                <Keypad rows={TOP_ROWS} pressed={pressed} disabled={inBattle && !secretActive} onPress={press} />
              </div>

              <div
                ref={zoneRef}
                className="battle-build-zone relative w-full overflow-hidden build-piece build-piece--two"
                style={{
                  height: zoneH,
                  transition:
                    zoneH > 0
                      ? 'height 750ms cubic-bezier(.34,1.56,.64,1)'
                      : 'height 650ms cubic-bezier(.7,0,.84,0)',
                }}
              >
                {stage === 'cracking' && (
                  <svg
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                    className="crack-flash pointer-events-none absolute -top-[7px] left-0 z-20 h-[14px] w-full"
                    aria-hidden
                  >
                    <polyline
                      points="0,5 8,2 15,8 24,3 33,7 41,2 50,8 58,3 66,7 75,2 84,8 92,4 100,5"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.6"
                      vectorEffect="non-scaling-stroke"
                      style={{ strokeWidth: 3 }}
                    />
                  </svg>
                )}
              </div>

              <div
                ref={bottomRef}
                data-live={stage === 'combat' ? '' : undefined}
                data-boss={stage === 'combat' ? boss.state : undefined}
                data-hop={stage === 'combat' && attack.n > 0 ? (attack.n % 2 ? 'a' : 'b') : undefined}
                className={cn(
                  'half half-bottom z-10 build-piece build-piece--three',
                  joined && 'joined',
                  compact && 'compact',
                  stage === 'cracking' && 'cracking-bottom',
                  stage === 'splitting' && !revive && 'split-bottom',
                  exploding && 'explode-bottom',
                  revive && 'pop-in',
                )}
              >
                <Keypad rows={BOTTOM_ROWS} pressed={pressed} disabled={inBattle} onPress={press} />
              </div>
            </div>
          </div>

          {showCombat && (
            <CombatLayer key={runId} zoneRef={zoneRef} bossRef={topRef} engineRef={engineRef} enemies={enemies} events={events} />
          )}

          {stage === 'gameover' && <GameOver soul={soulPos} onRetry={retry} onExit={exit} />}
          {demonActive && (
            <DemonBossFight
              muted={muted}
              onFinish={(won) => {
                setDemonActive(false)
                setError(false)
                if (won) {
                  setTokens([])
                  finish(666)
                } else {
                  setTokens([])
                  setJustEvaluated(false)
                }
              }}
            />
          )}
          {fibActive && (
            <FibonacciFight
              muted={muted}
              onFinish={(won) => {
                setFibActive(false)
                setError(false)
                setTokens([])
                if (won) {
                  finish((1 + Math.sqrt(5)) / 2)
                  sfx.play('heal')
                  setAchievement({ icon: 'φ', text: 'SECTOR ÁUREO COMPLETADO', color: '#ffd23f' })
                } else setJustEvaluated(false)
              }}
            />
          )}
          {catActive && (
            <CatKnightFight
              muted={muted}
              onFinish={(won) => {
                setCatActive(false)
                setError(false)
                setTokens([])
                if (won) {
                  finish(999)
                  sfx.play('heal')
                  setAchievement({ icon: '9', text: '[GUARDIÁN FELINO] - Has superado a la bestia de 9 vidas', color: '#3ff5ff' })
                } else setJustEvaluated(false)
              }}
            />
          )}
          {achievement && (
            <div
              role="status"
              className="achievement-toast fixed left-1/2 top-16 z-[310] flex max-w-[92vw] items-center gap-3 border-2 bg-black px-4 py-3"
              style={{ borderColor: achievement.color, boxShadow: `4px 4px 0 ${achievement.color}55` }}
            >
              <span className="font-pixel text-lg" style={{ color: achievement.color }} aria-hidden>
                {achievement.icon}
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="font-pixel text-[8px] text-white/70">LOGRO DESBLOQUEADO</span>
                <span className="font-pixel text-[10px] leading-relaxed sm:text-xs" style={{ color: achievement.color }}>
                  {achievement.text}
                </span>
              </div>
            </div>
          )}
          <MultiplayerRooms />
          <p className="credit fixed bottom-3 right-4 z-40 font-pixel text-[11px] text-muted-foreground">Hecho por David_XRS</p>
        </>
    </main>
  )
}
