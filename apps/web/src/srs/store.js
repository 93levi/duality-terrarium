// The "dummy DynamoDB" for SRS card state. Every function here is written to mirror the shape the
// REAL DynamoDB calls will have once real accounts exist (root CLAUDE.md phasing, "AWS backend —
// not before there's a real persistence need... SRS progress") — same (userId, kanji) addressing,
// same "get one card / batch-get several by key list / write one card" operations — so swapping
// this module's internals for an actual AWS SDK client later is a same-shaped drop-in for every
// caller, not a rewrite of anything that calls it.
//
// Internally: one localStorage key per user (`srs:${userId}`), holding a flat
// { [kanjiCharacter]: CardState } object — NOT one key per card. A real DynamoDB table would be one
// ITEM per card (partition key userId, sort key kanji) rather than one blob per user, but
// localStorage has no query API to batch-read a partition the way DynamoDB does, so the practical
// local equivalent of "give me every card this user has for these characters" is just reading the
// one blob and picking out what's asked for. Callers never see this distinction — they only ever
// call getCard/putCard/getCardsForDeck below, which is the whole point of the interface.

function storageKey(userId) {
  return `srs:${userId}`
}

function readUserBlob(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : {}
  } catch (err) {
    // A real DynamoDB call can fail too (network, throttling) — every caller already has to handle
    // "no state for this card" gracefully (see sm2.js's newCardState), so a corrupt/unavailable
    // blob just degrades to "nothing saved yet" instead of throwing and breaking the session.
    console.error(`Failed to read SRS state for "${userId}":`, err)
    return {}
  }
}

function writeUserBlob(userId, blob) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(blob))
  } catch (err) {
    console.error(`Failed to save SRS state for "${userId}":`, err)
  }
}

export function getCard(userId, kanji) {
  return readUserBlob(userId)[kanji] ?? null
}

export function putCard(userId, kanji, state) {
  const blob = readUserBlob(userId)
  blob[kanji] = state
  writeUserBlob(userId, blob)
}

// Batch-read equivalent of DynamoDB's BatchGetItem — one read of the user's whole blob instead of
// one localStorage call per character, then picked apart in memory. Returns a Map so "no state yet"
// (a genuinely new card) and "state exists" are both explicit values, not a default hiding inside a
// plain object's missing keys.
export function getCardsForDeck(userId, kanjiList) {
  const blob = readUserBlob(userId)
  return new Map(kanjiList.map((k) => [k, blob[k] ?? null]))
}
