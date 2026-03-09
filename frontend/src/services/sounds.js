// ═══════════════════════════════════════════════════════════
//  sounds.js — Web Audio API sounds, zero dependencies
//  Fix: always resume ctx before playing; stopAllSounds nuclear option
// ═══════════════════════════════════════════════════════════

let _ctx = null;
const getCtx = () => {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
};

// Always call this before any sound — resumes suspended context
export const resumeAudio = () => {
  try { const c = getCtx(); if (c.state !== "running") c.resume(); } catch {}
};

// ── One-shot sounds ──────────────────────────────────────────

export const playMessageSound = () => {
  try {
    resumeAudio();
    const c = getCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, c.currentTime + 0.06);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    o.start(c.currentTime); o.stop(c.currentTime + 0.25);
  } catch {}
};

export const playSentSound = () => {
  try {
    resumeAudio();
    const c = getCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(520, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(780, c.currentTime + 0.08);
    g.gain.setValueAtTime(0.1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.start(c.currentTime); o.stop(c.currentTime + 0.2);
  } catch {}
};

let _lastTypingSound = 0;
export const playTypingSound = () => {
  const now = Date.now();
  if (now - _lastTypingSound < 600) return;
  _lastTypingSound = now;
  try {
    resumeAudio();
    const c = getCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "sine"; o.frequency.value = 1100;
    g.gain.setValueAtTime(0.035, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
    o.start(c.currentTime); o.stop(c.currentTime + 0.06);
  } catch {}
};

export const playCallConnected = () => {
  try {
    resumeAudio();
    const c = getCtx();
    [440, 550, 660].forEach((freq, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = "sine"; o.frequency.value = freq;
      const t = c.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.38);
    });
  } catch {}
};

export const playHangup = () => {
  try {
    resumeAudio();
    const c = getCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(480, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.4);
    g.gain.setValueAtTime(0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.42);
    o.start(c.currentTime); o.stop(c.currentTime + 0.45);
  } catch {}
};

// ── Looping rings ────────────────────────────────────────────
// Each ring function tracks its own nodes so we can stop them precisely

let _ringInterval = null;
let _ringNodes = [];   // track active oscillator nodes for hard-stop

const _playRingOnce = () => {
  try {
    resumeAudio();
    const c = getCtx();
    [880, 1100].forEach((freq, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = "sine"; o.frequency.value = freq;
      const t = c.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.start(t); o.stop(t + 0.32);
      _ringNodes.push(o);
      o.onended = () => { _ringNodes = _ringNodes.filter(n => n !== o); };
    });
  } catch {}
};

export const startCallRing = () => {
  stopCallRing(); // always clear before starting
  _playRingOnce();
  _ringInterval = setInterval(_playRingOnce, 2200);
};

export const stopCallRing = () => {
  if (_ringInterval) { clearInterval(_ringInterval); _ringInterval = null; }
  // Hard-stop any still-playing nodes
  _ringNodes.forEach(n => { try { n.stop(); } catch {} });
  _ringNodes = [];
};

let _outRingInterval = null;
let _outRingNodes = [];

const _playOutRingOnce = () => {
  try {
    resumeAudio();
    const c = getCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "sine"; o.frequency.value = 440;
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    o.start(c.currentTime); o.stop(c.currentTime + 0.55);
    _outRingNodes.push(o);
    o.onended = () => { _outRingNodes = _outRingNodes.filter(n => n !== o); };
  } catch {}
};

export const startOutgoingRing = () => {
  stopOutgoingRing();
  _playOutRingOnce();
  _outRingInterval = setInterval(_playOutRingOnce, 3000);
};

export const stopOutgoingRing = () => {
  if (_outRingInterval) { clearInterval(_outRingInterval); _outRingInterval = null; }
  _outRingNodes.forEach(n => { try { n.stop(); } catch {} });
  _outRingNodes = [];
};

// ── Nuclear option: stop EVERYTHING ─────────────────────────
export const stopAllSounds = () => {
  stopCallRing();
  stopOutgoingRing();
  // Close and recreate the AudioContext to kill any zombie nodes
  try { if (_ctx) { _ctx.close(); _ctx = null; } } catch {}
};