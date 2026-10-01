'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type KeyKind = 'num' | 'op' | 'fn' | 'danger' | 'eq'

export interface KeyDef {
  id: string
  label: string
  kind?: KeyKind
  span?: number
  aria?: string
}

const n = (d: string): KeyDef => ({ id: d, label: d, kind: 'num' })

export const TOP_ROWS: KeyDef[][] = [
  [
    { id: 'sin', label: 'sin', kind: 'fn', aria: 'seno' },
    { id: 'cos', label: 'cos', kind: 'fn', aria: 'coseno' },
    { id: 'tan', label: 'tan', kind: 'fn', aria: 'tangente' },
    { id: 'ln', label: 'ln', kind: 'fn', aria: 'logaritmo natural' },
    { id: 'log', label: 'log', kind: 'fn', aria: 'logaritmo base 10' },
  ],
  [
    { id: 'sqrt', label: '√', kind: 'fn', aria: 'raíz cuadrada' },
    { id: 'x2', label: 'x²', kind: 'fn', aria: 'al cuadrado' },
    { id: '^', label: 'xʸ', kind: 'fn', aria: 'potencia' },
    { id: '(', label: '(', kind: 'op', aria: 'abrir paréntesis' },
    { id: ')', label: ')', kind: 'op', aria: 'cerrar paréntesis' },
  ],
  [
    { id: 'ac', label: 'AC', kind: 'danger', aria: 'borrar todo' },
    { id: 'del', label: 'DEL', kind: 'danger', aria: 'borrar último' },
    { id: '%', label: '%', kind: 'op', aria: 'porcentaje' },
    { id: 'pi', label: 'π', kind: 'fn', aria: 'pi' },
    { id: '÷', label: '÷', kind: 'op', aria: 'dividir' },
  ],
]

export const BOTTOM_ROWS: KeyDef[][] = [
  [n('7'), n('8'), n('9'), { id: 'e', label: 'e', kind: 'fn', aria: 'número e' }, { id: '×', label: '×', kind: 'op', aria: 'multiplicar' }],
  [n('4'), n('5'), n('6'), { id: '!', label: 'n!', kind: 'fn', aria: 'factorial' }, { id: '−', label: '−', kind: 'op', aria: 'restar' }],
  [n('1'), n('2'), n('3'), { id: 'ans', label: 'ANS', kind: 'fn', aria: 'último resultado' }, { id: '+', label: '+', kind: 'op', aria: 'sumar' }],
  [
    { id: 'neg', label: '±', kind: 'fn', aria: 'negativo' },
    n('0'),
    { id: '.', label: '.', kind: 'num', aria: 'punto decimal' },
    { id: '=', label: '=', kind: 'eq', span: 2, aria: 'igual, iniciar combate' },
  ],
]

interface KeypadProps {
  rows: KeyDef[][]
  pressed: string | null
  disabled: boolean
  onPress: (id: string) => void
}

export function Keypad({ rows, pressed, disabled, onPress }: KeypadProps) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {rows.flat().map((k, i) => (
        <button
          key={k.id}
          type="button"
          data-kind={k.kind}
          style={{ '--i': i, '--dx': (i % 5) - 2, '--dy': rows.length - 1 - Math.floor(i / 5) } as CSSProperties}
          aria-label={k.aria ?? k.label}
          disabled={disabled}
          onClick={() => onPress(k.id)}
          className={cn(
            'key',
            k.span === 2 && 'col-span-2',
            pressed === k.id && (k.id === '=' ? 'eq-fire' : 'key-pop'),
          )}
        >
          <span className="key-glyph">{k.label}</span>
        </button>
      ))}
    </div>
  )
}

interface DisplayProps {
  line1: string
  line2: string
  mode: 'result' | 'preview' | 'error' | 'story'
  deg: boolean
  disabled: boolean
  bossMode?: boolean
  onToggleDeg: () => void
}

export function CalcDisplay({ line1, line2, mode, deg, disabled, bossMode = false, onToggleDeg }: DisplayProps) {
  return (
    <div className="display mb-1.5">
      {bossMode ? (
        <div data-boss-screen className="boss-screen" role="img" aria-label="Rostro de la calculadora jefe" />
      ) : (
        <>
      <div className="display-status flex items-center justify-between font-pixel text-[8px] leading-none">
        <span className="display-led" aria-hidden />
        <button
          type="button"
          onClick={onToggleDeg}
          disabled={disabled}
          aria-label={`Modo angular: ${deg ? 'grados' : 'radianes'}. Pulsa para cambiar`}
          className="border border-accent px-1 py-0.5 text-accent disabled:opacity-60"
        >
          {deg ? 'DEG' : 'RAD'}
        </button>
        <span className="display-brand text-muted-foreground">CALC-QUEST // SCIENTIFIC</span>
        <span className="display-signal text-primary" aria-hidden>● READY</span>
      </div>
      <div className="flex justify-end overflow-hidden">
        <span className="whitespace-nowrap text-2xl leading-none text-foreground" aria-label="Expresión">
          <span className="display-prompt" aria-hidden>{line1 ? '>' : '\u00a0'}</span>{line1 || '\u00a0'}<span className="display-cursor" aria-hidden />
        </span>
      </div>
        </>
      )}
      <div className="flex justify-end overflow-hidden" aria-live="polite">
        <span
          className={cn(
            'whitespace-nowrap leading-none',
            mode === 'story' ? 'text-xl text-accent' : 'font-pixel text-base',
            mode === 'result' && 'text-primary',
            mode === 'preview' && 'text-muted-foreground',
            mode === 'error' && 'text-destructive',
          )}
        >
          {line2 || '\u00a0'}
        </span>
      </div>
    </div>
  )
}
