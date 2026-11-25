import { DurableObject } from 'cloudflare:workers';

const ROOM_PATTERN = /^[A-Z0-9]{4,8}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'SLIDE CULT multiplayer', transport: 'WebSocket' });
    }

    const match = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})$/i);
    if (!match) return new Response('SLIDE CULT multiplayer server. Use /room/ROOMCODE', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required.', { status: 426 });
    }

    const roomCode = match[1].toUpperCase();
    if (!ROOM_PATTERN.test(roomCode)) return new Response('Invalid room code.', { status: 400 });
    const id = env.ROOMS.idFromName(roomCode);
    return env.ROOMS.get(id).fetch(request);
  }
};

export class GameRoom extends DurableObject {

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required.', { status: 426 });
    }

    const openSockets = this.ctx.getWebSockets();
    const MAX_PLAYERS = 8;
    if (openSockets.length >= MAX_PLAYERS) {
      return new Response('This room is full (8 players maximum).', { status: 409 });
    }

    const url = new URL(request.url);
    const name = (url.searchParams.get('name') || 'DRIFTER')
      .replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 18) || 'DRIFTER';
    const carIdRaw = url.searchParams.get('car') || 's15';
    const carId = ['s15', 'ae86', 'r34', 'commodore'].includes(carIdRaw) ? carIdRaw : 's15';
    const colorRaw = url.searchParams.get('color') || '#c8d3e0';
    const color = /^#[0-9a-f]{6}$/i.test(colorRaw) ? colorRaw : '#c8d3e0';
    const occupiedSlots = new Set(openSockets.map(ws => ws.deserializeAttachment()?.slot).filter(Number.isInteger));
    let slot = 0;
    while (occupiedSlots.has(slot) && slot < MAX_PLAYERS) slot++;
    const player = { id: crypto.randomUUID(), name, carId, color, slot, state: null, lastMessage: 0 };
    const existingPlayers = openSockets
      .map(ws => ws.deserializeAttachment())
      .filter(Boolean)
      .map(({ id, name, carId, color, slot, state }) => ({ id, name, carId, color, slot, state }));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(player);

    server.send(JSON.stringify({ type: 'welcome', self: this.publicPlayer(player), players: existingPlayers }));
    this.broadcast({ type: 'player-joined', player: this.publicPlayer(player) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4096) return;
    let payload;
    try { payload = JSON.parse(message); } catch { return; }
    if (payload?.type !== 'state' || !payload.state || typeof payload.state !== 'object') return;

    const player = ws.deserializeAttachment();
    if (!player) return;
    const now = Date.now();
    // Reject overly frequent updates; the client normally sends every 200 ms.
    if (now - (player.lastMessage || 0) < 120) return;
    const raw = payload.state;
    const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const state = {
      x: Math.max(-4000, Math.min(4000, finite(raw.x))),
      z: Math.max(-4000, Math.min(4000, finite(raw.z))),
      yaw: finite(raw.yaw),
      steer: Math.max(-1, Math.min(1, finite(raw.steer))),
      speed: Math.max(0, Math.min(400, finite(raw.speed)))
    };
    if (['s15', 'ae86', 'r34', 'commodore'].includes(raw.carId)) player.carId = raw.carId;
    if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) player.color = raw.color;
    player.state = state;
    player.lastMessage = now;
    ws.serializeAttachment(player);
    this.broadcast({ type: 'player-state', player: this.publicPlayer(player) }, ws);
  }

  webSocketClose(ws, code, reason) {
    const player = ws.deserializeAttachment();
    if (player?.id) this.broadcast({ type: 'player-left', id: player.id, name: player.name }, ws);
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) {
      try { ws.close(code, reason); } catch { /* The runtime may already have closed it. */ }
    }
  }

  webSocketError(ws) {
    const player = ws.deserializeAttachment();
    if (player?.id) this.broadcast({ type: 'player-left', id: player.id, name: player.name }, ws);
    try { ws.close(1011, 'Connection error'); } catch { /* Already closed. */ }
  }

  publicPlayer(player) {
    return { id: player.id, name: player.name, carId: player.carId, color: player.color, slot: player.slot, state: player.state };
  }

  broadcast(payload, except = null) {
    const message = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(message); }
      catch { try { socket.close(1011, 'Broadcast failed'); } catch { /* Ignore stale sockets. */ } }
    }
  }
}
