# SLIDE CULT — Browser Drift Playground

A multi-file, browser-based 3D drift game built with Three.js. The single-player build runs on a static host such as GitHub Pages. Optional real-time multiplayer uses a small Cloudflare Worker + Durable Object WebSocket backend; it does not run on your computer.

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


## Multiplayer (Cloudflare Free plan)

Multiplayer is optional. The game website remains on GitHub Pages, while room connections are handled by Cloudflare's hosted Durable Objects. Your computer is only needed to deploy the server once; it does not need to stay running after deployment.

### Deploy the room server

1. Create or sign in to a Cloudflare account.
2. Install a current Node.js LTS release on your computer.
3. Open a terminal in `multiplayer-worker`.
4. Run:

   ```bash
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

5. Wrangler prints a URL similar to `https://slide-cult-multiplayer.YOUR-SUBDOMAIN.workers.dev`. Copy it.
6. Open the published SLIDE CULT website, choose **Multiplayer**, paste the Worker URL into **Cloudflare Worker URL**, and save/create a room.
7. Give your friends the same room code. They use the same website and Worker URL, then enter that code to join.

The Worker uses the SQLite-backed Durable Object binding declared in `wrangler.toml`, which is the Durable Object storage option available on Cloudflare Workers Free. The project does not require a database, API key, VPS, always-on home server, or a paid plan.

### Free-tier limits and realistic expectations

- Rooms are capped at 8 players.
- The browser sends position updates at 5 times per second, with interpolation between updates to make remote cars move smoothly.
- Cloudflare's current Free plan includes 100,000 Durable Object requests per day and 13,000 GB-seconds of compute duration per day. The separate Workers Free plan also has a 100,000-request daily quota.
- On the Free plan, operations that exceed a quota fail until the daily quota resets; the app does not automatically switch itself to a paid plan.
- Keep the Cloudflare account on the **Workers Free** plan. Do not upgrade to Workers Paid if you need to keep the setup at $0.
- No provider can promise a free service forever. Cloudflare can change its plans or limits, so this setup is **free on the current Free plan, not a lifetime guarantee**.
- Room membership and car positions are temporary. There is no account system, chat, persistent room list, or server-authoritative anti-cheat in this prototype.

Cloudflare's current limits and pricing are documented here:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/

### Update the multiplayer server

When changing the Worker code, deploy it again from `multiplayer-worker`:

```bash
npx wrangler deploy
```

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
