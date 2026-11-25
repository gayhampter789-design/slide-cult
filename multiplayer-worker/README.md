# SLIDE CULT multiplayer Worker

Cloud-hosted WebSocket room service using Cloudflare Durable Objects. No local server process needs to remain running.

## Windows quick deploy

Double-click `deploy.bat`. It installs Wrangler, opens Cloudflare login, and deploys the Worker.

## Manual deploy

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Use the resulting `workers.dev` URL in the game's Multiplayer dialog. The Worker exposes `/health` and `/room/ROOMCODE`.

The Durable Object uses the SQLite binding configured in `wrangler.toml` (the Durable Object backend available on Cloudflare Workers Free). This prototype stores live player state in WebSocket attachments and does not write a database.
