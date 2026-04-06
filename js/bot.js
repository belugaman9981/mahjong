
// ═══════════════════════════════════════════════════════════
// BOT.JS — AI decision making for computer opponents
// ═══════════════════════════════════════════════════════════

// How long bots "think" (ms)
const BOT_THINK_TIME = 900;
const BOT_CLAIM_THINK_TIME = 600;

// Score each tile's usefulness in the hand (higher = keep it)
function tilePotential(tile, hand) {
  const rest = hand.filter(t => t.id !== tile.id);
  let score = 0;

  if (isHonor(tile)) {
    // Honor tiles only useful in triplets
    const matching = rest.filter(t => tileKey(t) === tileKey(tile)).length;
    score += matching * 12;
    return score;
  }

  const { suit, value } = tile;
  // Triplet bonus
  const matching = rest.filter(t => tileKey(t) === tileKey(tile)).length;
  score += matching * 10;

  // Sequence neighbors
  const has = v => rest.some(t => t.suit === suit && t.value === v);
  if (has(value - 1)) score += 6;
  if (has(value + 1)) score += 6;
  if (has(value - 1) && has(value + 1)) score += 8; // complete seq!
  if (has(value - 2)) score += 3;
  if (has(value + 2)) score += 3;
  if (has(value - 2) && has(value - 1)) score += 4; // two-sided
  if (has(value + 1) && has(value + 2)) score += 4; // two-sided

  // Middle tiles more flexible
  if (value >= 3 && value <= 7) score += 2;

  return score;
}

// Pick the worst tile to discard
function botChooseDiscard(hand) {
  let worst = null;
  let worstScore = Infinity;

  for (const tile of hand) {
    const s = tilePotential(tile, hand);
    if (s < worstScore) {
      worstScore = s;
      worst = tile;
    }
  }
  return worst || hand[hand.length - 1];
}

// How far is the hand from winning? (lower = closer)
function handShanten(hand, melds) {
  // Count complete sets and pairs in hand
  const setsNeeded = 4 - melds.length;
  let best = setsNeeded * 3 + 1; // worst case shanten

  // Simple estimate: count partial melds
  const sorted = sortTiles(hand);
  const used = new Array(sorted.length).fill(false);
  let completeSets = 0;
  let pairs = 0;
  let partials = 0;

  // Try to find complete sets
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue;
      for (let k = j + 1; k < sorted.length; k++) {
        if (used[k]) continue;
        if (isSet(sorted[i], sorted[j], sorted[k])) {
          completeSets++;
          used[i] = used[j] = used[k] = true;
          break;
        }
      }
    }
  }

  return Math.max(0, setsNeeded - completeSets - 1);
}

function isSet(a, b, c) {
  // Triplet
  if (tileKey(a) === tileKey(b) && tileKey(b) === tileKey(c)) return true;
  // Sequence
  if (a.suit === b.suit && b.suit === c.suit && isNumbered(a)) {
    const vals = [a.value, b.value, c.value].sort((x, y) => x - y);
    return vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;
  }
  return false;
}

// Decide whether to claim a discard
function botDecideClaim(hand, melds, discardedTile, fromDirection, myWind, roundWind) {
  // Priority: Win > Kan > Pon (valuable) > Chi

  // Can we win?
  const tempHand = [...hand, discardedTile];
  if (canWin(tempHand, melds)) {
    return { action: 'win' };
  }

  // Can we Kan?
  if (canKan(hand, discardedTile)) {
    return { action: 'kan' };
  }

  // Can we Pon?
  if (canPon(hand, discardedTile)) {
    // Always pon dragons and winds
    if (discardedTile.suit === 'dragon') return { action: 'pon' };
    if (discardedTile.suit === 'wind' &&
        (discardedTile.value === myWind || discardedTile.value === roundWind)) {
      return { action: 'pon' };
    }
    // Pon numbered tiles if it helps
    const shBefore = handShanten(hand, melds);
    const afterPon = hand.filter(t => {
      // simulate removing 2 and adding meld
      return true; // simplified
    });
    if (shBefore <= 2 && Math.random() > 0.4) {
      return { action: 'pon' };
    }
  }

  // Can we Chi?
  const chiOpts = canChi(hand, discardedTile, fromDirection);
  if (chiOpts) {
    const shBefore = handShanten(hand, melds);
    if (shBefore <= 1 && Math.random() > 0.5) {
      return { action: 'chi', seq: chiOpts[0] };
    }
  }

  return { action: 'pass' };
}

// Can the bot self-draw win?
function botCanSelfWin(hand, melds) {
  return canWin(hand, melds);
}
