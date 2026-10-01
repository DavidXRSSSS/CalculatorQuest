'use client'

import { useEffect, useRef, useState } from 'react'
import type { Engine } from '@/lib/game/engine'

type Props = { engineRef: React.MutableRefObject<Engine | null>; onLogout: () => void; onState: (state: { hp?: number; maxHp?: number }) => void; onLoginOpenChange: (open: boolean) => void }
const speeds = [0.5, 1, 1.5, 2, 3]
const difficulties = [0.5, 1, 1.5, 2, 3, 5]

export function AdminPanel({ engineRef, onLogout, onState, onLoginOpenChange }: Props) {
  const [logged, setLogged] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [hp, setHp] = useState(100)
  const [maxHp, setMaxHp] = useState(100)
  const [immortal, setImmortal] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [attackSpeed, setAttackSpeed] = useState(1)
  const [difficulty, setDifficulty] = useState(1)
  const [phase, setPhase] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 72 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const call = async (action: string, value?: unknown) => {
    const response = await fetch('/api/admin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, value }) })
    if (!response.ok) throw new Error('No autorizado')
  }
  const apply = async (action: string, value?: unknown) => {
    try { await call(action, value); engineRef.current?.adminAction(action, value)
      if (action === 'set_hp' && typeof value === 'number') onState({ hp: value })
      if (action === 'set_max_hp' && typeof value === 'number') onState({ maxHp: value }) } catch { setError('Sesión administrativa expirada') }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setError('')
    const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password }) })
    if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; setError(data?.error ?? 'Usuario o contraseña incorrectos'); return }
    setLogged(true); setLoginOpen(false); onLoginOpenChange(false); setOpen(true); setPassword('')
  }
  function startDrag(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest('button')) return
    const point = position
    drag.current = { x: point.x, y: point.y, px: event.clientX, py: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: React.PointerEvent) {
    if (!drag.current) return
    const x = Math.max(-window.innerWidth + 180, Math.min(window.innerWidth - 24, drag.current.x + event.clientX - drag.current.px))
    const y = Math.max(8, Math.min(window.innerHeight - 70, drag.current.y + event.clientY - drag.current.py))
    setPosition({ x, y })
  }
  const logout = async () => { await fetch('/api/admin', { method: 'DELETE' }); setLogged(false); setOpen(false); onLogout() }

  if (!logged && !loginOpen) return <button className="admin-reopen" onClick={() => { setLoginOpen(true); onLoginOpenChange(true) }}>ADMIN</button>
  if (!logged) return <div className="admin-login-float"><form onSubmit={login} onKeyDown={(event) => event.stopPropagation()} className="admin-window admin-login-card"><header>ADMIN LOGIN</header><label>USUARIO<input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required /></label><label>CONTRASEÑA<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <p className="admin-error">{error}</p>}<button type="submit">ENTRAR</button><button type="button" onClick={() => { setLoginOpen(false); onLoginOpenChange(false) }}>CANCELAR</button></form></div>
  if (!open) return <button className="admin-reopen" onClick={() => setOpen(true)}>ADMIN</button>
  if (minimized) return <button className="admin-window admin-minimized" style={{ transform: `translate(${position.x}px, ${position.y}px)` }} onClick={() => setMinimized(false)}>ADMIN PANEL</button>

  return <section className="admin-window" style={{ transform: `translate(${position.x}px, ${position.y}px)` }} aria-label="Admin panel" onKeyDown={(event) => event.stopPropagation()}>
    <header className="admin-window-bar" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null }}><strong>ADMIN PANEL</strong><span><button onClick={() => setMinimized(true)} aria-label="Minimizar">—</button><button onClick={() => setOpen(false)} aria-label="Cerrar">X</button></span></header>
    <div className="admin-window-body"><div className="admin-stat">HP: <b>{hp} / {maxHp}</b></div><div className="admin-row"><button onClick={() => { const v = Math.max(0, hp - 10); setHp(v); void apply('set_hp', v) }}>-10</button><button onClick={() => { const v = Math.min(maxHp, hp + 10); setHp(v); void apply('set_hp', v) }}>+10</button><button onClick={() => { setHp(maxHp); void apply('set_hp', maxHp) }}>FULL HP</button></div><div className="admin-row"><button onClick={() => { const v = Math.max(0, hp - 5); setHp(v); void apply('set_hp', v) }}>-5</button><button onClick={() => { const v = Math.min(maxHp, hp + 5); setHp(v); void apply('set_hp', v) }}>+5</button><button onClick={() => { const v = Math.min(maxHp, hp + 25); setHp(v); void apply('set_hp', v) }}>+25</button></div><label>MAX HP <input type="number" value={maxHp} onChange={(e) => setMaxHp(Number(e.target.value))} /><button onClick={() => { void apply('set_max_hp', maxHp) }}>APPLY</button></label><label>IMMORTAL <button onClick={() => { const v = !immortal; setImmortal(v); void apply('immortal', v) }}>{immortal ? 'ON' : 'OFF'}</button></label><Choice label="PLAYER SPEED" value={speed} options={speeds} onChange={(v) => { setSpeed(v); void apply('speed', v) }} /><Choice label="ATTACK SPEED" value={attackSpeed} options={speeds} onChange={(v) => { setAttackSpeed(v); void apply('attack_speed', v) }} /><Choice label="DIFFICULTY" value={difficulty} options={difficulties} onChange={(v) => { setDifficulty(v); void apply('difficulty', v) }} /><Choice label="PHASE" value={phase} options={[1, 2, 3, 4]} onChange={(v) => { setPhase(v); void apply('phase', v) }} /><div className="admin-row"><button onClick={() => void apply('pause')}>PAUSE</button><button onClick={() => void apply('resume')}>RESUME</button><button onClick={() => void apply('restart')}>RESTART</button></div><div className="admin-row"><button onClick={() => void apply('victory')}>VICTORY</button><button onClick={() => void apply('gameover')}>GAME OVER</button></div><div className="admin-row"><button onClick={() => void apply('launch_attack')}>LAUNCH ATTACK</button></div>{error && <p className="admin-error">{error}</p>}<button className="admin-logout" onClick={logout}>LOGOUT</button></div>
  </section>
}

function Choice({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (value: number) => void }) { const phase = label === 'PHASE'; return <label>{phase ? 'CURRENT PHASE' : label}<select value={value} onChange={(e) => onChange(Number(e.target.value))}>{options.map((option) => <option key={option} value={option}>{phase ? `FASE ${option}` : `${option}x`}</option>)}</select></label> }
