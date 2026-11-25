# SLIDE CULT — Browser Drift Playground

A multi-file, browser-based 3D drift game built with Three.js. It runs directly on a static host such as GitHub Pages; there is no backend, build step, or API key.

## Run it

Because the game uses JavaScript modules, open it through a local web server rather than opening `index.html` directly as a file.

### Option A — VS Code
1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and choose **Open with Live Server**.

### Option B — Python
From this folder, run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

The Three.js library is loaded from jsDelivr, so the first load requires an internet connection.

## Publish with GitHub Pages

1. Create a public GitHub repository, for example `slide-cult`.
2. Upload the contents of this folder (keep the `assets` folders in place).
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select `main` and `/ (root)`, then save.
6. Open the Pages URL GitHub gives you.

## Controls

### Keyboard
- **W / Up** — throttle
- **S / Down** — brake / reverse
- **A / Left** and **D / Right** — steer
- **Space** — handbrake
- **Shift** — boost
- **Q / E** — downshift / upshift (manual transmission)
- **Esc** — pause

### Controller / gamepad
- Left stick — steering
- RT / R2 — throttle
- LT / L2 — brake
- A / Cross — handbrake
- B / Circle — boost
- Shoulder buttons — shift in manual mode

### Steering wheel
Choose **Steering wheel** in Settings. The browser must expose the wheel through the Gamepad API. If the default mapping does not match your wheel, select the steering, throttle, and brake axes in Settings, and toggle the pedal inversion options as needed. Wheel and pedal layouts differ by model and browser; this is configurable rather than assuming every device uses identical axes.

### Touchscreen
Choose **Touchscreen** in Settings, or use Auto detect on a touch device. On-screen steering, throttle, brake, and handbrake controls appear while driving.

## Settings

Input mode, wheel axis mappings, steering sensitivity, deadzone, handling preset, transmission, camera, graphics, driving assists, and sound can be changed at any time. Vehicle choice, paint, money, and upgrades save in the current browser using local storage.

## Notes

- This is a playable prototype with procedural 3D cars and track scenery; it does not use licensed real-world car assets.
- Driving physics are custom arcade/simcade-style browser physics, not a full motorsport simulation.
- Gamepad and wheel support depends on the browser's Gamepad API implementation and the device driver.
