type Token =
  | { t: 'num'; v: number; raw: string }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'const'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }

const FUNCTIONS = ['sin', 'cos', 'tan', 'ln', 'log', '√']
const OPERATORS = '+-−×÷*/^!%'

export function tokenize(expr: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === ' ') {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      const raw = expr.slice(i, j)
      if (raw === '.' || (raw.match(/\./g) ?? []).length > 1) throw new Error('Número inválido')
      out.push({ t: 'num', v: parseFloat(raw), raw })
      i = j
      continue
    }
    if (expr.startsWith('Ans', i)) {
      out.push({ t: 'const', v: 'Ans' })
      i += 3
      continue
    }
    const fn = FUNCTIONS.find((f) => expr.startsWith(f, i))
    if (fn) {
      out.push({ t: 'fn', v: fn })
      i += fn.length
      continue
    }
    if (c === 'π' || c === 'e') {
      out.push({ t: 'const', v: c })
      i++
      continue
    }
    if (OPERATORS.includes(c)) {
      const v = c === '-' ? '−' : c === '*' ? '×' : c === '/' ? '÷' : c
      out.push({ t: 'op', v })
      i++
      continue
    }
    if (c === '(') {
      out.push({ t: 'lp' })
      i++
      continue
    }
    if (c === ')') {
      out.push({ t: 'rp' })
      i++
      continue
    }
    throw new Error(`Carácter inválido: ${c}`)
  }
  return out
}

function factorial(n: number) {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

export interface EvalOptions {
  deg: boolean
  ans: number
}

export function evaluate(expr: string, { deg, ans }: EvalOptions): number {
  const toks = tokenize(expr)
  let p = 0
  const peek = () => toks[p]
  const next = () => toks[p++]
  const isOp = (tok: Token | undefined, ...ops: string[]) =>
    tok?.t === 'op' && ops.includes(tok.v)
  const toRad = (x: number) => (deg ? (x * Math.PI) / 180 : x)
  const startsPrimary = (tok: Token | undefined) =>
    !!tok && (tok.t === 'num' || tok.t === 'const' || tok.t === 'fn' || tok.t === 'lp')

  function parseExpr(): number {
    let v = parseTerm()
    while (isOp(peek(), '+', '−')) {
      const op = next() as { v: string }
      const r = parseTerm()
      v = op.v === '+' ? v + r : v - r
    }
    return v
  }

  function parseTerm(): number {
    let v = parseUnary()
    for (;;) {
      const tok = peek()
      if (isOp(tok, '×', '÷')) {
        next()
        const r = parseUnary()
        v = (tok as { v: string }).v === '×' ? v * r : v / r
      } else if (startsPrimary(tok)) {
        v = v * parseUnary()
      } else break
    }
    return v
  }

  function parseUnary(): number {
    if (isOp(peek(), '−')) {
      next()
      return -parseUnary()
    }
    if (isOp(peek(), '+')) {
      next()
      return parseUnary()
    }
    return parsePower()
  }

  function parsePower(): number {
    const base = parsePostfix()
    if (isOp(peek(), '^')) {
      next()
      return Math.pow(base, parseUnary())
    }
    return base
  }

  function parsePostfix(): number {
    let v = parsePrimary()
    while (isOp(peek(), '!', '%')) {
      const op = next() as { v: string }
      v = op.v === '!' ? factorial(v) : v / 100
    }
    return v
  }

  function applyFn(name: string, x: number) {
    switch (name) {
      case 'sin':
        return Math.sin(toRad(x))
      case 'cos':
        return Math.cos(toRad(x))
      case 'tan':
        return Math.tan(toRad(x))
      case 'ln':
        return Math.log(x)
      case 'log':
        return Math.log10(x)
      case '√':
        return Math.sqrt(x)
    }
    return NaN
  }

  function parsePrimary(): number {
    const tok = next()
    if (!tok) throw new Error('Expresión incompleta')
    switch (tok.t) {
      case 'num':
        return tok.v
      case 'const':
        return tok.v === 'π' ? Math.PI : tok.v === 'e' ? Math.E : ans
      case 'lp': {
        const v = parseExpr()
        if (peek()?.t === 'rp') next()
        return v
      }
      case 'fn': {
        let arg: number
        if (peek()?.t === 'lp') {
          next()
          arg = parseExpr()
          if (peek()?.t === 'rp') next()
        } else {
          arg = parsePostfix()
        }
        return applyFn(tok.v, arg)
      }
      default:
        throw new Error('Sintaxis inválida')
    }
  }

  const value = parseExpr()
  if (p < toks.length) throw new Error('Sintaxis inválida')
  if (!Number.isFinite(value)) throw new Error('Resultado inválido')
  return value
}

export function formatNumber(v: number) {
  if (Math.abs(v) < 1e-12) return '0'
  const a = Math.abs(v)
  if (a >= 1e12 || a < 1e-6) return v.toExponential(6).replace(/\.?0+e/, 'e')
  return String(parseFloat(v.toPrecision(12)))
}

export function hasOperation(expr: string) {
  try {
    return tokenize(expr).some((t) => t.t === 'op' || t.t === 'fn')
  } catch {
    return false
  }
}

export interface EnemySeed {
  label: string
  value: number
}

export function shouldTriggerPhase4(operands: number[]) {
  return operands.filter((value) => Number.isInteger(value) && value >= 50).length >= 2
}

export function extractEnemies(expr: string, ans: number, max = 4): EnemySeed[] {
  const out: EnemySeed[] = []
  for (const tok of tokenize(expr)) {
    if (tok.t === 'num') out.push({ label: tok.raw.slice(0, 6), value: tok.v })
    else if (tok.t === 'const') {
      if (tok.v === 'π') out.push({ label: 'PI', value: Math.PI })
      else if (tok.v === 'e') out.push({ label: 'E', value: Math.E })
      else out.push({ label: 'ANS', value: ans })
    }
    if (out.length >= max) break
  }
  return out
}
