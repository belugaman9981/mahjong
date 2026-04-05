// ═══════════════════════════════════════════════════════════
// ENGINE.JS — Win detection, claim rules, scoring, game flow
// ═══════════════════════════════════════════════════════════

// ─── WIN DETECTION ───────────────────────────────────────

// Check if a hand (14 tiles) is a winning hand given existing melds
function canWin(hand, melds = []) {
  const setsNeeded = 4 - melds.length;
  // Hand should have setsNeeded*3 + 2 tiles
  if (hand.length !== setsNeeded * 3 + 2) return false;

  const sorted = sortTiles(hand);

  // 7 pairs (only with no melds)
  if (melds.length === 0 && isSevenPairs(sorted)) return true;

  // 13 orphans (only with no melds)
  if (melds.length === 0 && isThirteenOrphans(sorted)) return true;

  // Standard: 4 melds + 1 pair
  return tryFindWinningPattern(sorted, setsNeeded);
}

function isSevenPairs(tiles) {
  const counts = tileCounts(tiles);
  const pairs = Object.values(counts).filter(c => c >= 2);
  const quads = Object.values(counts).filter(c => c >= 4);
  // Need 7 distinct pairs (quads count as 2 pairs)
  return (pairs.length + quads.length) >= 7;
}

function isThirteenOrphans(tiles) {
  const orphanKeys = new Set([
    'man:1','man:9','pin:1','pin:9','sou:1','sou:9',
    'wind:0','wind:1','wind:2','wind:3',
    'dragon:0','dragon:1','dragon:2'
  ]);
  const handKeys = tiles.map(tileKey);
  const unique = new Set(handKeys.filter(k => orphanKeys.has(k)));
  if (unique.size < 13) return false;
  // Need all 13 orphans, one must be duplicated
  const counts = tileCounts(tiles);
  const hasPair = Object.entries(counts).some(([k, v]) => orphanKeys.has(k) && v >= 2);
  return unique.size === 13 && hasPair;
}

function tryFindWinningPattern(tiles, setsNeeded) {
  // Try each distinct tile as the pair
  const tried = new Set();
  for (let i = 0; i < tiles.length - 1; i++) {
    const k = tileKey(tiles[i]);
    if (tried.has(k)) continue;
    if (tileKey(tiles[i + 1]) === k) {
      tried.add(k);
      const rest = [...tiles.slice(0, i), ...tiles.slice(i + 2)];
      if (trySets(rest, setsNeeded)) return true;
    }
  }
  return false;
}

function trySets(tiles, n) {
  if (n === 0) return tiles.length === 0;
  if (tiles.length < 3) return false;

  const first = tiles[0];

  // Try triplet
  if (tileKey(tiles[1]) === tileKey(first) && tileKey(tiles[2]) === tileKey(first)) {
    if (trySets(tiles.slice(3), n - 1)) return true;
  }

  // Try sequence (numbered suits only, value 1-7)
  if (isNumbered(first) && first.value <= 7) {
    const rest = tiles.slice(1);
    const i2 = rest.findIndex(t => t.suit === first.suit && t.value === first.value + 1);
    if (i2 !== -1) {
      const rest2 = rest.filter((_, i) => i !== i2);
      const i3 = rest2.findIndex(t => t.suit === first.suit && t.value === first.value + 2);
      if (i3 !== -1) {
        const rest3 = rest2.filter((_, i) => i !== i3);
        if (trySets(rest3, n - 1)) return true;
      }
    }
  }

  return false;
}

// Check if a tile can be used to complete a hand (tenpai check)
function isTenpai(hand, melds = []) {
  // Try removing each tile and see if the remaining can form a winning hand
  for (let i = 0; i < hand.length; i++) {
    const withoutI = hand.filter((_, j) => j !== i);
    // Any tile could complete the hand — just check structure
    // We need to find if there's a tile that completes it
    // For now, just check if hand-1 needs one more tile somewhere
  }
  return false; // simplified
}

// ─── CLAIM CHECKS ───────────────────────────────────────

function canPon(hand, discardedTile) {
  const matching = hand.filter(t => tileKey(t) === tileKey(discardedTile));
  return matching.length >= 2;
}

