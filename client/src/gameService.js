import {
  ref,
  get,
  set,
  remove,
  onValue,
  onDisconnect,
  runTransaction
} from 'firebase/database';
import { db, getMyPlayerId } from './firebase';
import masterWordsJson from './data/words_master.json';

const PROMOTION_THRESHOLD = 5;

// 6가지 색상 및 고정 문양 정의
export const COLOR_SETS = [
  { color: 'yellow', name: '노랑', symbol: '★' },
  { color: 'green',  name: '초록', symbol: '♣' },
  { color: 'purple', name: '보라', symbol: '⚡' },
  { color: 'pink',   name: '분홍', symbol: '♥' },
  { color: 'blue',   name: '파랑', symbol: '◆' },
  { color: 'orange', name: '주황', symbol: '🔥' }
];

// 메모리 사전 캐시 (기본 words_master.json + Firebase에서 실시간 승격된 단어들)
const masterSets = new Map();

export function normalizeWord(word) {
  if (!word || typeof word !== 'string') return '';
  return word.replace(/\s+/g, '').toLowerCase().trim();
}

function initMasterDictionary() {
  masterSets.clear();
  for (const [category, words] of Object.entries(masterWordsJson)) {
    masterSets.set(category, new Set(words.map(normalizeWord)));
  }

  // Firebase에 승격(promoted)된 단어들을 실시간 구독하여 재배포 없이 즉시 사전에 반영
  const promotedRef = ref(db, 'dictionary/promoted');
  onValue(promotedRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    for (const [category, wordsObj] of Object.entries(data)) {
      if (!masterSets.has(category)) {
        masterSets.set(category, new Set());
      }
      const setObj = masterSets.get(category);
      for (const normWord of Object.keys(wordsObj)) {
        setObj.add(normWord);
      }
    }
  });
}

initMasterDictionary();

export function getCategories() {
  return Object.keys(masterWordsJson);
}

export function getRandomMasterWord(category) {
  const words = masterWordsJson[category];
  if (!Array.isArray(words) || words.length === 0) return null;
  const idx = Math.floor(Math.random() * words.length);
  return words[idx];
}

export function isWordInMaster(category, rawWord) {
  const norm = normalizeWord(rawWord);
  if (!norm) return false;
  const setObj = masterSets.get(category);
  if (!setObj) return false;
  return setObj.has(norm);
}

/**
 * 유저 투표 통과 단어를 Firebase DB에 누적 기록하고,
 * 누적 5회 달성 시 promoted: true 플래그를 남기며 정식 사전(dictionary/promoted)에 자동 승격
 */
