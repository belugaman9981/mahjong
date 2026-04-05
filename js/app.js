// ═══════════════════════════════════════════════════════════
// APP.JS — Main application controller
// ═══════════════════════════════════════════════════════════

const App = {
  gs: null,           // Current GameState
  myIdx: 0,           // My player index
  selectedTile: null, // Currently selected tile in hand
  isMultiplayer: false,
  botTimers: [],      // Active bot setTimeout IDs
  claimTimeout: null, // Claim window timeout
  chiOptions: null,   // Pending chi options

  // ─── SCREEN MANAGEMENT ───────────────────────────────────

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },

  showMenu() {
    this._clearTimers();
    Multiplayer.disconnect();
    this.isMultiplayer = false;
    this.showScreen('screen-menu');
  },

  showRules() { this.showScreen('screen-rules'); },

  showMultiplayer() { this.showScreen('screen-multiplayer'); },

  // ─── BOT GAME ─────────────────────────────────────────────

  startBotGame() {
    this._clearTimers();
    this.isMultiplayer = false;
    this.myIdx = 0;
    this.selectedTile = null;
    this.chiOptions = null;

    this.gs = new GameState();
    this.gs.deal();

    this.showScreen('screen-game');
    UI.hideOverlay();
    this._fullRender();

    // If dealer is a bot, start their turn
    if (this.gs.currentTurn !== this.myIdx) {
      this._scheduleBot(this.gs.currentTurn);
    } else {
      this._setMyDiscardPhase();
    }
  },

  _fullRender() {
    const gs = this.gs;
    UI.updateBoard(gs, this.selectedTile);
    this._renderMyHand();
    UI.highlightTurn(gs.currentTurn);
  },

  _renderMyHand() {
    const gs = this.gs;
    const p = gs.players[this.myIdx];
    const canDiscard = gs.phase === 'DISCARD' && gs.currentTurn === this.myIdx;

    UI.renderMyHand(
      p.hand, p.melds, gs.drawnTile,
      (tile, el) => this._onMyTileClick(tile, el),
      canDiscard
    );
  },

  _onMyTileClick(tile, el) {
    const gs = this.gs;
    if (gs.phase !== 'DISCARD' || gs.currentTurn !== this.myIdx) return;

    // In discard phase with 14 tiles: clicking discards
    if (gs.players[this.myIdx].hand.length >= 14) {
      this._doMyDiscard(tile);
    } else {
      // Select / deselect
      if (this.selectedTile && this.selectedTile.id === tile.id) {
        this.selectedTile = null;
      } else {
        this.selectedTile = tile;
      }
      this._renderMyHand();
      const selEl = document.querySelector(`[data-tile-id="${tile.id}"]`);
      if (selEl && this.selectedTile) selEl.classList.add('selected');
    }
  },

  _doMyDiscard(tile) {
    const gs = this.gs;
    if (!gs.discardTile(this.myIdx, tile)) return;
    this.selectedTile = null;
    this._fullRender();
    UI.setMessage('Waiting for claims...');
    UI.disableAllButtons();

    // Enter claim window — check if bots want to claim
    this._runClaimPhase();
  },

  _setMyDiscardPhase() {
    const gs = this.gs;
    const p = gs.players[this.myIdx];

    const canWinNow = canWin(p.hand, p.melds);
    const selfKans = canSelfKan(p.hand);

    UI.setButtonStates({
      draw: false,
      win: canWinNow,
      pon: false, chi: false,
      kan: selfKans.length > 0,
      pass: false
    });

    // Check if can self-kan
    if (selfKans.length > 0) {
      UI.setMessage('Your turn — self-Kan available!', '#f0c040');
    } else if (canWinNow) {
      UI.setMessage('🀄 TSUMO! Click Win to declare!', '#ff9999');
    } else {
      UI.setMessage('Your turn — click a tile to discard', '#88ffaa');
    }
    this._renderMyHand();
  },

  _setMyDrawPhase() {
    UI.setButtonStates({ draw: true, win: false, pon: false, chi: false, kan: false, pass: false });
    UI.setMessage('Your turn — Draw a tile!', '#88ffaa');
  },

  _setMyClaimPhase(canPonFlag, chiOptsFlag, canKanFlag, canWinFlag) {
    UI.setButtonStates({
      draw: false,
      win: canWinFlag,
      pon: canPonFlag,
      chi: !!chiOptsFlag,
      kan: canKanFlag,
      pass: true
    });

    const msgs = [];
    if (canWinFlag) msgs.push('胡 Win!');
    if (canPonFlag) msgs.push('碰 Pon');
    if (chiOptsFlag) msgs.push('吃 Chi');
    if (canKanFlag) msgs.push('槓 Kan');
    UI.setMessage(msgs.length ? `You can: ${msgs.join(', ')}` : 'Pass or claim', '#f0c040');
  },

  // ─── PLAYER ACTIONS ──────────────────────────────────────

  playerDraw() {
    const gs = this.gs;
    if (gs.phase !== 'DRAW' || gs.currentTurn !== this.myIdx) return;

    const tile = gs.drawTile(this.myIdx);
    if (!tile) {
      UI.showDrawScreen();
      return;
    }

    this._fullRender();
    this._setMyDiscardPhase();
  },

  playerWin() {
    const gs = this.gs;
    const p = gs.players[this.myIdx];

    if (gs.phase === 'DISCARD' && gs.currentTurn === this.myIdx) {
      // Tsumo (self-draw win)
      if (!canWin(p.hand, p.melds)) return;
      gs.declareWin(this.myIdx, true);
    } else if (gs.phase === 'CLAIM') {
      // Ron (win on discard)
      const tempHand = [...p.hand, gs.lastDiscard];
      if (!canWin(tempHand, p.melds)) return;
      p.hand.push(gs.lastDiscard);
      gs.declareWin(this.myIdx, false);
    } else return;

    this._fullRender();
    UI.disableAllButtons();
    setTimeout(() => UI.showWinScreen(gs, this.myIdx), 500);
  },

  playerPon() {
    const gs = this.gs;
    if (gs.phase !== 'CLAIM') return;
    if (!canPon(gs.players[this.myIdx].hand, gs.lastDiscard)) return;

    gs.claimPon(this.myIdx);
    this._fullRender();
    this._setMyDiscardPhase();
    UI.setMessage('碰 Pon! Now discard a tile', '#f0c040');
  },

  playerChi() {
    const gs = this.gs;
    if (gs.phase !== 'CLAIM') return;
    const fromLeft = (gs.lastDiscardBy === (this.myIdx + 3) % 4); // player to my left
    const opts = canChi(gs.players[this.myIdx].hand, gs.lastDiscard, fromLeft ? 'left' : 'other');
    if (!opts) return;

    if (opts.length === 1) {
      // Auto-select only option
      this.onChiSelected(opts[0].start);
    } else {
      this.chiOptions = opts;
      UI.showChiSelection(opts, gs.lastDiscard, (start) => this.onChiSelected(start));
    }
  },

  onChiSelected(seqStart) {
    UI.hideOverlay();
    const gs = this.gs;
    gs.claimChi(this.myIdx, seqStart);
    this._fullRender();
    this._setMyDiscardPhase();
    UI.setMessage('吃 Chi! Now discard a tile', '#f0c040');
  },

  playerKan() {
    const gs = this.gs;
    const p = gs.players[this.myIdx];

    if (gs.phase === 'CLAIM') {
      if (!canKan(p.hand, gs.lastDiscard)) return;
      gs.claimKan(this.myIdx);
      this._fullRender();
      this._setMyDiscardPhase();
      UI.setMessage('槓 Kan! Draw replacement tile', '#f0c040');
    } else if (gs.phase === 'DISCARD' && gs.currentTurn === this.myIdx) {
      const kans = canSelfKan(p.hand);
      if (kans.length === 0) return;
      gs.selfKan(this.myIdx, kans[0]);
      this._fullRender();
      this._setMyDiscardPhase();
      UI.setMessage('暗槓 Self-Kan!', '#f0c040');
    }
  },

  playerPass() {
    UI.hideOverlay();
    const gs = this.gs;
    gs.claimWindow = false;
    UI.disableAllButtons();
    gs.nextTurn();
    this._fullRender();
    this._continueGame();
  },

  sortMyHand() {
    if (!this.gs) return;
    const p = this.gs.players[this.myIdx];
    p.hand = sortTiles(p.hand);
    this._renderMyHand();
  },

  // ─── GAME FLOW ───────────────────────────────────────────

  _continueGame() {
    const gs = this.gs;
    if (gs.phase === 'GAME_OVER') {
      if (gs.winner === -1) UI.showDrawScreen();
      else UI.showWinScreen(gs, gs.winner);
      return;
    }

    if (gs.currentTurn === this.myIdx) {
      if (gs.phase === 'DRAW') {
        this._setMyDrawPhase();
      } else if (gs.phase === 'DISCARD') {
        this._setMyDiscardPhase();
      }
    } else {
      UI.disableAllButtons();
      this._scheduleBot(gs.currentTurn);
    }
  },

  _runClaimPhase() {
    const gs = this.gs;
    if (gs.phase !== 'CLAIM') return;

    // Determine if MY position can claim (check left-player for chi)
    const myP = gs.players[this.myIdx];
    const fromDirection = (gs.lastDiscardBy === (this.myIdx + 3) % 4) ? 'left' : 'other';

    const tempHand = [...myP.hand, gs.lastDiscard];
    const myCanWin = canWin(tempHand, myP.melds);
    const myCanPon = canPon(myP.hand, gs.lastDiscard);
    const myCanChi = canChi(myP.hand, gs.lastDiscard, fromDirection);
    const myCanKan = canKan(myP.hand, gs.lastDiscard);

    // Bot claims (priority: win > kan > pon > chi > pass)
    // Check each bot, pick highest priority claim
    let botClaim = null;
    for (let pi = 1; pi <= 3; pi++) {
      const bIdx = pi; // bots are players 1,2,3
      if (bIdx === gs.lastDiscardBy) continue;
      const bp = gs.players[bIdx];
      const dir = (gs.lastDiscardBy === (bIdx + 3) % 4) ? 'left' : 'other';
      const claim = botDecideClaim(bp.hand, bp.melds, gs.lastDiscard, dir, bp.wind, gs.roundWind);

      if (claim.action === 'win') {
        botClaim = { playerIdx: bIdx, ...claim };
        break; // Win beats everything
      }
      if (claim.action === 'kan' && (!botClaim || botClaim.action === 'pass')) {
        botClaim = { playerIdx: bIdx, ...claim };
      }
      if (claim.action === 'pon' && (!botClaim || botClaim.action === 'pass')) {
        botClaim = { playerIdx: bIdx, ...claim };
      }
      if (claim.action === 'chi' && (!botClaim || botClaim.action === 'pass')) {
        botClaim = { playerIdx: bIdx, ...claim };
      }
    }

    const hasMyClaim = myCanWin || myCanPon || myCanChi || myCanKan;

    // Give player time to claim if they can
    if (hasMyClaim) {
      this._setMyClaimPhase(myCanPon, myCanChi, myCanKan, myCanWin);
      // After 5 seconds, auto-pass if player hasn't acted
      this.claimTimeout = setTimeout(() => {
        if (gs.phase === 'CLAIM') {
          this._applyBotClaim(botClaim);
        }
      }, 5000);
    } else if (botClaim && botClaim.action !== 'pass') {
      // Bot claims after delay
      this.botTimers.push(setTimeout(() => this._applyBotClaim(botClaim), BOT_CLAIM_THINK_TIME));
    } else {
      // No claims, next turn
      setTimeout(() => {
        gs.nextTurn();
        this._fullRender();
        this._continueGame();
      }, 400);
    }
  },

  _applyBotClaim(claim) {
    if (!claim || claim.action === 'pass') {
      const gs = this.gs;
      gs.nextTurn();
      this._fullRender();
      UI.disableAllButtons();
      this._continueGame();
      return;
    }

    const gs = this.gs;
    const { playerIdx, action, seq } = claim;
    const p = gs.players[playerIdx];
    let msg = '';

    if (action === 'win') {
      p.hand.push(gs.lastDiscard);
      gs.declareWin(playerIdx, false);
      this._fullRender();
      UI.disableAllButtons();
      UI.setMessage(`${p.name} wins! 胡!`, '#ff9999');
      setTimeout(() => UI.showWinScreen(gs, playerIdx), 800);
      return;
    }

    if (action === 'kan') {
      gs.claimKan(playerIdx);
      msg = `${p.name}: 槓 Kan!`;
    } else if (action === 'pon') {
      gs.claimPon(playerIdx);
      msg = `${p.name}: 碰 Pon!`;
    } else if (action === 'chi') {
      const chiOpts = canChi(p.hand, gs.lastDiscard, 'left');
      if (chiOpts) gs.claimChi(playerIdx, chiOpts[0].start);
      msg = `${p.name}: 吃 Chi!`;
    }

    UI.disableAllButtons();
    UI.setMessage(msg, '#f0c040');
    this._fullRender();

    // Bot needs to discard
    this._scheduleBot(playerIdx);
  },

  _scheduleBot(botIdx) {
    const gs = this.gs;
    UI.highlightTurn(botIdx);
    UI.setMessage(`${gs.players[botIdx].name} is thinking...`);

    const timer = setTimeout(() => {
      this._runBotTurn(botIdx);
    }, BOT_THINK_TIME);
    this.botTimers.push(timer);
  },

  _runBotTurn(botIdx) {
    const gs = this.gs;
    if (gs.phase === 'GAME_OVER') return;

    const p = gs.players[botIdx];

    if (gs.phase === 'DRAW' && gs.currentTurn === botIdx) {
      // Bot draws
      const tile = gs.drawTile(botIdx);
      if (!tile) {
        this._fullRender();
        UI.showDrawScreen();
        return;
      }
      this._fullRender();
      UI.setMessage(`${p.name} drew a tile`);
      // Fall through to discard phase
    }

    if (gs.phase === 'DISCARD' && gs.currentTurn === botIdx) {
      // Check self-win
      if (botCanSelfWin(p.hand, p.melds)) {
        gs.declareWin(botIdx, true);
        this._fullRender();
        UI.setMessage(`${p.name}: 自摸! Self-draw win!`, '#ff9999');
        setTimeout(() => UI.showWinScreen(gs, botIdx), 800);
        return;
      }

      // Check self-kan
      const kans = canSelfKan(p.hand);
      if (kans.length > 0 && Math.random() > 0.6) {
        gs.selfKan(botIdx, kans[0]);
        this._fullRender();
        UI.setMessage(`${p.name}: 暗槓 Self-Kan!`);
        // Bot draws replacement, then discards
        setTimeout(() => this._runBotTurn(botIdx), BOT_THINK_TIME);
        return;
      }

      // Bot discards
      const discard = botChooseDiscard(p.hand);
      gs.discardTile(botIdx, discard);
      this._fullRender();
      UI.setMessage(`${p.name} discarded ${tileName(discard)}`);

      // Run claim phase
      setTimeout(() => this._runClaimPhase(), 300);
    }
  },

  _clearTimers() {
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers = [];
    if (this.claimTimeout) { clearTimeout(this.claimTimeout); this.claimTimeout = null; }
  },

  // ─── MULTIPLAYER BRIDGE ───────────────────────────────────

  startMultiplayerGame(gs, myIdx) {
    this._clearTimers();
    this.isMultiplayer = true;
    this.gs = gs;
    this.myIdx = myIdx;
    this.showScreen('screen-game');
    UI.hideOverlay();
    this._fullRender();
    this._updateMultiplayerTurn();
  },

  onMultiplayerStateUpdate(gs, msg) {
    this.gs = gs;
    this._fullRender();
    if (msg) UI.setMessage(msg);
    this._updateMultiplayerTurn();
    if (gs.phase === 'GAME_OVER') {
      if (gs.winner === -1) UI.showDrawScreen();
      else setTimeout(() => UI.showWinScreen(gs, gs.winner), 500);
    }
  },

  _updateMultiplayerTurn() {
    const gs = this.gs;
    if (gs.currentTurn !== this.myIdx) {
      UI.disableAllButtons();
      UI.setMessage(`${gs.players[gs.currentTurn].name}'s turn...`);
      return;
    }

    if (gs.phase === 'DRAW') this._setMyDrawPhase();
    else if (gs.phase === 'DISCARD') this._setMyDiscardPhase();
    else if (gs.phase === 'CLAIM') {
      const myP = gs.players[this.myIdx];
      const fromDirection = (gs.lastDiscardBy === (this.myIdx + 3) % 4) ? 'left' : 'other';
      const tempHand = [...myP.hand, gs.lastDiscard];
      this._setMyClaimPhase(
        canPon(myP.hand, gs.lastDiscard),
        canChi(myP.hand, gs.lastDiscard, fromDirection),
        canKan(myP.hand, gs.lastDiscard),
        canWin(tempHand, myP.melds)
      );
    }
  },

  // ─── MULTIPLAYER UI ACTIONS ──────────────────────────────

  mpShowHost(btn) {
    document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mp-host-panel').style.display = 'flex';
    document.getElementById('mp-join-panel').style.display = 'none';
  },

  mpShowJoin(btn) {
    document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mp-host-panel').style.display = 'none';
    document.getElementById('mp-join-panel').style.display = 'flex';
  },

  mpCreateRoom() {
    Multiplayer.disconnect();
    const code = Multiplayer.createRoom();
    document.getElementById('mp-room-code').textContent = code;
  },

  mpCopyCode() {
    const code = document.getElementById('mp-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const btn = event.target;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
  },

  mpJoinRoom() {
    const input = document.getElementById('mp-join-input');
    const code = input.value.trim().toUpperCase();
    if (code.length !== 4) {
      document.getElementById('mp-join-status').textContent = '❌ Enter a 4-character code';
      return;
    }
    document.getElementById('mp-join-status').textContent = '⏳ Connecting...';
    Multiplayer.joinRoom(code);
  },

  mpStartGame() {
    if (!Multiplayer.startGame()) {
      alert('Need 4 players to start!');
    }
  }
};

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  App.showScreen('screen-menu');
});
