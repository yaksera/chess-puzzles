// Small synthesized sound set (Web Audio), so the app ships with no audio files.

export type SoundName = 'move' | 'capture' | 'check' | 'correct' | 'wrong' | 'solved'

let ctx: AudioContext | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Short filtered noise burst: sounds like a piece landing on wood. */
function knock(ac: AudioContext, at: number, freq: number, gain: number, length = 0.07) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3)
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.2
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(at)
}

function tone(ac: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

/**
 * iOS Safari only starts Web Audio inside a user gesture. Call this from the first
 * tap so later sounds (including timer-driven opponent moves) can play.
 */
export function unlockAudio() {
  const ac = audio()
  if (!ac) return
  const src = ac.createBufferSource()
  src.buffer = ac.createBuffer(1, 1, 22050)
  src.connect(ac.destination)
  src.start(0)
}

export function play(name: SoundName) {
  if (muted) return
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  switch (name) {
    case 'move':
      knock(ac, t, 900, 1.6)
      break
    case 'capture':
      knock(ac, t, 1300, 1.8, 0.05)
      knock(ac, t + 0.045, 700, 1.4)
      break
    case 'check':
      knock(ac, t, 900, 1.4)
      tone(ac, t + 0.02, 880, 0.18, 0.12, 'triangle')
      break
    case 'correct':
      tone(ac, t, 784, 0.16, 0.12)
      tone(ac, t + 0.08, 1047, 0.22, 0.12)
      break
    case 'wrong':
      tone(ac, t, 220, 0.25, 0.14, 'square')
      tone(ac, t + 0.1, 185, 0.3, 0.12, 'square')
      break
    case 'solved':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(ac, t + i * 0.09, f, 0.35, 0.11, 'triangle'))
      break
  }
}