export async function recordApprovedVoteInFirebase(category, rawWord, roomCode) {
  const cleanWord = (rawWord || '').trim();
  const norm = normalizeWord(cleanWord);
  if (!norm || isWordInMaster(category, cleanWord)) return;

  const pendingWordRef = ref(db, `dictionary/pending/${category}/${norm}`);

  try {
    let shouldPromote = false;
    await runTransaction(pendingWordRef, (current) => {
      const entry = current || {
        originalWord: cleanWord,
        votes: 0,
        promoted: false,
        promotedAt: null,
        lastVotedAt: null,
        history: []
      };

      entry.votes = (entry.votes || 0) + 1;
      entry.lastVotedAt = new Date().toISOString();
      if (!Array.isArray(entry.history)) entry.history = [];
      entry.history.push({
        date: entry.lastVotedAt,
        roomId: roomCode
      });

      if (entry.votes >= PROMOTION_THRESHOLD && !entry.promoted) {
        entry.promoted = true;
        entry.promotedAt = new Date().toISOString();
        shouldPromote = true;
      }

      return entry;
    });

    if (shouldPromote) {
      const promotedWordRef = ref(db, `dictionary/promoted/${category}/${norm}`);
      await set(promotedWordRef, {
        originalWord: cleanWord,
        promotedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('Failed to record vote in Firebase:', err);
  }
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 플레이어 인원수 + 2개(최대 6개)의 색상을 선택하여
 * 67개 주제어 카드와 8장의 2색 연결 와일드카드를 동적 생성
 */
export function createDynamicDeck(playerCount = 4, wildCardCount = 8) {
  const categories = shuffleArray(getCategories());
  const colorCount = Math.min(COLOR_SETS.length, Math.max(3, Number(playerCount) + 2));
  const activeColors = shuffleArray(COLOR_SETS).slice(0, colorCount);

  const normalCards = shuffleArray(
    categories.map((category, idx) => {
      const colorObj = activeColors[idx % activeColors.length];
      return {
        id: `card_${idx}_${Date.now()}`,
        type: 'normal',
        category,
        color: colorObj.color,
        symbol: colorObj.symbol
      };
    })
  );

  const allWildPairs = [];
  for (let i = 0; i < activeColors.length; i++) {
    for (let j = i + 1; j < activeColors.length; j++) {
      allWildPairs.push([activeColors[i], activeColors[j]]);
    }
  }
  const shuffledPairs = shuffleArray(allWildPairs);
  const wildCards = Array.from({ length: wildCardCount }, (_, idx) => {
    const pair = shuffledPairs[idx % shuffledPairs.length];
    return {
      id: `wild_${idx}_${Date.now()}`,
      type: 'wild',
      colors: [pair[0].color, pair[1].color],
      symbols: [pair[0].symbol, pair[1].symbol]
    };
  });

  const firstCards = normalCards.slice(0, 4);
  const restDeck = shuffleArray([...normalCards.slice(4), ...wildCards]);
  return [...firstCards, ...restDeck];
}

export function areCardsMatching(cardA, cardB, activeWildCard) {
  if (!cardA || !cardB) return false;
  if (cardA.color === cardB.color) return true;

  if (activeWildCard && Array.isArray(activeWildCard.colors) && activeWildCard.colors.length === 2) {
    const [w1, w2] = activeWildCard.colors;
    if (
      (cardA.color === w1 && cardB.color === w2) ||
      (cardA.color === w2 && cardB.color === w1)
    ) {
      return true;
    }
  }
  return false;
}

export function scanTableForDuels(players, activeWildCard) {
  const safePlayers = (players || []).filter((p) => !p.isLeft);
  const matchingPairs = [];
  const participantSet = new Set();
  const opponentMap = {};

  for (let i = 0; i < safePlayers.length; i++) {
    for (let j = i + 1; j < safePlayers.length; j++) {
      const pA = safePlayers[i];
      const pB = safePlayers[j];
      const pileA = pA.pile || [];
      const pileB = pB.pile || [];
      const topA = pileA.length > 0 ? pileA[pileA.length - 1] : null;
      const topB = pileB.length > 0 ? pileB[pileB.length - 1] : null;

      if (areCardsMatching(topA, topB, activeWildCard)) {
        matchingPairs.push([pA.id, pB.id]);
        participantSet.add(pA.id);
        participantSet.add(pB.id);

        if (!opponentMap[pA.id]) opponentMap[pA.id] = [];
        if (!opponentMap[pB.id]) opponentMap[pB.id] = [];

        opponentMap[pA.id].push({
          playerId: pB.id,
          nickname: pB.nickname,
          category: topB.category,
          cardId: topB.id
        });
        opponentMap[pB.id].push({
          playerId: pA.id,
          nickname: pA.nickname,
          category: topA.category,
          cardId: topA.id
        });
      }
    }
  }

  if (participantSet.size === 0) return null;

  return {
    participants: Array.from(participantSet),
    pairs: matchingPairs,
    opponentMap
  };
}

/**
 * 다음 활성(!isLeft) 플레이어의 인덱스를 찾습니다.
 */
function getNextActiveTurnIndex(players, currentIndex) {
  const total = players.length;
  if (total === 0) return 0;
  for (let offset = 1; offset <= total; offset++) {
    const idx = (currentIndex + offset) % total;
    if (!players[idx]?.isLeft) {
      return idx;
    }
  }
  return 0;
}

/**
 * Firebase에서 읽어온 방 데이터를 UI 컴포넌트가 기대하는 직렬화 형태로 정규화
 */
export function formatRoomSnapshot(rawRoom) {
  if (!rawRoom) return null;
  const deck = rawRoom.deck || [];
  const players = (rawRoom.players || []).map((p) => {
    const pile = p.pile || [];
    return {
      id: p.id,
      nickname: p.nickname,
      isHost: !!p.isHost,
      isBot: !!p.isBot,
      difficulty: p.isBot ? p.difficulty || 'normal' : null,
      isLeft: !!p.isLeft,
      isReady: !!(p.isHost || p.isBot || p.isReady),
      score: p.score || 0,
      pile,
      pileCount: pile.length,
      topCard: pile.length > 0 ? pile[pile.length - 1] : null,
      cooldownUntil: p.cooldownUntil || 0
    };
  });

  const turnIndex = rawRoom.turnIndex || 0;
  const vs = rawRoom.voteState || null;
  let formattedVote = null;

  if (vs) {
    const votes = vs.votes || {};
    const votedCount = Object.keys(votes).length;
    const secondsLeft = vs.expiresAt
      ? Math.max(0, Math.ceil((vs.expiresAt - Date.now()) / 1000))
      : 5;

    formattedVote = {
      ...vs,
      votes,
      votedCount,
      remainingCount: Math.max(0, (vs.totalVoters || 0) - votedCount),
      votedPlayerIds: Object.keys(votes),
      secondsLeft
    };
  }

  const rawOptions = rawRoom.options || {};
  return {
    code: rawRoom.code,
    status: rawRoom.status || 'waiting',
    options: {
      penaltySeconds:
        rawOptions.penaltySeconds !== undefined ? Number(rawOptions.penaltySeconds) : 1,
      botDifficulty: rawOptions.botDifficulty || 'normal'
    },
    deckCount: deck.length,
    activeWildCard: rawRoom.activeWildCard || null,
    turnIndex,
    currentTurnPlayerId: players[turnIndex]?.id || null,
    needsExtraDraw: !!rawRoom.needsExtraDraw,
    players,
    presence: rawRoom.presence || {},
    duelState: rawRoom.duelState || null,
    voteState: formattedVote,
    badgeState: rawRoom.badgeState || null
  };
}

/**
 * 숫자로만 된 6자리 방 코드 생성 (예: 482910)
 */
function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

/**
 * 탭/창 닫기 시 Firebase 서버가 즉시 감지하도록 onDisconnect 등록
 */
export async function registerPresenceInFirebase(roomCode) {
  const myId = getMyPlayerId();
  if (!roomCode || !myId) return;
  const myPresenceRef = ref(db, `rooms/${roomCode}/presence/${myId}`);
  try {
    await onDisconnect(myPresenceRef).remove();
    await set(myPresenceRef, true);
  } catch (err) {
    console.error('Presence registration error:', err);
  }
}

/**
 * 방에 남아있는 인간 플레이어가 나 1명뿐일 때 탭을 닫으면
 * Firebase 서버가 방 전체(rooms/{roomCode})를 즉시 삭제하도록 onDisconnect 연동
 */
export async function syncLastHumanDisconnectHook(roomCode, isOnlyHuman) {
  if (!roomCode) return;
  const roomRef = ref(db, `rooms/${roomCode}`);
  try {
    if (isOnlyHuman) {
      await onDisconnect(roomRef).remove();
    } else {
      await onDisconnect(roomRef).cancel();
    }
  } catch (err) {
    console.error('Room onDisconnect sync error:', err);
  }
}

/**
 * 접속자(presence)가 0명이거나 방치된 유령 방들을 DB에서 자동으로 스캔하여 삭제 (Garbage Collection)
 */
export async function cleanupStaleRoomsInFirebase() {
  try {
    const roomsRef = ref(db, 'rooms');
    const snap = await get(roomsRef);
    if (!snap.exists()) return;

    const allRooms = snap.val() || {};
    const now = Date.now();
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    for (const [code, room] of Object.entries(allRooms)) {
      if (!room) continue;
      const createdAt = room.createdAt || 0;
      const ageMs = now - createdAt;
      const presenceCount = Object.keys(room.presence || {}).length;
      const players = room.players || [];
      const activeHumans = players.filter((p) => !p.isBot && !p.isLeft);

      // 1) 생성 후 10초가 지났는데 현재 접속 중인 사람(presence)이 0명인 방
      // 2) 활성 인간 플레이어가 0명인 방
      // 3) 생성된 지 6시간이 넘은 방
      if (
        (ageMs > 10000 && presenceCount === 0) ||
        activeHumans.length === 0 ||
        ageMs > SIX_HOURS
      ) {
        await remove(ref(db, `rooms/${code}`));
      }
    }
  } catch (err) {
    console.error('Stale room cleanup error:', err);
  }
}

/**
 * 방 나가기 / 강퇴 / 탭 닫기(이탈) 통합 처리
 * - 대기실(waiting)에서는 목록에서 즉시 제거
 * - 게임 중(playing)에는 점수를 0으로 초기화하고 isLeft: true로 마킹하여
 *   마지막 리더보드에서 맨 꼴찌 + 취소선으로 표시되게 처리
 */
export async function leaveOrKickPlayerInFirebase(roomCode, targetPlayerId = null) {
  const targetId = targetPlayerId || getMyPlayerId();
  if (!roomCode || !targetId) return;

  const roomRef = ref(db, `rooms/${roomCode}`);
  const presenceRef = ref(db, `rooms/${roomCode}/presence/${targetId}`);

  try {
    if (targetId === getMyPlayerId()) {
      await onDisconnect(roomRef).cancel();
      await onDisconnect(presenceRef).cancel();
    }
    await remove(presenceRef);
  } catch (_) {}

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    let players = room.players || [];
    const targetIdx = players.findIndex((p) => p.id === targetId);
    if (targetIdx === -1) return room;

    if (room.presence && room.presence[targetId]) {
      delete room.presence[targetId];
    }

    if (room.status === 'waiting') {
      // 대기실에서는 플레이어 슬롯에서 완전히 제거
      players.splice(targetIdx, 1);

      const remainingHumans = players.filter((p) => !p.isBot);
      if (remainingHumans.length === 0) {
        // 남은 인간 플레이어가 없으면 방 삭제
        return null;
      }

      // 방장이 나갔다면 다음 인간 플레이어에게 방장 위임
      if (!players.some((p) => p.isHost)) {
        remainingHumans[0].isHost = true;
        remainingHumans[0].isReady = true;
      }

      room.players = players;
      return room;
    }

    // 게임 진행 중(playing) 또는 결과창(ended)에서 나간 경우
    const targetPlayer = players[targetIdx];
    if (targetPlayer.isLeft) return room;

    targetPlayer.isLeft = true;
    targetPlayer.score = 0; // 점수 모두 삭제
    targetPlayer.pile = []; // 보유 카드 제거
    targetPlayer.isHost = false;

    const activeHumans = players.filter((p) => !p.isBot && !p.isLeft);
    if (activeHumans.length === 0) {
      // 남은 인간 플레이어가 한 명도 없으면 방 삭제
      return null;
    }

    // 방장이 나갔다면 남은 활성 인간 플레이어에게 방장 위임
    if (!players.some((p) => p.isHost && !p.isLeft)) {
      activeHumans[0].isHost = true;
      activeHumans[0].isReady = true;
    }

    if (room.status === 'playing') {
      const activePlayers = players.filter((p) => !p.isLeft);

      // 남은 플레이어가 1명 이하라면 즉시 게임 종료(승리) 처리
      if (activePlayers.length <= 1) {
        room.status = 'ended';
        room.duelState = null;
        room.voteState = null;
        room.badgeState = null;
        room.players = players;
        return room;
      }

      // 투표 중이었는데 나간 사람이 제출자/타겟이거나 투표 인원이 변경된 경우 정리
      if (room.voteState) {
        if (
          room.voteState.submitterId === targetId ||
          room.voteState.targetPlayerId === targetId
        ) {
          room.voteState = null;
        } else {
          const remainingVoters = activePlayers.filter(
            (p) => p.id !== room.voteState.submitterId
          );
          room.voteState.totalVoters = remainingVoters.length;
        }
      }

      // 대결 상태 재스캔
      const updatedDuel = scanTableForDuels(players, room.activeWildCard);
      room.duelState = updatedDuel;

      // 나간 사람의 턴이었다면 다음 활성 플레이어로 턴 이동
      if (room.turnIndex === targetIdx || players[room.turnIndex]?.isLeft) {
        room.needsExtraDraw = false;
        room.turnIndex = getNextActiveTurnIndex(players, targetIdx);
      }
    }

    room.players = players;
    return room;
  });
}

// 1. 방 만들기
export async function createRoomInFirebase({ nickname, penaltySeconds = 1, botDifficulty = 'normal' }) {
  const myId = getMyPlayerId();
  const cleanName = (nickname || '플레이어1').trim().slice(0, 12);
  let code = generateRoomCode();

  // 중복 코드 방지 확인
  const existingSnap = await get(ref(db, `rooms/${code}`));
  if (existingSnap.exists()) {
    code = generateRoomCode();
  }

  const roomData = {
    code,
    status: 'waiting',
    createdAt: Date.now(),
    options: {
      penaltySeconds: Number(penaltySeconds) || 0,
      botDifficulty: botDifficulty || 'normal'
    },
    deck: [],
    activeWildCard: null,
    turnIndex: 0,
    needsExtraDraw: false,
    presence: {
      [myId]: true
    },
    players: [
      {
        id: myId,
        nickname: cleanName,
        isHost: true,
        isBot: false,
        isLeft: false,
        isReady: true,
        score: 0,
        pile: [],
        cooldownUntil: 0
      }
    ],
    duelState: null,
    voteState: null,
    badgeState: null
  };

  await set(ref(db, `rooms/${code}`), roomData);
  await registerPresenceInFirebase(code);
  return { ok: true, roomCode: code };
}

// 2. 방 입장하기
export async function joinRoomInFirebase({ roomCode, nickname }) {
  const myId = getMyPlayerId();
  const code = (roomCode || '').trim();
  const roomRef = ref(db, `rooms/${code}`);

  const snap = await get(roomRef);
  if (!snap.exists()) {
    return { ok: false, message: '존재하지 않는 방 코드입니다.' };
  }

  let errorReason = null;
  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    const players = room.players || [];

    const existing = players.find((p) => p.id === myId && !p.isLeft);
    if (existing) {
      if (nickname && nickname.trim()) {
        existing.nickname = nickname.trim().slice(0, 12);
      }
      if (!room.presence) room.presence = {};
      room.presence[myId] = true;
      return room;
    }

    if (room.status !== 'waiting') {
      errorReason = '이미 게임이 진행 중인 방입니다.';
      return;
    }
    if (players.length >= 6) {
      errorReason = '방 인원이 가득 찼습니다 (최대 6인).';
      return;
    }

    const cleanName = (nickname || `플레이어${players.length + 1}`).trim().slice(0, 12);
    players.push({
      id: myId,
      nickname: cleanName,
      isHost: false,
      isBot: false,
      isLeft: false,
      isReady: false,
      score: 0,
      pile: [],
      cooldownUntil: 0
    });
    room.players = players;
    if (!room.presence) room.presence = {};
    room.presence[myId] = true;
    return room;
  });

  if (errorReason) {
    return { ok: false, message: errorReason };
  }
  await registerPresenceInFirebase(code);
  return { ok: true, roomCode: code };
}

