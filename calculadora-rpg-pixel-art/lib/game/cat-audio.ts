// Procedural chiptune for the secret cat-knight fight: a frantic minor-key battle loop plus 8-bit meows and spear effects.

const BASE_BPM = 176
const LOOKAHEAD = 0.12
const A4 = 440
const CHORD_SHIFT = [0, -4, -2, -5]
const LEAD: (number | null)[] = [0, null, 3, 5, 7, null, 5, 3, 0, null, -2, 0, 3, 5, 3, null]
const LEAD_FAST: (number | null)[] = [12, 7, 3, 7, 12, 15, 12, 7, 10, 7, 3, 7, 10, 12, 10, 7]
const BASS: number[] = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 10, 7]

const semis = (base: number, n: number) => base * Math.pow(2, n / 12)

function getAudioContextClass() {
  if (typeof window === 'undefined') return null
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null
}

function scheduleMeow(ctx: AudioContext, destination: AudioNode, t: number, vol = 0.22) {
  const osc = ctx.createOscillator()
  const sub = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = 'square'
  sub.type = 'triangle'
  osc.frequency.setValueAtTime(520, t)
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.13)
  osc.frequency.exponentialRampToValueAtTime(430, t + 0.52)
  sub.frequency.setValueAtTime(1040, t)
  sub.frequency.exponentialRampToValueAtTime(1800, t + 0.13)
  sub.frequency.exponentialRampToValueAtTime(860, t + 0.52)
  filter.type = 'bandpass'
  filter.Q.value = 3
  filter.frequency.setValueAtTime(800, t)
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.14)
  filter.frequency.exponentialRampToValueAtTime(700, t + 0.55)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.03)
  gain.gain.setValueAtTime(vol, t + 0.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58)
  osc.connect(filter)
  sub.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  osc.start(t)
  sub.start(t)
  osc.stop(t + 0.62)
  sub.stop(t + 0.62)
}

export function playMeow(muted: boolean) {
  if (muted) return
  const AC = getAudioContextClass()
  if (!AC) return
  const ctx = new AC()
  scheduleMeow(ctx, ctx.destination, ctx.currentTime + 0.02)
  scheduleMeow(ctx, ctx.destination, ctx.currentTime + 0.75, 0.16)
  window.setTimeout(() => void ctx.close(), 1600)
}

export class CatAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: number | undefined
  private step = 0
  private nextTime = 0
  private bpm = BASE_BPM
  private phase = 1

  constructor(private isMuted: () => boolean) {}

  private ensure() {
    if (!this.ctx) {
      const AC = getAudioContextClass()
      if (!AC) return null
      const ctx = new AC()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0.3
      this.master.connect(ctx.destination)
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noise = buffer
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private tone(t: number, type: OscillatorType, freq: number, dur: number, vol: number, opts: { to?: number; cutoff?: number } = {}) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let node: AudioNode = osc
    if (opts.cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = opts.cutoff
      osc.connect(filter)
      node = filter
    }
    node.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, sweepTo?: number) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(freq, t)
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  private scheduleStep(t: number) {
    if (this.isMuted()) return
    const s = this.step % 16
    const shift = CHORD_SHIFT[Math.floor(this.step / 16) % CHORD_SHIFT.length]
    const sixteenth = 60 / this.bpm / 4
    const root = semis(A4 / 4, shift)

    if (s % 2 === 0) this.tone(t, 'sawtooth', semis(root, BASS[s]), sixteenth * 1.7, 0.14, { cutoff: 700 })
    if (s % 4 === 0) this.tone(t, 'sine', 160, 0.16, 0.8, { to: 40 })
    if (s === 4 || s === 12) this.noiseHit(t, 0.14, 0.32, 'bandpass', 1800)
    if (s % 2 === 1) this.noiseHit(t, 0.04, 0.08, 'highpass', 8000)

    const lead = this.phase >= 3 ? LEAD_FAST[s] : LEAD[s]
    if (lead !== null) this.tone(t, 'square', semis(A4, lead + shift), sixteenth * 0.95, 0.06, { cutoff: 3200 })
    if (this.phase >= 2 && s % 4 === 2) this.tone(t, 'square', semis(A4 * 2, shift + (s === 6 ? 7 : 3)), sixteenth * 0.6, 0.035)
  }

  private tick = () => {
    const ctx = this.ctx
    if (!ctx) return
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.nextTime)
      this.nextTime += 60 / this.bpm / 4
      this.step++
    }
  }

  start() {
    const ctx = this.ensure()
    if (!ctx || this.timer !== undefined) return
    this.step = 0
    this.nextTime = ctx.currentTime + 0.05
    this.timer = window.setInterval(this.tick, 25)
  }

  setPhase(phase: number) {
    this.phase = phase
    this.bpm = BASE_BPM + (phase - 1) * 10
  }

  meow() {
    const ctx = this.ensure()
    if (!ctx || !this.master || this.isMuted()) return
    scheduleMeow(ctx, this.master, ctx.currentTime + 0.01, 0.5)
  }

  spear() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    this.tone(ctx.currentTime, 'square', 1400, 0.12, 0.05, { to: 500, cutoff: 3000 })
  }

  thud() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    this.tone(ctx.currentTime, 'triangle', 180, 0.1, 0.12, { to: 60 })
  }

  sweep() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    this.noiseHit(ctx.currentTime, 0.45, 0.35, 'bandpass', 400, 4000)
    this.tone(ctx.currentTime, 'sawtooth', 110, 0.45, 0.1, { to: 440, cutoff: 1800 })
  }

  warn() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    const t = ctx.currentTime
    this.tone(t, 'square', 988, 0.07, 0.06)
    this.tone(t + 0.1, 'square', 988, 0.07, 0.06)
  }

  ring() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    this.tone(ctx.currentTime, 'triangle', 660, 0.25, 0.08, { to: 1320 })
  }

  plant() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    const t = ctx.currentTime
    this.tone(t, 'sine', 120, 0.5, 0.9, { to: 35 })
    this.noiseHit(t, 0.35, 0.4, 'lowpass', 900)
  }

  hit() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    this.tone(ctx.currentTime, 'square', 300, 0.18, 0.14, { to: 80, cutoff: 1600 })
  }

  victory() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    const t = ctx.currentTime
    ;[0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(t + i * 0.11, 'square', semis(A4, n + 3), 0.2, 0.08, { cutoff: 3500 }))
    this.tone(t + 0.8, 'triangle', semis(A4, 15), 1.2, 0.12)
    if (this.master) scheduleMeow(ctx, this.master, t + 1.3, 0.45)
  }

  stop() {
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
  }

  close() {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