// Returns array of possible chi sequences, or false
function canChi(hand, discardedTile, fromDirection) {
  // Chi only from left player (direction === 'left' or fromPlayerIdx === myIdx - 1)
  if (fromDirection !== 'left') return false;
  if (!isNumbered(discardedTile)) return false;

  const { suit, value } = discardedTile;
  const sequences = [];

  // Possible starting values: value-2, value-1, value (to form sequences ending at value, including value, ending +2)
  for (let start = Math.max(1, value - 2); start <= Math.min(7, value); start++) {
    const end = start + 2;
    if (value < start || value > end) continue;
    const neededVals = [start, start + 1, start + 2].filter(v => v !== value);
    const allPresent = neededVals.every(v => hand.some(t => t.suit === suit && t.value === v));
    if (allPresent) {
      sequences.push({ start, tiles: [start, start + 1, start + 2] });
    }
  }
  return sequences.length > 0 ? sequences : false;
}

function canKan(hand, tile) {
  const matching = hand.filter(t => tileKey(t) === tileKey(tile));
  return matching.length >= 3; // 3 in hand + 1 discard, or 4 in hand
}

function canSelfKan(hand) {
  const counts = tileCounts(hand);
  return Object.entries(counts)
    .filter(([_, c]) => c >= 4)
    .map(([k]) => hand.find(t => tileKey(t) === k));
}

// ─── SCORING ─────────────────────────────────────────────

function calculateScore(hand, melds, isTsumo, roundWind, seatWind) {
  const fans = [];

  // Self-draw (Tsumo / Zimo)
  if (isTsumo) fans.push({ name: 'Self-draw (自摸)', fan: 1 });

  // All concealed
  if (melds.length === 0) fans.push({ name: 'Concealed hand', fan: 1 });

  // Check for 7 pairs
  if (isSevenPairs(hand)) {
    fans.push({ name: 'Seven pairs (七對子)', fan: 3 });
    const total = fans.reduce((s, f) => s + f.fan, 0);
    return { fans, total, points: fanToPoints(total) };
  }

  // Check for 13 orphans
  if (isThirteenOrphans(hand)) {
    fans.push({ name: 'Thirteen orphans (十三么)', fan: 8 });
    const total = fans.reduce((s, f) => s + f.fan, 0);
    return { fans, total, points: fanToPoints(total) };
  }

  // Count dragon triplets
  const allSets = [...melds, ...extractSets(hand)];
  for (const meld of allSets) {
    if (meld.type === 'pong' || meld.type === 'kong') {
      if (meld.tile.suit === 'dragon') {
        fans.push({ name: `Dragon triplet (${tileName(meld.tile)})`, fan: 1 });
      }
      if (meld.tile.suit === 'wind' && meld.tile.value === roundWind) {
        fans.push({ name: `Round wind triplet`, fan: 1 });
      }
      if (meld.tile.suit === 'wind' && meld.tile.value === seatWind) {
        fans.push({ name: `Seat wind triplet`, fan: 1 });
      }
    }
  }

  // All triplets
  const allPong = allSets.filter(s => s.type === 'pong' || s.type === 'kong').length;
  if (allPong === 4) fans.push({ name: 'All triplets (對對胡)', fan: 2 });

  // All same suit
  const suits = new Set([...hand.map(t => t.suit), ...melds.flatMap(m => m.tiles.map(t => t.suit))]);
  const numberedSuits = [...suits].filter(s => s === 'man' || s === 'pin' || s === 'sou');
  if (numberedSuits.length === 1 && !suits.has('wind') && !suits.has('dragon')) {
    fans.push({ name: 'Full flush (清一色)', fan: 6 });
  } else if (numberedSuits.length === 1) {
    fans.push({ name: 'Half flush (混一色)', fan: 3 });
  }

  const total = fans.reduce((s, f) => s + f.fan, 0);
  if (fans.length === 0) fans.push({ name: 'Base win', fan: 1 });
  const finalTotal = Math.max(1, fans.reduce((s, f) => s + f.fan, 0));
  return { fans, total: finalTotal, points: fanToPoints(finalTotal) };
}

