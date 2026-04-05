// ═══════════════════════════════════════════════════════════
// TILES.JS — Tile definitions, deck creation, utilities
// ═══════════════════════════════════════════════════════════

const SUITS = { MAN: 'man', PIN: 'pin', SOU: 'sou', WIND: 'wind', DRAGON: 'dragon' };

// Unicode mahjong tile characters
const TILE_CHARS = {
  man:    ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],  // 1-9 Man (Characters)
  pin:    ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],  // 1-9 Pin (Circles)
  sou:    ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],  // 1-9 Sou (Bamboo)
  wind:   ['🀀','🀁','🀂','🀃'],                           // E S W N
  dragon: ['🀄','🀅','🀆']                                 // 中 發 白
};

const WIND_NAMES   = ['East','South','West','North'];
const WIND_CHARS   = ['東','南','西','北'];
const DRAGON_NAMES = ['Red (中)','Green (發)','White (白)'];
const DRAGON_CHARS = ['中','發','白'];

function tileKey(t) { return `${t.suit}:${t.value}`; }

function tileChar(t) {
  if (!t) return '';
  switch (t.suit) {
    case 'man':    return TILE_CHARS.man[t.value - 1];
    case 'pin':    return TILE_CHARS.pin[t.value - 1];
    case 'sou':    return TILE_CHARS.sou[t.value - 1];
    case 'wind':   return TILE_CHARS.wind[t.value];
    case 'dragon': return TILE_CHARS.dragon[t.value];
  }
  return '?';
}

function tileName(t) {
  if (!t) return '';
  switch (t.suit) {
    case 'man':    return `${t.value} Man`;
    case 'pin':    return `${t.value} Pin`;
    case 'sou':    return `${t.value} Sou`;
    case 'wind':   return WIND_NAMES[t.value];
    case 'dragon': return DRAGON_NAMES[t.value];
  }
  return '?';
}

function isHonor(t) { return t.suit === 'wind' || t.suit === 'dragon'; }
function isTerminal(t) { return !isHonor(t) && (t.value === 1 || t.value === 9); }
function isOrphan(t) { return isHonor(t) || isTerminal(t); }
function isNumbered(t) { return t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou'; }

// Create and shuffle a 136-tile deck
function createDeck() {
  const tiles = [];
  let id = 0;
  for (const suit of ['man', 'pin', 'sou']) {
    for (let v = 1; v <= 9; v++)
      for (let c = 0; c < 4; c++)
        tiles.push({ suit, value: v, id: id++ });
  }
  for (let v = 0; v < 4; v++)
    for (let c = 0; c < 4; c++)
      tiles.push({ suit: 'wind', value: v, id: id++ });
  for (let v = 0; v < 3; v++)
    for (let c = 0; c < 4; c++)
      tiles.push({ suit: 'dragon', value: v, id: id++ });
  return tiles;
}

function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SUIT_ORDER = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4 };
function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return sd !== 0 ? sd : a.value - b.value;
  });
}

// Count tiles by key
function tileCounts(tiles) {
  const c = {};
  for (const t of tiles) { const k = tileKey(t); c[k] = (c[k] || 0) + 1; }
  return c;
}
