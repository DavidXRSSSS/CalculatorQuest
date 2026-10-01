export class DemonAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private drones: OscillatorNode[] = []

  constructor(private isMuted: () => boolean) {}

  get rumbling() {
    return this.drones.length > 0
  }

  private ensure() {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.6
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private sweep(type: OscillatorType, from: number, to: number, duration: number, volume: number, cutoff?: number) {
    const ctx = this.ensure()
    if (!ctx || !this.master || this.isMuted()) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + duration)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    if (cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      osc.connect(filter)
      filter.connect(gain)
    } else osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  }

  thud() {
    this.sweep('sine', 110, 32, 0.45, 0.9)
    this.sweep('triangle', 70, 28, 0.3, 0.5, 300)
  }

  bassDrop() {
    this.sweep('sawtooth', 140, 28, 1.6, 0.55, 420)
    this.sweep('sine', 60, 24, 1.8, 0.95)
    this.sweep('square', 220, 40, 0.25, 0.25, 900)
  }

  startRumble() {
    const ctx = this.ensure()
    if (!ctx || !this.master || this.isMuted() || this.drones.length) return
    const gain = ctx.createGain()
    gain.gain.value = 0.18
    gain.connect(this.master)
    ;[55, 58, 110].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = i === 2 ? 'square' : 'sawtooth'
      osc.frequency.value = freq
      osc.connect(gain)
      osc.start()
      this.drones.push(osc)
    })
  }

  stopAll() {
    this.drones.forEach((osc) => {
      try {
        osc.stop()
      } catch {}
    })
    this.drones = []
  }

  close() {
    this.stopAll()
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
