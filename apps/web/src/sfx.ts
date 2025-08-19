
let ctx: AudioContext | null = null;
function ensureCtx() {
  if (!ctx) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctx();
  }
  return ctx!;
}
export function click() {
  const c = ensureCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square'; o.frequency.value = 440;
  g.gain.value = 0.05;
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.06);
}
export function pop() {
  // more realistic pop: short noise burst + bandpass 'snap'
  const c = ensureCtx();
  // noise burst
  const buffer = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * (1 - i/data.length); }
  const src = c.createBufferSource(); src.buffer = buffer;
  const bp = c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1500; bp.Q.value=3;
  const g = c.createGain(); g.gain.value = 0.4;
  src.connect(bp).connect(g).connect(c.destination);
  src.start();
  // snap osc
  const o = c.createOscillator(), og = c.createGain();
  o.type='triangle'; o.frequency.value=1200;
  og.gain.value=0.06; o.connect(og).connect(c.destination);
  const t=c.currentTime; o.frequency.exponentialRampToValueAtTime(120, t+0.08);
  og.gain.exponentialRampToValueAtTime(0.0001, t+0.08); o.start(); o.stop(t+0.09);
}
export function dong() {
  const c = ensureCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine'; o.frequency.value = 220;
  g.gain.value = 0.001;
  o.connect(g).connect(c.destination);
  const t = c.currentTime;
  g.gain.linearRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.start(); o.stop(t + 0.62);
}
export function boom() {
  const c = ensureCtx();
  const b = c.createBuffer(1, c.sampleRate*0.4, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i=0;i<d.length;i++){ d[i]=(Math.random()*2-1)*(1 - i/d.length); }
  const src = c.createBufferSource(); src.buffer = b;
  const low = c.createBiquadFilter(); low.type='lowpass'; low.frequency.value=800;
  const g = c.createGain(); g.gain.value = 0.3;
  src.connect(low).connect(g).connect(c.destination);
  src.start();
}