function fanToPoints(fan) {
  if (fan >= 8) return 32000;
  if (fan >= 6) return 16000;
  if (fan >= 4) return 8000;
  if (fan >= 3) return 4000;
  if (fan >= 2) return 2000;
  return 1000;
}

function extractSets(tiles) {
  // Simple extraction - try to find sets in a complete hand
  const sorted = sortTiles(tiles);
  const sets = [];
  // This is simplified for scoring purposes
  return sets;
}

// ─── GAME STATE ───────────────────────────────────────────

class GameState {
  constructor(numBots = 3) {
    this.numPlayers = 4;
    this.players = [];
    for (let i = 0; i < 4; i++) {
      this.players.push({
        hand: [],
        melds: [],      // { type: 'pong'|'chi'|'kong', tiles: [...], from: playerIdx }
        discards: [],
        score: 25000,
        isBot: i !== 0,
        wind: i,        // 0=East, 1=South(human), 2=West, 3=North... we reorder after
        name: i === 0 ? 'You' : `Bot ${i}`,
      });
    }
    // Player winds: 0=South(human), 1=West, 2=North, 3=East(dealer)
    this.players[0].wind = 1; // South
    this.players[1].wind = 2; // West
    this.players[2].wind = 3; // North
    this.players[3].wind = 0; // East (dealer)

    this.roundWind = 0;       // 0=East round
    this.dealer = 3;          // East player is dealer
    this.currentTurn = 3;     // Dealer goes first
    this.wall = [];
    this.wallIdx = 0;
    this.phase = 'INIT';      // INIT, DRAW, DISCARD, CLAIM, GAME_OVER
    this.lastDiscard = null;
    this.lastDiscardBy = -1;
    this.claimWindow = false;
    this.pendingClaims = [];  // { playerIdx, action }
    this.drawnTile = null;
    this.winner = -1;
    this.isTsumo = false;
    this.winHand = null;
    this.winScore = null;
    this.handNum = 1;
  }

  deal() {
    const deck = shuffleDeck(createDeck());
    this.wall = deck;
    this.wallIdx = 0;

    // Deal 13 tiles to each player starting from dealer
    for (let round = 0; round < 13; round++) {
      for (let i = 0; i < 4; i++) {
        const pi = (this.dealer + i) % 4;
        this.players[pi].hand.push(this.wall[this.wallIdx++]);
      }
    }
    // Dealer gets extra tile (14)
    this.players[this.dealer].hand.push(this.wall[this.wallIdx++]);

    // Sort all hands
    for (const p of this.players) {
      p.hand = sortTiles(p.hand);
    }

    this.phase = 'DISCARD';
    this.currentTurn = this.dealer;
    this.drawnTile = this.players[this.dealer].hand[13];
    // Mark the last tile as "drawn" for display purposes
  }

  drawTile(playerIdx) {
    if (this.wallIdx >= this.wall.length) {
      this.phase = 'GAME_OVER';
      this.winner = -1; // draw
      return null;
    }
    const tile = this.wall[this.wallIdx++];
    this.players[playerIdx].hand.push(tile);
    this.drawnTile = tile;
    this.phase = 'DISCARD';
    this.currentTurn = playerIdx;
    return tile;
  }

  discardTile(playerIdx, tile) {
    const p = this.players[playerIdx];
    const idx = p.hand.findIndex(t => t.id === tile.id);
    if (idx === -1) return false;
    p.hand.splice(idx, 1);
    p.discards.push(tile);
    this.lastDiscard = tile;
    this.lastDiscardBy = playerIdx;
    this.drawnTile = null;
    this.phase = 'CLAIM';
    this.claimWindow = true;
    this.pendingClaims = [];
    return true;
  }

  claimPon(claimingPlayerIdx) {
    const p = this.players[claimingPlayerIdx];
    const tile = this.lastDiscard;
    const matching = p.hand.filter(t => tileKey(t) === tileKey(tile));
    if (matching.length < 2) return false;

    // Remove 2 matching tiles from hand
    let removed = 0;
    p.hand = p.hand.filter(t => {
      if (removed < 2 && tileKey(t) === tileKey(tile)) { removed++; return false; }
      return true;
    });

    // Add the discard to form meld
    const meldTiles = [...matching.slice(0, 2), tile];
    p.melds.push({ type: 'pong', tiles: meldTiles, tile: tile, from: this.lastDiscardBy });

    // Remove from last discarder's discards
    const discardIdx = this.players[this.lastDiscardBy].discards.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) this.players[this.lastDiscardBy].discards.splice(discardIdx, 1);

