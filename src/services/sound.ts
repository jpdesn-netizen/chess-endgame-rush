// Petits sons synthétisés (Web Audio) : aucun fichier à charger.
// Préférence mémorisée dans le navigateur (activés par défaut).

type SoundName = 'move' | 'capture' | 'success' | 'error';

const KEY = 'endgameRush:v1:sound';
let ctx: AudioContext | null = null;

export function isSoundOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* préférence non conservée */
  }
}

function tone(freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

export function playSound(name: SoundName): void {
  if (!isSoundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    switch (name) {
      case 'move':
        tone(420, 0, 0.06, 0.15, 'triangle');
        break;
      case 'capture':
        tone(300, 0, 0.08, 0.2, 'square');
        break;
      case 'success':
        tone(660, 0, 0.1, 0.15);
        tone(990, 0.08, 0.14, 0.15);
        break;
      case 'error':
        tone(180, 0, 0.25, 0.2, 'sawtooth');
        break;
    }
  } catch {
    /* audio indisponible */
  }
}