// 3. 연습용 봇 추가
export async function addBotInFirebase(roomCode) {
  const myId = getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'waiting') return room;
    const players = room.players || [];
    const me = players.find((p) => p.id === myId);
    if (!me || !me.isHost || players.length >= 6) return room;

    const botNames = ['야옹이봇', '스피더봇', '번개손봇', '단어왕봇', '블리츠봇'];
    const usedNames = new Set(players.map((p) => p.nickname));
    const botName = botNames.find((n) => !usedNames.has(n)) || `봇${players.length}`;

    players.push({
      id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      nickname: botName,
      isHost: false,
      isBot: true,
      difficulty: 'normal',
      isLeft: false,
      isReady: true,
      score: 0,
      pile: [],
      cooldownUntil: 0
    });
    room.players = players;
    return room;
  });
}

// 3-1. 개별 봇 난이도 변경 (하: easy / 중: normal / 상: hard)
export async function updateBotDifficultyInFirebase(roomCode, botPlayerId, difficulty) {
  const myId = getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'waiting') return room;
    const players = room.players || [];
    const me = players.find((p) => p.id === myId);
    if (!me || !me.isHost) return room;

    const targetBot = players.find((p) => p.id === botPlayerId && p.isBot);
    if (!targetBot) return room;

    targetBot.difficulty = difficulty || 'normal';
    room.players = players;
    return room;
  });
}

