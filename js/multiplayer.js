// ═══════════════════════════════════════════════════════════
// MULTIPLAYER.JS — BroadcastChannel IRL multiplayer
// Works across multiple windows of the same Chrome extension
// ═══════════════════════════════════════════════════════════

const Multiplayer = {
  channel: null,
  roomCode: null,
  isHost: false,
  myPlayerIdx: -1,
  playersReady: [],
  gameState: null,
  pingInterval: null,

  // Generate a 4-character room code
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  },

  // HOST: Create a new room
  createRoom() {
    this.roomCode = this.generateCode();
    this.isHost = true;
    this.myPlayerIdx = 0; // Host is player 0 (South)
    this.playersReady = [{ idx: 0, name: 'You (Host)' }];

    this.channel = new BroadcastChannel(`mahjong-room-${this.roomCode}`);
    this.channel.onmessage = (e) => this._handleMessage(e.data);

    // Keep alive ping
    this.pingInterval = setInterval(() => {
      this._broadcast({ type: 'PING', roomCode: this.roomCode });
    }, 2000);

    this._updateLobbyUI();
    return this.roomCode;
  },

  // CLIENT: Join an existing room
  joinRoom(code) {
    this.roomCode = code.toUpperCase();
    this.isHost = false;

    this.channel = new BroadcastChannel(`mahjong-room-${this.roomCode}`);
    this.channel.onmessage = (e) => this._handleMessage(e.data);

    // Request to join
    this._broadcast({ type: 'JOIN_REQUEST', name: 'Player' });

    setTimeout(() => {
      const status = document.getElementById('mp-join-status');
      if (this.myPlayerIdx === -1 && status) {
        status.textContent = '❌ Room not found or full. Check the code!';
        status.style.color = '#ff8888';
      }
    }, 3000);
  },

  // Send a game action
  sendAction(action) {
    this._broadcast({ type: 'ACTION', playerIdx: this.myPlayerIdx, action });
  },

  // Start the game (host only)
  startGame() {
    if (!this.isHost || this.playersReady.length < 4) return false;
    const gs = new GameState();
    gs.deal();
    this.gameState = gs;
    this._broadcast({
      type: 'GAME_START',
      gameState: this._serializeState(gs)
    });
    App.startMultiplayerGame(gs, this.myPlayerIdx);
    return true;
  },

  _broadcast(msg) {
    if (this.channel) this.channel.postMessage(msg);
  },

  _handleMessage(data) {
    switch (data.type) {
      case 'PING':
        if (!this.isHost && this.myPlayerIdx === -1) {
          // Room exists, we can update status
          const status = document.getElementById('mp-join-status');
          if (status && status.textContent.includes('Waiting')) {
            // Already pending
          }
        }
        break;

      case 'JOIN_REQUEST':
        if (this.isHost && this.playersReady.length < 4) {
          const idx = this.playersReady.length;
          this.playersReady.push({ idx, name: `Player ${idx + 1}` });
          this._broadcast({
            type: 'JOIN_ACCEPTED',
            playerIdx: idx,
            players: this.playersReady
          });
          this._updateLobbyUI();
        }
        break;

      case 'JOIN_ACCEPTED':
        if (!this.isHost && this.myPlayerIdx === -1) {
          this.myPlayerIdx = data.playerIdx;
          this.playersReady = data.players;
          const status = document.getElementById('mp-join-status');
          if (status) {
            status.textContent = `✅ Joined as Player ${this.myPlayerIdx + 1}! Waiting for host to start...`;
            status.style.color = '#88ff88';
          }
          this._updateLobbyUI();
        } else if (!this.isHost) {
          // Update player list
          this.playersReady = data.players;
          this._updateLobbyUI();
        }
        break;

      case 'GAME_START':
        const gs = this._deserializeState(data.gameState);
        App.startMultiplayerGame(gs, this.myPlayerIdx);
        break;

      case 'ACTION':
        if (this.isHost) {
          this._processAction(data.playerIdx, data.action);
        }
        break;

      case 'STATE_UPDATE':
        if (!this.isHost) {
          const updatedGs = this._deserializeState(data.gameState);
          App.onMultiplayerStateUpdate(updatedGs, data.message);
        }
        break;
    }
  },

  _processAction(playerIdx, action) {
    // Host processes all actions and broadcasts new state
    const gs = this.gameState;
    let msg = '';

    switch (action.type) {
      case 'DRAW':
        gs.drawTile(playerIdx);
        msg = `${gs.players[playerIdx].name} drew a tile`;
        break;
      case 'DISCARD':
        const tile = gs.players[playerIdx].hand.find(t => t.id === action.tileId);
        if (tile) { gs.discardTile(playerIdx, tile); msg = `${gs.players[playerIdx].name} discarded ${tileName(tile)}`; }
        break;
      case 'PON':
        gs.claimPon(playerIdx);
        msg = `${gs.players[playerIdx].name} called Pon!`;
        break;
      case 'CHI':
        gs.claimChi(playerIdx, action.seqStart);
        msg = `${gs.players[playerIdx].name} called Chi!`;
        break;
      case 'KAN':
        gs.claimKan(playerIdx);
        msg = `${gs.players[playerIdx].name} called Kan!`;
        break;
      case 'WIN':
        gs.declareWin(playerIdx, action.isTsumo);
        msg = `🀄 ${gs.players[playerIdx].name} wins!`;
        break;
      case 'PASS':
        // Check if all players passed
        gs.pendingClaims.push({ playerIdx, action: 'pass' });
        if (gs.pendingClaims.filter(c => c.action === 'pass').length >= 3) {
          gs.nextTurn();
          msg = 'Next turn';
        }
        break;
    }

    this._broadcast({ type: 'STATE_UPDATE', gameState: this._serializeState(gs), message: msg });
    App.onMultiplayerStateUpdate(gs, msg);
  },

  _serializeState(gs) {
    return JSON.parse(JSON.stringify(gs));
  },

  _deserializeState(data) {
    const gs = new GameState();
    Object.assign(gs, data);
    return gs;
  },

  _updateLobbyUI() {
    const list = document.getElementById('mp-players-list');
    if (!list) return;

    const slots = ['South (You)', 'West', 'North', 'East'];
    list.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const player = this.playersReady[i];
      const row = document.createElement('div');
      row.className = 'mp-player-row';
      row.innerHTML = `
        <div class="mp-player-dot ${player ? 'ready' : ''}"></div>
        <span>${player ? player.name : 'Waiting...'}</span>
        <span style="margin-left:auto;font-size:10px;color:${player ? '#88ff88' : 'rgba(200,180,120,0.4)'}">
          ${player ? '✓ ' + slots[i] : slots[i]}
        </span>
      `;
      list.appendChild(row);
    }

    const startBtn = document.getElementById('mp-start-btn');
    if (startBtn) {
      if (this.playersReady.length >= 4) {
        startBtn.style.display = 'block';
        startBtn.textContent = '🀄 Start Game — All Players Ready!';
      } else {
        startBtn.style.display = 'none';
      }
    }

    const codeEl = document.getElementById('mp-room-code');
    if (codeEl && this.roomCode) codeEl.textContent = this.roomCode;
  },

  disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.channel) { this.channel.close(); this.channel = null; }
    this.roomCode = null;
    this.isHost = false;
    this.myPlayerIdx = -1;
    this.playersReady = [];
  }
};
