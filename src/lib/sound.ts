/**
 * Micro Web Audio synthesizer for tactile & acoustic feedback.
 * Zero external audio files, zero network latency, pure native Web Audio API.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const playSound = {
  /** Subtle mechanical click (button presses, navigation) */
  click: () => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(8);
      }
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // Audio autoplay policy fallback
    }
  },

  /** Crisp toggle sound */
  toggle: () => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(12);
      }
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // Silently fail
    }
  },

  /** Success chord (recording saved, session logged, goal reached) */
  success: () => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([15, 40, 25]);
      }
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.035, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.35);
      });
    } catch {
      // Silently fail
    }
  },

  /** Warning chime (approaching time limit in cante, 14m or 15m) */
  warning: () => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
      }
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      [880, 784].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.07, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.25);
      });
    } catch {
      // Silently fail
    }
  },

  /** Tribunal Bell: Oficial 15 min limit gong / chime */
  bell: () => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([80, 100, 80]);
      }
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [1046.5, 2093.0];
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      });
    } catch {
      // Silently fail
    }
  }
};