// 4. 준비/준비취소 토글
export async function toggleReadyInFirebase(roomCode) {
  const myId = getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'waiting') return room;
    const players = room.players || [];
    const me = players.find((p) => p.id === myId);
    if (!me || me.isHost) return room;
    me.isReady = !me.isReady;
    room.players = players;
    return room;
  });
}

// 5. 방 옵션 변경
export async function updateOptionsInFirebase(roomCode, newOptions = {}) {
  const myId = getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'waiting') return room;
    const players = room.players || [];
    const me = players.find((p) => p.id === myId);
    if (!me || !me.isHost) return room;
    const currentOpts = room.options || { penaltySeconds: 1, botDifficulty: 'normal' };
    room.options = {
      penaltySeconds:
        newOptions.penaltySeconds !== undefined
          ? Number(newOptions.penaltySeconds) || 0
          : Number(currentOpts.penaltySeconds) || 0,
      botDifficulty: newOptions.botDifficulty || currentOpts.botDifficulty || 'normal'
    };
    return room;
  });
}

// 6. 게임 시작
export async function startGameInFirebase(roomCode) {
  const myId = getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  let errMsg = null;

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    const players = (room.players || []).filter((p) => !p.isLeft);
    const me = players.find((p) => p.id === myId);
    if (!me || !me.isHost) return room;

    if (players.length < 2) {
      errMsg = '최소 2명 이상의 플레이어가 필요합니다.';
      return;
    }
    const allReady = players.every((p) => p.isHost || p.isBot || p.isReady);
    if (!allReady) {
      errMsg = '모든 플레이어가 준비를 완료해야 시작할 수 있습니다.';
      return;
    }

    room.deck = createDynamicDeck(players.length, 8);
    room.activeWildCard = null;
    room.turnIndex = 0;
    room.needsExtraDraw = false;
    room.duelState = null;
    room.voteState = null;
    room.badgeState = null;
    room.status = 'playing';

    room.players = players.map((p) => ({
      ...p,
      isLeft: false,
      score: 0,
      pile: [],
      cooldownUntil: 0
    }));

    return room;
  });

  if (errMsg) return { ok: false, message: errMsg };
  return { ok: true };
}

