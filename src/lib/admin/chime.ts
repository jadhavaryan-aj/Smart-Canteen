/**
 * A short two-note chime synthesised with Web Audio (no audio file needed).
 * Browsers only allow audio after a user gesture, so `primeAudio` must be
 * called from a click (e.g. when staff switch sound on).
 */
let context: AudioContext | null = null;

export async function primeAudio(): Promise<boolean> {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch {
    return false;
  }
}

export function playChime(): void {
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  const notes = [
    { frequency: 880, at: 0 },
    { frequency: 1318.5, at: 0.18 },
  ];
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(0.25, start + note.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + 0.6);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + note.at);
    oscillator.stop(start + note.at + 0.65);
  }
}
