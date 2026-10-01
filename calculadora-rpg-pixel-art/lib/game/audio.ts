export type SfxName =
  | 'click'
  | 'equals'
  | 'crack'
  | 'split'
  | 'emerge'
  | 'shoot'
  | 'warn'
  | 'beam'
  | 'hit'
  | 'graze'
  | 'dodge'
  | 'attack'
  | 'phase'
  | 'bounce'
  | 'pop'
  | 'victory'
  | 'rebuild'
  | 'join'
  | 'explosion'
  | 'break'
  | 'gameover'
  | 'type'
  | 'error'
  | 'heal'
  | 'boot'
  | 'soulcrack'
  | 'soulshatter'
  | 'menu'

const THROTTLE: Partial<Record<SfxName, number>> = {
  shoot: 70,
  graze: 90,
  type: 28,
  bounce: 80,
  emerge: 60,
  warn: 110,
  beam: 90,
  pop: 60,
}

const MASTER_VOLUME = 0.32

class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private last = new Map<SfxName, number>()
  muted = false

  private ensure() {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime)
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.2,
    slide?: number,
    delay = 0,
  ) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noise(dur: number, vol = 0.2, freq = 1200, slide?: number, delay = 0) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noiseBuf) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(freq, t)
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filter).connect(gain).connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  play(name: SfxName) {
    const ctx = this.ensure()
    if (!ctx || this.muted) return
    const throttle = THROTTLE[name]
    if (throttle) {
      const now = performance.now()
      if (now - (this.last.get(name) ?? 0) < throttle) return
      this.last.set(name, now)
    }
    switch (name) {
      case 'click':
        this.tone(660, 0.05, 'square', 0.12)
        this.tone(990, 0.04, 'square', 0.08, undefined, 0.03)
        break
      case 'equals':
        this.tone(440, 0.08, 'square', 0.2)
        this.tone(660, 0.08, 'square', 0.2, undefined, 0.08)
        this.tone(880, 0.18, 'square', 0.22, undefined, 0.16)
        break
      case 'crack':
        this.noise(0.3, 0.5, 4000, 300)
        this.tone(1800, 0.12, 'sawtooth', 0.12, 200)
        break
      case 'split':
        this.noise(0.7, 0.45, 900, 80)
        this.tone(220, 0.7, 'sawtooth', 0.22, 45)
        this.tone(110, 0.5, 'square', 0.18, 40, 0.1)
        break
      case 'emerge':
        this.tone(300, 0.14, 'square', 0.14, 900)
        break
      case 'shoot':
        this.tone(880, 0.06, 'square', 0.05, 420)
        break
      case 'warn':
        this.tone(1250, 0.07, 'square', 0.1)
        this.tone(1250, 0.07, 'square', 0.1, undefined, 0.12)
        break
      case 'beam':
        this.noise(0.45, 0.28, 2400, 300)
        this.tone(130, 0.45, 'sawtooth', 0.18, 55)
        break
      case 'hit':
        this.tone(190, 0.2, 'square', 0.3, 55)
        this.noise(0.16, 0.3, 1600)
        break
      case 'graze':
        this.tone(1650, 0.04, 'triangle', 0.08)
        break
      case 'dodge':
        this.tone(988, 0.08, 'triangle', 0.18)
        this.tone(1319, 0.14, 'triangle', 0.18, undefined, 0.08)
        break
      case 'attack':
        this.tone(520, 0.06, 'square', 0.12)
        this.tone(780, 0.07, 'square', 0.12, undefined, 0.06)
        break
      case 'phase':
        ;[220, 208, 196, 185].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.2, undefined, i * 0.18))
        this.noise(1, 0.3, 600, 60, 0.1)
        this.tone(440, 0.5, 'square', 0.2, 880, 0.8)
        break
      case 'boot':
        this.noise(0.12, 0.12, 3200, 400)
        this.tone(1760, 0.05, 'square', 0.08)
        this.tone(1760, 0.05, 'square', 0.08, undefined, 0.09)
        this.tone(220, 0.22, 'square', 0.12, 1320, 0.3)
        this.tone(2093, 0.12, 'triangle', 0.1, undefined, 0.52)
        this.tone(90, 0.2, 'square', 0.2, 45, 0.65)
        this.noise(0.18, 0.22, 900, 80, 0.65)
        break
      case 'bounce':
        this.tone(420, 0.05, 'square', 0.08, 700)
        break
      case 'pop':
        this.noise(0.35, 0.4, 2000, 120)
        this.tone(600, 0.2, 'square', 0.15, 80)
        break
      case 'victory':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.18, undefined, i * 0.11))
        this.tone(1047, 0.6, 'triangle', 0.22, undefined, 0.48)
        this.tone(784, 0.6, 'triangle', 0.14, undefined, 0.48)
        break
      case 'rebuild':
        this.tone(160, 0.7, 'sawtooth', 0.16, 900)
        this.noise(0.6, 0.18, 400, 3000)
        break
      case 'join':
        this.noise(0.12, 0.4, 3000)
        this.tone(1047, 0.1, 'square', 0.18)
        this.tone(1568, 0.3, 'triangle', 0.2, undefined, 0.08)
        break
      case 'explosion':
        this.noise(1.4, 0.6, 1400, 50)
        this.tone(90, 1.1, 'sawtooth', 0.35, 28)
        this.noise(0.6, 0.4, 3000, 200, 0.25)
        break
      case 'break':
        this.tone(330, 0.12, 'square', 0.25, 110)
        this.noise(0.25, 0.35, 2500, 200, 0.05)
        break
      case 'gameover':
        ;[392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, undefined, i * 0.28))
        break
      case 'type':
        this.tone(900 + Math.random() * 300, 0.025, 'square', 0.035)
        break
      case 'error':
        this.tone(150, 0.14, 'square', 0.2)
        this.tone(120, 0.2, 'square', 0.2, undefined, 0.15)
        break
      case 'soulcrack':
        this.noise(0.08, 0.55, 6000, 1800)
        this.tone(1400, 0.05, 'square', 0.22, 700)
        this.tone(220, 0.16, 'square', 0.2, 90, 0.03)
        break
      case 'soulshatter':
        this.noise(0.35, 0.4, 5000, 400)
        ;[1200, 950, 1500, 800].forEach((f, i) => this.tone(f, 0.06, 'square', 0.1, f * 0.6, i * 0.045))
        break
      case 'menu':
        this.tone(1175, 0.04, 'square', 0.1)
        break
      case 'heal':
        ;[660, 880, 1100].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.16, undefined, i * 0.07))
        break
    }
  }
}

export const sfx = new Sfx()