// 7. 카드 뽑기
export async function drawCardInFirebase(roomCode, overridePlayerId = null) {
  const actorId = overridePlayerId || getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'playing') return room;
    if (room.duelState || room.voteState || room.badgeState) return room;

    const players = room.players || [];
    const turnIdx = room.turnIndex || 0;
    const currentPlayer = players[turnIdx];
    if (!currentPlayer || currentPlayer.id !== actorId || currentPlayer.isLeft) return room;

    const deck = room.deck || [];
    if (deck.length === 0) {
      room.status = 'ended';
      return room;
    }

    const drawnCard = deck.shift();
    room.deck = deck;

    if (drawnCard.type === 'wild') {
      room.activeWildCard = drawnCard;
      room.needsExtraDraw = true;

      const immediateDuel = scanTableForDuels(players, room.activeWildCard);
      if (immediateDuel) {
        room.duelState = immediateDuel;
      } else if (deck.length === 0) {
        room.status = 'ended';
      }
      return room;
    }

    if (!Array.isArray(currentPlayer.pile)) currentPlayer.pile = [];
    currentPlayer.pile.push(drawnCard);
    room.players = players;
    room.needsExtraDraw = false;

    const duel = scanTableForDuels(players, room.activeWildCard);
    if (duel) {
      room.duelState = duel;
    } else if (deck.length === 0) {
      room.status = 'ended';
    } else {
      room.turnIndex = getNextActiveTurnIndex(players, turnIdx);
    }

    return room;
  });
}

