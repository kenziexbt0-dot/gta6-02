// All sound is synthesised with WebAudio: no audio files ship in the
// game, so the entry stays small and loads nothing over the network.
// Engine hum, sirens, impacts, gunshots and jingles are small oscillator
// and noise recipes, mixed through one master gain with a mute toggle.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows the car's speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a square wave that alternates between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  window.__solmarinaUnlockAudio = unlock;

  function blip(freq, seconds, type, volume, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + seconds + 0.02);
    } catch {
      // Audio is decoration: a failure never breaks the game.
    }
  }

  function noise(seconds, volume, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.value = volume || 0.25;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // Audio is decoration: a failure never breaks the game.
    }
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** Called every frame: engine pitch from speed, siren while wanted.
     * copDist, when given, fades the siren as the nearest patrol car
     * gets farther away. */
    update(dt, speed, wanted, copDist) {
      if (!ctx || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (engineOsc && engineGain) {
        const target = speed > 4 ? 0.05 + Math.min(0.12, speed / 520 * 0.1) : 0;
        engineGain.gain.value += (target - engineGain.gain.value) * Math.min(1, dt * 8);
        engineOsc.frequency.value = 52 + Math.min(190, speed * 0.32);
      }
      if (sirenOsc && sirenGain) {
        if (wanted > 0) {
          sirenTimer -= dt;
          if (sirenTimer <= 0) {
            sirenTimer = 0.42;
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.value = sirenHigh ? 950 : 700;
          }
          const near = copDist === undefined ? 1 : Math.max(0.15, 1 - copDist / 900);
          sirenGain.gain.value = 0.045 * near;
        } else {
          sirenGain.gain.value = 0;
        }
      }
    },
    pickup() { blip(660, 0.12, 'sine', 0.22, 990); },
    cash() { blip(880, 0.09, 'triangle', 0.2); setTimeout(() => blip(1320, 0.14, 'triangle', 0.2), 90); },
    crash() { noise(0.22, 0.3, 900); },
    punch() { noise(0.08, 0.2, 1600); },
    gunshot() { noise(0.12, 0.32, 2400); blip(180, 0.1, 'square', 0.14, 70); },
    horn() { blip(370, 0.22, 'square', 0.1, 370); },
    skid() { noise(0.18, 0.14, 700); },
    door() { blip(150, 0.09, 'square', 0.13, 85); },
    mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.22), i * 110)); },
    fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.2), i * 130)); },
    busted() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.14), i * 160)); },
  };
}
