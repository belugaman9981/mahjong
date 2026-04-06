
// ═══════════════════════════════════════════════════════════
// UI.JS — Rendering tiles, hands, discards, board
// ═══════════════════════════════════════════════════════════

const UI = {
  // ─── TILE CREATION ───────────────────────────────────────

  createTileEl(tile, opts = {}) {
    const el = document.createElement('div');
    const { size = 'md', faceDown = false, selected = false,
            clickable = false, onClick = null, claimable = false } = opts;

    el.className = `tile tile-${size}`;
    if (faceDown) {
      el.classList.add('face-down');
      if (opts.vert) el.classList.add('tile-vert');
    } else {
      el.textContent = tileChar(tile);
      el.title = tileName(tile);
    }

    if (selected) el.classList.add('selected');
    if (claimable) el.classList.add('claimable');
    if (opts.vert) el.classList.add('tile-vert');

    if (onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => onClick(tile, el));
    }

    if (tile) el.dataset.tileId = tile.id;
    return el;
  },

  // ─── HAND RENDERING ──────────────────────────────────────

  renderMyHand(hand, melds, drawnTile, onTileClick, canDiscard) {
    const container = document.getElementById('hand-0');
    container.innerHTML = '';

    const drawnId = drawnTile ? drawnTile.id : null;

    for (let i = 0; i < hand.length; i++) {
      const tile = hand[i];
      const isDrawn = tile.id === drawnId;

      // Separator before drawn tile
      if (isDrawn && i > 0) {
        const sep = document.createElement('div');
        sep.className = 'drawn-tile-sep';
        container.appendChild(sep);
      }

      const el = this.createTileEl(tile, {
        size: 'lg',
        clickable: canDiscard,
        onClick: canDiscard ? onTileClick : null,
      });

      if (canDiscard) el.classList.add('claimable'); // highlight as selectable

      container.appendChild(el);
    }
  },

  renderOpponentHand(playerIdx, count, melds) {
    const container = document.getElementById(`hand-${playerIdx}`);
    if (!container) return;
    container.innerHTML = '';

    const isTopOrBottom = playerIdx === 2;
    const isLeft = playerIdx === 1;
    const isRight = playerIdx === 3;
    const size = 'sm';

    for (let i = 0; i < count; i++) {
      const el = this.createTileEl(null, {
        size,
        faceDown: true,
        vert: isLeft || isRight,
      });
      container.appendChild(el);
    }
  },

  renderMelds(playerIdx, melds, isMe) {
    const container = document.getElementById(`melds-${playerIdx}`);
    if (!container) return;
    container.innerHTML = '';

    for (const meld of melds) {
      const group = document.createElement('div');
      group.className = 'meld-group';

      const label = document.createElement('span');
      label.className = 'meld-label';
      label.textContent = meld.type === 'pong' ? '碰' : meld.type === 'chi' ? '吃' : '槓';
      group.appendChild(label);

      const tileSize = isMe ? 'sm' : 'xs';
      for (const t of meld.tiles) {
        const el = this.createTileEl(t, { size: tileSize });
        group.appendChild(el);
      }
      container.appendChild(group);
    }
  },

  renderDiscards(playerIdx, discards) {
    const container = document.getElementById(`discards-${playerIdx}`);
    if (!container) return;
    container.innerHTML = '';

    // Show last 18 discards to avoid overflow
    const show = discards.slice(-18);
    for (const tile of show) {
      const el = this.createTileEl(tile, { size: 'xs' });
      container.appendChild(el);
    }
  },

  // ─── BOARD UPDATE ─────────────────────────────────────────

  updateBoard(gs, selectedTile) {
    // Scores
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`score-${i}`);
      if (el) el.textContent = gs.players[i].score.toLocaleString();
    }

    // Tiles remaining
    document.getElementById('tiles-remaining-label').textContent = `🀫 ${gs.tilesLeft()}`;

    // Round wind
    const windNames = ['East','South','West','North'];
    const windChars = ['東','南','西','北'];
    document.getElementById('round-wind-label').textContent = `${TILE_CHARS.wind[gs.roundWind]} ${windNames[gs.roundWind]} Round`;
    document.getElementById('wind-center-char').textContent = windChars[gs.roundWind];
    document.getElementById('dealer-label').textContent = `Dealer: ${windNames[gs.players[gs.dealer].wind]}`;

    // Last discard
    const ldTile = document.getElementById('last-discard-tile');
    const ldBy = document.getElementById('last-discard-by');
    if (gs.lastDiscard) {
      ldTile.textContent = tileChar(gs.lastDiscard);
      ldBy.textContent = gs.players[gs.lastDiscardBy].name;
    } else {
      ldTile.textContent = '';
      ldBy.textContent = '';
    }

    // Opponent 2 (North, top)
    const p2 = gs.players[2];
    this.renderOpponentHand(2, p2.hand.length, p2.melds);
    this.renderMelds(2, p2.melds, false);
    this.renderDiscards(2, p2.discards);

    // Opponent 1 (West, left)
    const p1 = gs.players[1];
    this.renderOpponentHand(1, p1.hand.length, p1.melds);
    this.renderMelds(1, p1.melds, false);
    this.renderDiscards(1, p1.discards);

    // Opponent 3 (East, right)
    const p3 = gs.players[3];
    this.renderOpponentHand(3, p3.hand.length, p3.melds);
    this.renderMelds(3, p3.melds, false);
    this.renderDiscards(3, p3.discards);

    // My hand (player 0)
    const p0 = gs.players[0];
    this.renderMelds(0, p0.melds, true);
    this.renderDiscards(0, p0.discards);
  },

  // ─── MESSAGES ─────────────────────────────────────────────

  setMessage(msg, color = null) {
    const el = document.getElementById('game-message');
    el.textContent = msg;
    if (color) el.style.color = color;
    else el.style.color = '';
  },

  // ─── OVERLAY ──────────────────────────────────────────────

  showOverlay(html) {
    document.getElementById('overlay-content').innerHTML = html;
    document.getElementById('game-overlay').classList.remove('hidden');
  },

  hideOverlay() {
    document.getElementById('game-overlay').classList.add('hidden');
  },

  showWinScreen(gs, winnerIdx) {
    const p = gs.players[winnerIdx];
    const score = gs.winScore;
    const isMe = winnerIdx === 0;
    const isTsumo = gs.isTsumo;

    let hand = gs.winHand;
    let tilesHtml = sortTiles(hand).map(t =>
      `<div class="tile tile-sm">${tileChar(t)}</div>`
    ).join('');
    for (const m of p.melds) {
      tilesHtml += `<div class="meld-group">${m.tiles.map(t => `<div class="tile tile-xs">${tileChar(t)}</div>`).join('')}</div>`;
    }

    const fanRows = (score?.fans || [{ name: 'Base win', fan: 1 }]).map(f =>
      `<div class="score-row"><span>${f.name}</span><span>${f.fan} Fan</span></div>`
    ).join('');

    const html = `
      <div class="overlay-title">
        ${isMe ? '🎉 YOU WIN! 🎉' : `${p.name} Wins!`}
        <span class="win-celebration">${isTsumo ? '自摸!' : '胡!'}</span>
      </div>
      <div style="font-size:11px;color:rgba(200,180,120,0.7);margin-bottom:10px;">
        ${isTsumo ? 'Self-draw (Tsumo)' : `Won on ${gs.players[gs.lastDiscardBy].name}'s discard`}
      </div>
      <div class="overlay-tiles">${tilesHtml}</div>
      <div class="score-breakdown">
        ${fanRows}
        <div class="score-row total">
          <span>Total: ${score?.total || 1} Fan</span>
          <span>+${(score?.points || 1000).toLocaleString()} pts</span>
        </div>
      </div>
      <div class="overlay-btns">
        <button class="overlay-btn primary" onclick="App.startBotGame()">New Game</button>
        <button class="overlay-btn" onclick="App.showMenu()">Menu</button>
      </div>
    `;
    this.showOverlay(html);
  },

  showDrawScreen() {
    const html = `
      <div class="overlay-title">🀫 Draw!</div>
      <div class="overlay-sub">The wall is empty. No one wins this hand.</div>
      <div class="overlay-btns">
        <button class="overlay-btn primary" onclick="App.startBotGame()">New Game</button>
        <button class="overlay-btn" onclick="App.showMenu()">Menu</button>
      </div>
    `;
    this.showOverlay(html);
  },

  showChiSelection(options, discardTile, onSelect) {
    const optsHtml = options.map((opt, i) => {
      const tiles = opt.tiles.map(v => {
        const fakeTile = { suit: discardTile.suit, value: v };
        const isDiscard = v === discardTile.value;
        return `<div class="tile tile-sm${isDiscard ? ' selected' : ''}">${tileChar(fakeTile)}</div>`;
      }).join('');
      return `<div class="chi-option" onclick="App.onChiSelected(${opt.start})">${tiles}</div>`;
    }).join('');

    const html = `
      <div class="overlay-title" style="font-size:18px">Choose Chi Sequence</div>
      <div class="overlay-sub">Select which sequence to complete:</div>
      <div class="chi-options">${optsHtml}</div>
      <div class="overlay-btns">
        <button class="overlay-btn" onclick="App.playerPass()">Pass</button>
      </div>
    `;
    this.showOverlay(html);
  },

  // ─── BUTTONS ──────────────────────────────────────────────

  setButtonStates({ draw, win, pon, chi, kan, pass }) {
    const b = id => document.getElementById(id);
    b('btn-draw').disabled = !draw;
    b('btn-win').disabled = !win;
    b('btn-pon').disabled = !pon;
    b('btn-chi').disabled = !chi;
    b('btn-kan').disabled = !kan;
    b('btn-pass').disabled = !pass;
  },

  disableAllButtons() {
    this.setButtonStates({ draw:false, win:false, pon:false, chi:false, kan:false, pass:false });
  },

  // Highlight which player's turn it is
  highlightTurn(playerIdx) {
    for (let i = 0; i < 4; i++) {
      const scoreEl = document.getElementById(`score-${i}`);
      if (scoreEl) {
        scoreEl.style.color = i === playerIdx ? '#ffee55' : '';
        scoreEl.style.fontWeight = i === playerIdx ? '900' : '';
      }
    }
  }
};