// 1초 배지 노출이 끝난 후 점수 반영 및 연쇄(캐스케이드) 대결 스캔
export async function completeBadgePhaseInFirebase(roomCode, expectedBadgeId) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room || !room.badgeState) return room;
    if (expectedBadgeId && room.badgeState.id !== expectedBadgeId) return room;

    const bs = room.badgeState;
    const players = room.players || [];
    room.badgeState = null;

    if (bs.approved) {
      const winner = players.find((p) => p.id === bs.submitterId && !p.isLeft);
      if (winner) {
        winner.score = (winner.score || 0) + 1;
      }
      room.players = players;

      // 패자의 아래 카드가 드러났으므로 즉시 연쇄(캐스케이드) 대결 스캔
      const cascadeDuel = scanTableForDuels(players, room.activeWildCard);
      if (cascadeDuel) {
        room.duelState = cascadeDuel;
        return room;
      }

      room.duelState = null;
      const deck = room.deck || [];
      if (deck.length === 0) {
        room.status = 'ended';
        return room;
      }

      if (!room.needsExtraDraw || players[room.turnIndex || 0]?.isLeft) {
        room.needsExtraDraw = false;
        room.turnIndex = getNextActiveTurnIndex(players, room.turnIndex || 0);
      }
      return room;
    } else {
      // 노인정 시 오답 페널티 부여 후 즉시 입력 대결 유지
      const penaltySec = Number(room.options?.penaltySeconds) || 0;
      if (penaltySec > 0) {
        const submitter = players.find((p) => p.id === bs.submitterId);
        if (submitter) {
          submitter.cooldownUntil = Date.now() + penaltySec * 1000;
        }
        room.players = players;
      }
      return room;
    }
  });
}

