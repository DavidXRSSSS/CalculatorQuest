'use client'

import { useEffect, useMemo, useState } from 'react'
import { Globe2, Heart, Radio, Users, X } from 'lucide-react'

type SoulColor = 'red' | 'blue' | 'yellow' | 'green' | 'purple'
type Player = { id: string; name: string; color: SoulColor; hp: number; x: number; y: number }

const colors: Record<SoulColor, string> = { red: '#ff304f', blue: '#36e2ff', yellow: '#ffd23f', green: '#61ff75', purple: '#c77dff' }
const colorNames: Record<SoulColor, string> = { red: 'ROJO', blue: 'AZUL', yellow: 'AMARILLO', green: 'VERDE', purple: 'MORADO' }

function Soul({ player }: { player: Player }) {
  return <div className="mp-soul" style={{ left: `${player.x}%`, top: `${player.y}%`, '--soul': colors[player.color] } as React.CSSProperties}>
    <span className="mp-name">{player.name}</span><span className="mp-heart" aria-hidden><Heart fill="currentColor" /></span>
  </div>
}

export function MultiplayerRooms() {
  const [open, setOpen] = useState(false)
  const [joined, setJoined] = useState(false)
  const [room, setRoom] = useState('')
  const [input, setInput] = useState('')
  const [name, setName] = useState('PLAYER 1')
  const [color, setColor] = useState<SoulColor>('red')
  const [players, setPlayers] = useState<Player[]>([])
  const [phase, setPhase] = useState(1)
  const [raidStarted, setRaidStarted] = useState(false)
  const [log, setLog] = useState(['SISTEMA: Esperando una sala...', 'CO-OP: Conecta jugadores reales con el código de sala'])

  const createRoom = () => {
    const code = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
    setRoom(code); setJoined(true); setOpen(false); setRaidStarted(false); setLog((items) => [`SALA ${code}: creada por ${name}`, ...items])
    setPlayers([{ id: 'you', name: name || 'DAVID', color, hp: 100, x: 50, y: 56 }])
  }
  const joinRoom = () => {
    const code = input.trim().toUpperCase().slice(0, 4)
    if (code.length !== 4) return
    setRoom(code); setJoined(true); setOpen(false); setRaidStarted(false); setLog((items) => [`SALA ${code}: conexión establecida; esperando jugadores reales`, ...items])
    setPlayers([{ id: 'you', name: name || 'DAVID', color, hp: 100, x: 50, y: 56 }])
  }
  const startRaid = () => { setRaidStarted(true); setPhase((value) => value === 1 ? 2 : 1); setLog((items) => [`JEFE: FASE ${phase === 1 ? 2 : 1} iniciada por jugadores reales`, ...items]) }
  const bossHp = useMemo(() => Math.max(1, players.length) * 100, [players.length])

  return <>
    {joined && <section className="mp-hud" aria-label="Sala multijugador">
      <div className="mp-room-status"><Radio size={13} /> SALA {room} <span><Users size={13} /> {players.length}/5</span></div>
      {raidStarted && <>
        <div className="mp-battle-box" aria-label="Battle Box cooperativa">
          {players.map((player) => <Soul key={player.id} player={player} />)}
          <div className="mp-projectile mp-car" aria-label="Proyectil sincronizado">◆</div>
          <div className="mp-projectile mp-cone" aria-label="Proyectil sincronizado">▲</div>
          <div className="mp-boss-line"><span>JEFE CO-OP · FASE {phase}</span><span>{bossHp} HP</span></div>
        </div>
        <div className="mp-party">{players.map((player) => <div className="mp-player-hp" key={player.id}><span style={{ color: colors[player.color] }}>{player.name}</span><div><i style={{ width: `${player.hp}%`, background: colors[player.color] }} /></div><b>{player.hp}</b></div>)}</div>
        <div className="mp-log" aria-live="polite">{log.slice(0, 3).map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div>
      </>}
      <button className="mp-raid" onClick={startRaid}>0.12= · {raidStarted ? 'CAMBIAR FASE' : 'INICIAR RAID'}</button>
    </section>}
    <button className="mp-rooms-button" onClick={() => setOpen(true)}><Globe2 size={16} /> ROOMS</button>
    {open && <div className="mp-modal-backdrop" role="presentation"><div className="mp-modal" role="dialog" aria-modal="true" aria-labelledby="rooms-title">
      <button className="mp-close" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={18} /></button>
      <p className="mp-kicker">CALCQUEST // MULTIPLAYER</p><h2 id="rooms-title">SALAS DE ALMAS</h2><p className="mp-copy">Hasta 5 jugadores. Cada alma comparte el mismo campo de batalla.</p>
      <label>NOMBRE <input value={name} onChange={(event) => setName(event.target.value.toUpperCase().slice(0, 12))} maxLength={12} /></label>
      <fieldset><legend>COLOR DEL ALMA</legend><div className="mp-colors">{(Object.keys(colors) as SoulColor[]).map((key) => <button key={key} className={color === key ? 'selected' : ''} onClick={() => setColor(key)} aria-label={colorNames[key]} style={{ '--swatch': colors[key] } as React.CSSProperties}><Heart fill="currentColor" /></button>)}</div></fieldset>
      <div className="mp-actions"><button className="mp-primary" onClick={createRoom}>CREAR SALA</button><div className="mp-join"><input placeholder="CÓDIGO (4 LETRAS)" value={input} onChange={(event) => setInput(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} /><button onClick={joinRoom}>UNIRSE</button></div></div>
    </div></div>}
  </>
}

export default MultiplayerRooms
