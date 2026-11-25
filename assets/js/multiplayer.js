/**
 * SLIDE CULT browser-side multiplayer transport.
 * The Cloudflare Worker URL is entered in the multiplayer dialog and saved locally.
 */
export class MultiplayerClient {
  constructor({ onMessage = () => {}, onStatus = () => {} } = {}) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.roomCode = '';
    this.lastStateSent = 0;
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect({ serverUrl, roomCode, name, carId, color }) {
    this.disconnect(false);
    const base = String(serverUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('Enter your Cloudflare Worker URL first.');
    let parsed;
    try { parsed = new URL(base); } catch { throw new Error('That server URL is not valid.'); }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use an https:// server URL.');
    if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new Error('A public multiplayer server must use HTTPS.');
    }

    const code = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (code.length < 4) throw new Error('Room codes need at least 4 letters or numbers.');
    const playerName = String(name || 'DRIFTER').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 18) || 'DRIFTER';
    const wsBase = base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const url = `${wsBase}/room/${encodeURIComponent(code)}?name=${encodeURIComponent(playerName)}&car=${encodeURIComponent(carId || 's15')}&color=${encodeURIComponent(color || '#c8d3e0')}`;

    this.roomCode = code;
    this.onStatus('Connecting…');
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);
      this.socket = socket;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          reject(new Error('Connection timed out. Check your Worker URL and deployment.'));
        }
      }, 12000);

      socket.addEventListener('open', () => {
        if (!settled) { settled = true; clearTimeout(timeout); resolve(); }
        this.onStatus(`Connected to room ${code}`);
      });
      socket.addEventListener('message', event => {
        try { this.onMessage(JSON.parse(event.data)); }
        catch (error) { console.warn('Ignored invalid multiplayer message', error); }
      });
      socket.addEventListener('error', () => {
        this.onStatus('Connection error');
        if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Could not connect. Check the Worker URL and room code.')); }
      });
      socket.addEventListener('close', event => {
        clearTimeout(timeout);
        this.onStatus(event.reason || 'Disconnected');
        if (!settled) { settled = true; reject(new Error('The server closed the connection before joining.')); }
        if (this.socket === socket) {
          this.socket = null;
          this.roomCode = '';
          this.onMessage({ type: 'disconnected' });
        }
      });
    });
  }

  sendState(state) {
    if (!this.connected) return;
    const now = performance.now();
    // 5 updates/second is a deliberate low-bandwidth setting for the free tier.
    if (now - this.lastStateSent < 200) return;
    this.lastStateSent = now;
    try { this.socket.send(JSON.stringify({ type: 'state', state })); }
    catch (error) { console.warn('Could not send multiplayer state', error); }
  }

  disconnect(notify = true) {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      if (notify) this.onStatus('Leaving room…');
      this.socket.close(1000, 'Player left');
    }
    this.socket = null;
    this.roomCode = '';
  }
}