// 8. 대결 정답 제출 (인간 플레이어 또는 봇 공격 공통)
export async function submitAnswerInFirebase(
  roomCode,
  { word, targetPlayerId, overridePlayerId = null }
) {
  const actorId = overridePlayerId || getMyPlayerId();
  const cleanWord = (word || '').trim();
  if (!cleanWord) return;

  const roomRef = ref(db, `rooms/${roomCode}`);
  let triggeredBadgeId = null;

  await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'playing') return room;
    if (!room.duelState || room.voteState || room.badgeState) return room;

    const participants = room.duelState.participants || [];
    if (!participants.includes(actorId)) return room;

    const players = room.players || [];
    const submitter = players.find((p) => p.id === actorId && !p.isLeft);
    if (!submitter) return room;

    if (submitter.cooldownUntil && Date.now() < submitter.cooldownUntil) {
      return room;
    }

    const opponents = room.duelState.opponentMap?.[actorId] || [];
    if (opponents.length === 0) return room;

    // 1단계: 공식 사전(words_master + Firebase promoted)에 있는 단어인지 즉시 확인
    const orderedOpponents = targetPlayerId
      ? [
          ...opponents.filter((o) => o.playerId === targetPlayerId),
          ...opponents.filter((o) => o.playerId !== targetPlayerId)
        ]
      : opponents;

    for (const opp of orderedOpponents) {
      if (isWordInMaster(opp.category, cleanWord)) {
        const loser = players.find((p) => p.id === opp.playerId);
        let capturedCard = null;
        if (loser && Array.isArray(loser.pile) && loser.pile.length > 0) {
          capturedCard = loser.pile.pop();
        }
        room.players = players;

        const badgeId = `badge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        triggeredBadgeId = badgeId;
        room.badgeState = {
          id: badgeId,
          approved: true,
          word: cleanWord,
          submitterId: submitter.id,
          submitterNickname: submitter.nickname,
          targetPlayerId: opp.playerId,
          category: opp.category,
          capturedCard
        };
        return room;
      }
    }

    // 2단계: 사전에 없는 단어는 5초 실시간 투표 시작
    const targetOpp =
      opponents.find((o) => o.playerId === targetPlayerId) || opponents[0];
    const eligibleVoters = players.filter((p) => !p.isLeft && p.id !== submitter.id);

    const initialVotes = {};
    eligibleVoters.forEach((v) => {
      if (v.isBot) {
        initialVotes[v.id] = true;
      }
    });

    room.voteState = {
      id: `vote_${Date.now()}`,
      word: cleanWord,
      category: targetOpp.category,
      submitterId: submitter.id,
      submitterNickname: submitter.nickname,
      targetPlayerId: targetOpp.playerId,
      targetNickname: targetOpp.nickname,
      totalVoters: eligibleVoters.length,
      expiresAt: Date.now() + 5000,
      votes: initialVotes
    };

    return room;
  });

  if (triggeredBadgeId) {
    setTimeout(() => {
      completeBadgePhaseInFirebase(roomCode, triggeredBadgeId);
    }, 1000);
  }
}

// 투표 집계 및 종료 트랜잭션
export async function finalizeVoteInFirebase(roomCode, expectedVoteId = null) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  let approvedVoteInfo = null;
  let triggeredBadgeId = null;

  await runTransaction(roomRef, (room) => {
    if (!room || !room.voteState) return room;
    if (expectedVoteId && room.voteState.id !== expectedVoteId) return room;

    const vs = room.voteState;
    const votes = vs.votes || {};
    const voteValues = Object.values(votes);
    const yesCount = voteValues.filter((v) => v === true).length;
    const noCount = voteValues.filter((v) => v === false).length;

    const isApproved = voteValues.length === 0 ? true : yesCount > noCount;
    const players = room.players || [];
    const loser = players.find((p) => p.id === vs.targetPlayerId);

    let capturedCard = null;
    if (isApproved && loser && Array.isArray(loser.pile) && loser.pile.length > 0) {
      capturedCard = loser.pile.pop();
    }
    room.players = players;
    room.voteState = null;

    const badgeId = `badge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    triggeredBadgeId = badgeId;

    room.badgeState = {
      id: badgeId,
      approved: isApproved,
      word: vs.word,
      submitterId: vs.submitterId,
      submitterNickname: vs.submitterNickname,
      targetPlayerId: vs.targetPlayerId,
      category: vs.category,
      capturedCard
    };

    if (isApproved) {
      approvedVoteInfo = { category: vs.category, word: vs.word };
    }

    return room;
  });

  if (approvedVoteInfo) {
    recordApprovedVoteInFirebase(
      approvedVoteInfo.category,
      approvedVoteInfo.word,
      roomCode
    );
  }

  if (triggeredBadgeId) {
    setTimeout(() => {
      completeBadgePhaseInFirebase(roomCode, triggeredBadgeId);
    }, 1000);
  }
}

