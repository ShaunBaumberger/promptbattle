/**
 * Stage audio cue engine. Generates short sound effects via the Web Audio API
 * (no asset bundling needed). All cues are intentionally simple two-to-four
 * note motifs so they cut through room ambience without becoming annoying.
 *
 * Browsers gate audio behind a user gesture, so the stage UI must call
 * `audio.enable()` from a click handler the first time. Subsequent cues fire
 * without further interaction.
 */

export type Cue =
  | "matchStart" // ascending fanfare — heads-up, look at the screen
  | "tenSecondTick" // single short beep at the 10s warning
  | "lockTimeUp" // descending tone — time's up
  | "votingStart" // bright chord — voters can vote now
  | "winnerReveal" // triumphant arpeggio when crown drops
  | "champion"; // longer fanfare for tournament-end

interface Note {
  freq: number;
  /** Start offset in seconds. */
  at: number;
  /** Duration in seconds. */
  dur: number;
  /** Peak gain (0..1). */
  gain?: number;
  /** Waveform; default 'sine' (warm). */
  type?: OscillatorType;
}

const CUES: Record<Cue, Note[]> = {
  // Three ascending notes (C5, E5, G5) — classic "ding ding!" attention grab.
  matchStart: [
    { freq: 523.25, at: 0, dur: 0.18, type: "triangle", gain: 0.4 },
    { freq: 659.25, at: 0.18, dur: 0.18, type: "triangle", gain: 0.4 },
    { freq: 783.99, at: 0.36, dur: 0.32, type: "triangle", gain: 0.45 },
  ],
  // Single quick beep — restrained so it doesn't dominate the last seconds.
  tenSecondTick: [
    { freq: 880, at: 0, dur: 0.08, type: "square", gain: 0.18 },
  ],
  // Two descending notes — "buzzer".
  lockTimeUp: [
    { freq: 659.25, at: 0, dur: 0.16, type: "sawtooth", gain: 0.35 },
    { freq: 392, at: 0.18, dur: 0.32, type: "sawtooth", gain: 0.35 },
  ],
  // Bright chord — three voices held briefly.
  votingStart: [
    { freq: 783.99, at: 0, dur: 0.5, type: "triangle", gain: 0.25 },
    { freq: 987.77, at: 0, dur: 0.5, type: "triangle", gain: 0.25 },
    { freq: 1174.66, at: 0, dur: 0.5, type: "triangle", gain: 0.25 },
  ],
  // Triumphant arpeggio (C5 E5 G5 C6) — winner reveal.
  winnerReveal: [
    { freq: 523.25, at: 0, dur: 0.14, type: "triangle", gain: 0.4 },
    { freq: 659.25, at: 0.14, dur: 0.14, type: "triangle", gain: 0.4 },
    { freq: 783.99, at: 0.28, dur: 0.14, type: "triangle", gain: 0.4 },
    { freq: 1046.5, at: 0.42, dur: 0.5, type: "triangle", gain: 0.5 },
  ],
  // Longer multi-note fanfare for the championship moment.
  champion: [
    { freq: 523.25, at: 0, dur: 0.18, type: "triangle", gain: 0.4 },
    { freq: 783.99, at: 0.18, dur: 0.18, type: "triangle", gain: 0.4 },
    { freq: 1046.5, at: 0.36, dur: 0.18, type: "triangle", gain: 0.45 },
    { freq: 783.99, at: 0.54, dur: 0.18, type: "triangle", gain: 0.4 },
    { freq: 1046.5, at: 0.72, dur: 0.5, type: "triangle", gain: 0.55 },
    { freq: 1318.51, at: 0.72, dur: 0.5, type: "triangle", gain: 0.4 },
  ],
};

export class StageAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = false;

  /** True once a user gesture has unlocked the audio context. */
  isEnabled(): boolean {
    return this.enabled && this.ctx?.state === "running";
  }

  /** Must be called from a user-gesture handler to satisfy autoplay policy. */
  async enable(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    this.enabled = true;
  }

  /** Plays a cue. No-op if audio hasn't been enabled yet. */
  play(cue: Cue): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    for (const note of CUES[cue]) {
      this.scheduleNote(now + note.at, note);
    }
  }

  private scheduleNote(startTime: number, note: Note) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = note.type ?? "sine";
    osc.frequency.value = note.freq;

    const env = this.ctx.createGain();
    const peak = note.gain ?? 0.3;
    // 5 ms attack, then exponential decay to silence over `dur`.
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(peak, startTime + 0.005);
    env.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * 0.001),
      startTime + note.dur,
    );

    osc.connect(env).connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + note.dur + 0.02);
  }
}
