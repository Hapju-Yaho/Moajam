import type { GuitarTone } from './scoreGuitar';

// One shared effect bus per passage preserves the interaction between chord strings.
export function createGuitarToneRoute(
  context: BaseAudioContext,
  destination: AudioNode,
  changes: { beat: number; tone: GuitarTone }[],
  when: number,
  from: number,
  to: number,
  bpm: number,
) {
  const active = changes.filter((c) => c.beat <= from + 1e-7).at(-1)?.tone ?? 'clean';
  const inside = changes.filter((c) => c.beat > from + 1e-7 && c.beat < to);
  if (active === 'clean' && !inside.some((c) => c.tone !== 'clean')) return destination;
  const input = context.createGain(),
    clean = context.createGain();
  const nodes: AudioNode[] = [input, clean];
  input.connect(clean).connect(destination);
  const routes: Record<GuitarTone, GainNode> = {
    clean,
    overdrive: context.createGain(),
    distortion: context.createGain(),
  };
  for (const tone of ['overdrive', 'distortion'] as const) {
    const shaper = context.createWaveShaper(),
      filter = context.createBiquadFilter();
    const curve = new Float32Array(2049),
      amount = tone === 'overdrive' ? 5 : 16;
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = (Math.tanh(amount * x) / Math.tanh(amount)) * 0.42;
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    filter.type = 'lowpass';
    filter.frequency.value = tone === 'overdrive' ? 4800 : 6200;
    filter.Q.value = 0.7;
    input.connect(shaper).connect(filter).connect(routes[tone]).connect(destination);
    nodes.push(shaper, filter, routes[tone]);
  }
  for (const [tone, gain] of Object.entries(routes)) {
    gain.gain.setValueAtTime(tone === active ? 1 : 0, when);
    let previous = tone === active ? 1 : 0;
    for (const change of inside) {
      const time = when + ((change.beat - from) * 60) / bpm;
      gain.gain.setValueAtTime(previous, time);
      previous = tone === change.tone ? 1 : 0;
      gain.gain.linearRampToValueAtTime(previous, time + 0.003);
    }
  }
  // The silent clock releases the routing graph after the scheduled passage finishes.
  const clock = context.createConstantSource();
  clock.offset.value = 0;
  clock.connect(input);
  clock.onended = () => {
    clock.disconnect();
    nodes.forEach((n) => n.disconnect());
  };
  clock.start(when);
  clock.stop(when + ((to - from) * 60) / bpm + 0.1);
  return input;
}
