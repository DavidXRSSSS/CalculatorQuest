// Hypnotic procedural soundtrack for the golden-spiral fight: a looping arpeggio sequencer whose tempo climbs with each wave.

const ARP_CHORDS = [
  [220, 261.63, 329.63, 440],
  [174.61, 220, 261.63, 349.23],
  [261.63, 329.63, 392, 523.25],
  [196, 246.94, 293.66, 392],
]
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 1, 2, 3, 1]
const BASS_STEPS = new Set([0, 3, 6, 8, 11, 14])
const BASE_BPM = 112
const LOOKAHEAD = 0.12

export class FibonacciAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private delaySend: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: number | undefined
  private step = 0
  private nextTime = 0
  private bpm = BASE_BPM

  constructor(private isMuted: () => boolean) {}

  private ensure() {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      const ctx = new AC()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0.32
      this.master.connect(ctx.destination)

      const delay = ctx.createDelay(1)
      delay.delayTime.value = (60 / this.bpm) * 0.75
      const feedback = ctx.createGain()
      feedback.gain.value = 0.38
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = 2400
      this.delaySend = ctx.createGain()
      this.delaySend.gain.value = 0.45
      this.delaySend.connect(delay)
      delay.connect(tone)
      tone.connect(feedback)
      feedback.connect(delay)
      tone.connect(this.master)

      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noise = buffer
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private tone(t: number, type: OscillatorType, freq: number, dur: number, vol: number, opts: { to?: number; cutoff?: number; send?: boolean } = {}) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008)
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
    if (opts.send && this.delaySend) gain.connect(this.delaySend)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private hat(t: number, vol: number) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7000
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + 0.06)
  }

  private scheduleStep(t: number) {
    if (this.isMuted()) return
    const s = this.step % 16
    const chord = ARP_CHORDS[Math.floor(this.step / 16) % ARP_CHORDS.length]
    const note = chord[ARP_ORDER[s]] * (s >= 8 && s % 3 === 0 ? 2 : 1)
    const sixteenth = 60 / this.bpm / 4
    this.tone(t, 'square', note, sixteenth * 1.6, 0.07, { cutoff: 1800 + 900 * Math.sin(this.step * 0.13), send: true })
    this.tone(t, 'sine', note * 2, sixteenth * 0.9, 0.035, { send: true })
    if (s % 4 === 0) this.tone(t, 'sine', 150, 0.22, 0.7, { to: 42 })
    if (BASS_STEPS.has(s)) this.tone(t, 'sawtooth', chord[0] / 4, sixteenth * 1.8, 0.16, { cutoff: 520 })
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.12 : 0.06)
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

  setWave(wave: number) {
    this.bpm = BASE_BPM + wave * 7
  }

  warp() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    const t = ctx.currentTime
    this.tone(t, 'sawtooth', 880, 1.4, 0.18, { to: 55, cutoff: 1400, send: true })
    this.tone(t + 0.1, 'square', 110, 1.2, 0.12, { to: 1320, cutoff: 2200, send: true })
    this.tone(t, 'sine', 70, 1.6, 0.5, { to: 30 })
  }

  hit() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    this.tone(ctx.currentTime, 'square', 320, 0.18, 0.14, { to: 90, cutoff: 1600 })
  }

  implode() {
    const ctx = this.ensure()
    if (!ctx || this.isMuted()) return
    const t = ctx.currentTime
    this.tone(t, 'sawtooth', 60, 1.3, 0.2, { to: 1760, cutoff: 3000, send: true })
    ;[523.25, 659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.tone(t + 1.3 + i * 0.08, 'triangle', f, 1.8, 0.1, { send: true }))
    this.tone(t + 1.3, 'sine', 90, 1.4, 0.8, { to: 30 })
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
    this.delaySend = null
  }
}