    this.currentTurn = claimingPlayerIdx;
    this.phase = 'DISCARD';
    this.claimWindow = false;
    this.lastDiscard = null;
    return true;
  }

  claimChi(claimingPlayerIdx, seqStart) {
    const p = this.players[claimingPlayerIdx];
    const tile = this.lastDiscard;
    const { suit } = tile;
    const neededVals = [seqStart, seqStart + 1, seqStart + 2].filter(v => v !== tile.value);

    const usedTiles = [tile];
    for (const v of neededVals) {
      const idx = p.hand.findIndex(t => t.suit === suit && t.value === v);
      if (idx === -1) return false;
      usedTiles.push(p.hand[idx]);
      p.hand.splice(idx, 1);
    }

    p.melds.push({ type: 'chi', tiles: sortTiles(usedTiles), tile: tile, from: this.lastDiscardBy });

    const discardIdx = this.players[this.lastDiscardBy].discards.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) this.players[this.lastDiscardBy].discards.splice(discardIdx, 1);

    this.currentTurn = claimingPlayerIdx;
    this.phase = 'DISCARD';
    this.claimWindow = false;
    this.lastDiscard = null;
    return true;
  }

  claimKan(claimingPlayerIdx) {
    const p = this.players[claimingPlayerIdx];
    const tile = this.lastDiscard;
    const matching = p.hand.filter(t => tileKey(t) === tileKey(tile));
    if (matching.length < 3) return false;

    let removed = 0;
    p.hand = p.hand.filter(t => {
      if (removed < 3 && tileKey(t) === tileKey(tile)) { removed++; return false; }
      return true;
    });

    const meldTiles = [...matching.slice(0, 3), tile];
    p.melds.push({ type: 'kong', tiles: meldTiles, tile: tile, from: this.lastDiscardBy });

    const discardIdx = this.players[this.lastDiscardBy].discards.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) this.players[this.lastDiscardBy].discards.splice(discardIdx, 1);

    // Draw replacement tile (from back of wall = also from wallIdx here for simplicity)
    this.currentTurn = claimingPlayerIdx;
    this.drawTile(claimingPlayerIdx);
    return true;
  }

  selfKan(playerIdx, tile) {
    const p = this.players[playerIdx];
    const matching = p.hand.filter(t => tileKey(t) === tileKey(tile));
    if (matching.length < 4) return false;

    p.hand = p.hand.filter(t => tileKey(t) !== tileKey(tile));
    p.melds.push({ type: 'kong', tiles: matching, tile: tile, from: -1 });

    // Draw replacement
    this.drawTile(playerIdx);
    return true;
  }

  declareWin(playerIdx, isTsumo) {
    const p = this.players[playerIdx];
    this.winner = playerIdx;
    this.isTsumo = isTsumo;
    this.winHand = [...p.hand];
    this.phase = 'GAME_OVER';
    this.claimWindow = false;

    // Calculate score
    const hand = isTsumo ? [...p.hand] : [...p.hand, this.lastDiscard];
    this.winScore = calculateScore(hand, p.melds, isTsumo, this.roundWind, p.wind);

    // Apply score changes
    const points = this.winScore.points;
    if (isTsumo) {
      for (let i = 0; i < 4; i++) {
        if (i !== playerIdx) this.players[i].score -= Math.floor(points / 3);
      }
      this.players[playerIdx].score += points;
    } else {
      this.players[this.lastDiscardBy].score -= points;
      this.players[playerIdx].score += points;
    }
  }

  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % 4;
    this.phase = 'DRAW';
  }

  tilesLeft() {
    return this.wall.length - this.wallIdx;
  }

  isMyTurn(myIdx = 0) {
    return this.currentTurn === myIdx;
  }
}