// 9. 투표하기 (제출자 본인은 투표 불가)
export async function castVoteInFirebase(roomCode, choice) {
  const myId = getMyPlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  let allVotedVoteId = null;

  await runTransaction(roomRef, (room) => {
    if (!room || !room.voteState) return room;
    const vs = room.voteState;
    if (vs.submitterId === myId) return room;

    if (!vs.votes) vs.votes = {};
    if (vs.votes[myId] !== undefined) return room;

    vs.votes[myId] = choice === 'yes';
    room.voteState = vs;

    if (Object.keys(vs.votes).length >= (vs.totalVoters || 0)) {
      allVotedVoteId = vs.id;
    }
    return room;
  });

  if (allVotedVoteId) {
    setTimeout(() => {
      finalizeVoteInFirebase(roomCode, allVotedVoteId);
    }, 650);
  }
}

// 10. 대기실로 돌아가기 (한 판 더 하기 - 중도 퇴장자 목록에서 정리)
export async function backToWaitingInFirebase(roomCode) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    room.status = 'waiting';
    room.duelState = null;
    room.voteState = null;
    room.badgeState = null;
    room.activeWildCard = null;
    room.turnIndex = 0;
    room.players = (room.players || [])
      .filter((p) => !p.isLeft)
      .map((p) => ({
        ...p,
        isLeft: false,
        score: 0,
        pile: [],
        cooldownUntil: 0,
        isReady: !!(p.isHost || p.isBot)
      }));
    return room;
  });
}
