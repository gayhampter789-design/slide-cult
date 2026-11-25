export class Controls {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.touch = { left:false, right:false, throttle:false, brake:false, handbrake:false };
    this.prev = { pause:false, shiftUp:false, shiftDown:false, boost:false };
    this.lastInput = 'keyboard';
    this.gamepadName = 'No controller detected';
    this.bindKeys();
    this.bindTouch();
    window.addEventListener('gamepadconnected', e => { this.gamepadName = e.gamepad.id; this.lastInput = 'gamepad'; this.updateDeviceStatus(); });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadName = 'No controller detected'; this.updateDeviceStatus(); });
  }
  bindKeys() {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === 'escape') window.dispatchEvent(new CustomEvent('slidecult:pause'));
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); Object.keys(this.touch).forEach(k => this.touch[k] = false); });
  }
  bindTouch() {
    document.querySelectorAll('[data-touch]').forEach(button => {
      const action = button.dataset.touch;
      const down = e => { e.preventDefault(); this.touch[action] = true; button.setPointerCapture?.(e.pointerId); };
      const up = e => { e.preventDefault(); this.touch[action] = false; };
      button.addEventListener('pointerdown', down);
      ['pointerup','pointercancel','lostpointercapture'].forEach(type => button.addEventListener(type, up));
    });
  }
  updateDeviceStatus() {
    const el = document.getElementById('device-status');
    if (!el) return;
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    el.textContent = pads.length ? `Detected: ${pads.map(p => p.id).join(' · ')}` : 'No gamepad or wheel detected. Connect a device, then press a button or move an axis.';
  }
  getGamepad() {
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    if (!pads.length) return null;
    return pads.find(p => p.mapping === 'standard') || pads[0];
  }
  pressedEdge(name, current) {
    const was = this.prev[name];
    this.prev[name] = current;
    return current && !was;
  }
  read() {
    const mode = this.settings.inputMode || 'auto';
    const gp = this.getGamepad();
    const wheelMode = mode === 'wheel';
    let selected = mode;
    if (mode === 'auto') {
      if (gp) selected = this.lastInput === 'wheel' ? 'wheel' : 'gamepad';
      else if (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches) selected = 'touch';
      else selected = 'keyboard';
    }
    if (selected === 'gamepad' && !gp) selected = 'keyboard';
    if (selected === 'wheel' && !gp) selected = 'keyboard';
    if (selected === 'touch') selected = 'touch';
    this.lastInput = selected;
    const out = { steer:0, throttle:0, brake:0, handbrake:false, boost:false, shiftUp:false, shiftDown:false, pause:false, type:selected };
    if (selected === 'keyboard') {
      out.steer = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
      out.throttle = this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0;
      out.brake = this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0;
      out.handbrake = this.keys.has(' ');
      out.boost = this.keys.has('shift');
      out.shiftUp = this.keys.has('e'); out.shiftDown = this.keys.has('q');
    } else if (selected === 'touch') {
      out.steer = (this.touch.right ? 1 : 0) - (this.touch.left ? 1 : 0);
      out.throttle = this.touch.throttle ? 1 : 0; out.brake = this.touch.brake ? 1 : 0; out.handbrake = this.touch.handbrake;
    } else if (gp) {
      const axis = (n) => gp.axes[n] ?? 0;
      const btn = (n) => gp.buttons[n]?.value ?? (gp.buttons[n]?.pressed ? 1 : 0);
      if (wheelMode) {
        const sx = Number(this.settings.wheelSteerAxis ?? 0);
        const tx = Number(this.settings.wheelThrottleAxis ?? 2);
        const bx = Number(this.settings.wheelBrakeAxis ?? 3);
        out.steer = axis(sx);
        const normalize = (v, invert) => Math.max(0, Math.min(1, (v + 1) / 2)) * (invert ? -1 : 1) + (invert ? 1 : 0);
        out.throttle = normalize(axis(tx), !!this.settings.invertThrottle);
        out.brake = normalize(axis(bx), !!this.settings.invertBrake);
        out.handbrake = btn(0) > .5; out.boost = btn(1) > .5;
      } else {
        out.steer = axis(0);
        // Standard Gamepad mapping: A=0, B=1, LT=6, RT=7, LB=4, RB=5.
        out.throttle = btn(7);
        out.brake = btn(6);
        out.handbrake = btn(0) > .5;
        out.boost = btn(1) > .5;
        out.shiftDown = btn(4) > .5; out.shiftUp = btn(5) > .5;
      }
    }
    const dead = (Number(this.settings.deadzone ?? 8) / 100);
    if (Math.abs(out.steer) < dead) out.steer = 0;
    else out.steer = Math.sign(out.steer) * ((Math.abs(out.steer) - dead) / (1 - dead));
    out.steer = Math.max(-1, Math.min(1, out.steer)) * (Number(this.settings.steerSensitivity ?? 70) / 70);
    out.steer = Math.max(-1, Math.min(1, out.steer));
    out.pause = this.pressedEdge('pause', this.keys.has('escape'));
    out.shiftUp = this.pressedEdge('shiftUp', out.shiftUp || this.keys.has('e'));
    out.shiftDown = this.pressedEdge('shiftDown', out.shiftDown || this.keys.has('q'));
    // Boost is a hold input: the car consumes boost while held and recharges when released.
    return out;
  }
}
