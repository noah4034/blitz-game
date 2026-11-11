import React, { useState, useEffect, useRef } from 'react';
import BlitzCard from './BlitzCard';
import VoteModal from './VoteModal';
import ResultModal from './ResultModal';

/**
 * 나를 항상 하단(seat-bottom)에 배치하고, 인원수(2~6인)에 맞춰
 * 상/좌/우 테두리에 상대방들을 배치합니다.
 * 상단/하단은 가로형(horizontal), 좌/우는 세로형(vertical) 카드를 사용합니다.
 */
function getSeatLayout(players, myId) {
  const activePlayers = (players || []).filter((p) => !p.isLeft);
  const myIdx = activePlayers.findIndex((p) => p.id === myId);
  const ordered =
    myIdx >= 0
      ? [...activePlayers.slice(myIdx), ...activePlayers.slice(0, myIdx)]
      : [...activePlayers];

  const total = ordered.length;
  const seatPresets = {
    1: [{ pos: 'seat-bottom', orientation: 'horizontal' }],
    2: [
      { pos: 'seat-bottom', orientation: 'horizontal' },
      { pos: 'seat-top', orientation: 'horizontal' }
    ],
    3: [
      { pos: 'seat-bottom', orientation: 'horizontal' },
      { pos: 'seat-left', orientation: 'vertical' },
      { pos: 'seat-right', orientation: 'vertical' }
    ],
    4: [
      { pos: 'seat-bottom', orientation: 'horizontal' },
      { pos: 'seat-left', orientation: 'vertical' },
      { pos: 'seat-top', orientation: 'horizontal' },
      { pos: 'seat-right', orientation: 'vertical' }
    ],
    5: [
      { pos: 'seat-bottom', orientation: 'horizontal' },
      { pos: 'seat-left', orientation: 'vertical' },
      { pos: 'seat-top-left', orientation: 'horizontal' },
      { pos: 'seat-top-right', orientation: 'horizontal' },
      { pos: 'seat-right', orientation: 'vertical' }
    ],
    6: [
      { pos: 'seat-bottom', orientation: 'horizontal' },
      { pos: 'seat-bottom-left', orientation: 'horizontal' },
      { pos: 'seat-top-left', orientation: 'horizontal' },
      { pos: 'seat-top', orientation: 'horizontal' },
      { pos: 'seat-top-right', orientation: 'horizontal' },
      { pos: 'seat-bottom-right', orientation: 'horizontal' }
    ]
  };

  const layout = seatPresets[total] || seatPresets[6];
  return ordered.map((player, idx) => ({
    player,
    pos: layout[idx]?.pos || 'seat-top',
    orientation: layout[idx]?.orientation || 'horizontal'
  }));
}

export default function GameTableView({
  room,
  myId,
  onDrawCard,
  onSubmitAnswer,
  onCastVote,
  onPlayAgain,
  onLeaveRoom
}) {
  const [answerText, setAnswerText] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [flyingCardAnim, setFlyingCardAnim] = useState(null);
  const [drawCardAnim, setDrawCardAnim] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [hasDrawnOnce, setHasDrawnOnce] = useState(false);
  const inputRef = useRef(null);
  const tableRef = useRef(null);
  const deckRef = useRef(null);
  const wildSlotRef = useRef(null);
  const seatRefs = useRef({});
  const seatCardRefs = useRef({});
  const lastDrawIdRef = useRef(room.lastDraw?.id || null);
  const lastCooldownIdRef = useRef(null);

  const isMyTurn = room.currentTurnPlayerId === myId;
  const currentTurnPlayer = room.players.find(
    (p) => p.id === room.currentTurnPlayerId
  );
  const me = room.players.find((p) => p.id === myId);

  const isDuelActive = !!room.duelState;
  const amIInDuel =
    isDuelActive && room.duelState.participants.includes(myId);
  const myOpponents =
    (amIInDuel && room.duelState.opponentMap?.[myId]) || [];
  const duelSignature = room.duelState ? JSON.stringify(room.duelState) : '';

  // 새 게임 시작 시 첫 턴 힌트 표시 상태 초기화 및 첫 카드 뽑기 완료 감지
  useEffect(() => {
    if (!room.lastDraw && room.deckCount >= 70) {
      setHasDrawnOnce(false);
      return;
    }
    if ((me?.pileCount || 0) > 0) {
      setHasDrawnOnce(true);
    }
  }, [room.lastDraw, room.deckCount, me?.pileCount]);

  // 대결 상대 선택 기본값 유지
  useEffect(() => {
    if (myOpponents.length > 0) {
      if (!myOpponents.some((o) => o.playerId === selectedTargetId)) {
        setSelectedTargetId(myOpponents[0].playerId);
      }
    } else {
      setSelectedTargetId(null);
    }
  }, [room.duelState, myId]);

  // 대결 시작, 연쇄 대결 전환, 투표/배지 전환 시마다 입력창을 항상 빈칸으로 초기화 후 자동 포커스
  useEffect(() => {
    setAnswerText('');
    if (amIInDuel && !room.voteState && !room.badgeState && cooldownLeft === 0) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    }
  }, [amIInDuel, duelSignature, room.voteState?.id, room.badgeState?.id]);

  // 오답 페널티 쿨타임이 0초로 해제되는 즉시 입력창에 다시 자동 포커스
  useEffect(() => {
    if (amIInDuel && !room.voteState && !room.badgeState && cooldownLeft === 0) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    }
  }, [cooldownLeft, amIInDuel, room.voteState, room.badgeState]);

  // 덱에서 플레이어 더미 또는 와일드카드 더미로 카드가 이동하는 애니메이션
  useEffect(() => {
    const ld = room.lastDraw;
    if (!ld || !ld.id) {
      lastDrawIdRef.current = null;
      setDrawCardAnim(null);
      return;
    }

    if (lastDrawIdRef.current === ld.id) return;
    lastDrawIdRef.current = ld.id;

    const tableEl = tableRef.current;
    const deckEl = deckRef.current;
    const targetEl =
      ld.targetType === 'wild'
        ? wildSlotRef.current
        : seatCardRefs.current[ld.targetPlayerId] || seatRefs.current[ld.targetPlayerId];

    if (!tableEl || !deckEl || !targetEl) return;

    const tableRect = tableEl.getBoundingClientRect();
    const deckRect = deckEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const startX = deckRect.left - tableRect.left + deckRect.width / 2;
    const startY = deckRect.top - tableRect.top + deckRect.height / 2;
    const endX = targetRect.left - tableRect.left + targetRect.width / 2;
    const endY = targetRect.top - tableRect.top + targetRect.height / 2;

    const currentSeats = getSeatLayout(room.players, myId);
    const targetSeat = currentSeats.find((s) => s.player.id === ld.targetPlayerId);
    const orientation =
      ld.targetType === 'wild' ? 'vertical' : targetSeat?.orientation || 'vertical';

    setDrawCardAnim({
      id: ld.id,
      card: ld.card,
      targetType: ld.targetType,
      targetPlayerId: ld.targetPlayerId,
      prevCard: ld.prevCard || null,
      orientation,
      startX,
      startY,
      endX,
      endY,
      phase: 'start'
    });

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDrawCardAnim((prev) => (prev ? { ...prev, phase: 'moving' } : null));
      });
    });

    const clearTimer = setTimeout(() => {
      setDrawCardAnim((prev) => (prev?.id === ld.id ? null : prev));
    }, 380);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(clearTimer);
    };
  }, [room.lastDraw?.id, myId]);

  // 대결 승리 시 상대방 카드가 승자(내 쪽)로 축소되며 날아오는 애니메이션 실행
  useEffect(() => {
    const bs = room.badgeState;
    if (!bs || !bs.approved || !bs.capturedCard) {
      setFlyingCardAnim(null);
      return;
    }

    const fromEl = seatRefs.current[bs.targetPlayerId];
    const toEl = seatRefs.current[bs.submitterId];
    const tableEl = tableRef.current;

    if (!fromEl || !toEl || !tableEl) return;

    const tableRect = tableEl.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const startX = fromRect.left - tableRect.left + fromRect.width / 2;
    const startY = fromRect.top - tableRect.top + fromRect.height / 2;
    const endX = toRect.left - tableRect.left + toRect.width / 2;
    const endY = toRect.top - tableRect.top + toRect.height / 2;

    const currentSeats = getSeatLayout(room.players, myId);
    const loserSeat = currentSeats.find((s) => s.player.id === bs.targetPlayerId);
    const orientation = loserSeat?.orientation || 'vertical';

    setFlyingCardAnim({
      card: bs.capturedCard,
      orientation,
      startX,
      startY,
      endX,
      endY,
      phase: 'start'
    });

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyingCardAnim((prev) => (prev ? { ...prev, phase: 'moving' } : null));
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [room.badgeState?.id]);

  // 오답 페널티 쿨타임 타이머 계산 (기기 간 시계 오차 영향을 받지 않도록 내 기기 타이머로 정확히 카운트다운)
  useEffect(() => {
    if (!amIInDuel || !me?.cooldownId || !me?.cooldownSeconds) {
      lastCooldownIdRef.current = me?.cooldownId || null;
      setCooldownLeft(0);
      return;
    }

    if (lastCooldownIdRef.current === me.cooldownId) return;
    lastCooldownIdRef.current = me.cooldownId;

    const penaltySec = Number(me.cooldownSeconds) || 0;
    if (penaltySec <= 0) {
      setCooldownLeft(0);
      return;
    }

    const localEnd = Date.now() + penaltySec * 1000;
    setCooldownLeft(penaltySec);

    const timer = setInterval(() => {
      const diff = Math.ceil((localEnd - Date.now()) / 1000);
      if (diff <= 0) {
        setCooldownLeft(0);
        clearInterval(timer);
      } else {
        setCooldownLeft(diff);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [amIInDuel, me?.cooldownId, me?.cooldownSeconds]);

  // 스페이스바 카드 뒤집기 단축키
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (room.status !== 'playing') return;
      if (room.voteState || room.badgeState) return;

      if (e.code === 'Space') {
        // 입력창에 포커스되어 있을 때는 스페이스바가 공백 입력으로 작동하도록 허용
        if (document.activeElement === inputRef.current) return;
        e.preventDefault();
        if (isMyTurn && !isDuelActive) {
          onDrawCard();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [room.status, room.voteState, room.badgeState, isMyTurn, isDuelActive, onDrawCard]);

  const handleSubmitForm = (e) => {
    e.preventDefault();
    if (!answerText.trim() || cooldownLeft > 0) return;
    onSubmitAnswer({
      word: answerText.trim(),
      targetPlayerId: selectedTargetId || myOpponents[0]?.playerId
    });
    setAnswerText('');
  };

  const seats = getSeatLayout(room.players, myId);
  const activeTarget =
    myOpponents.find((o) => o.playerId === selectedTargetId) || myOpponents[0];

  return (
    <div className="table-container" ref={tableRef}>
      {/* 좌측 상단 상태 바 & 나가기 버튼 */}
      <div className="top-status-bar">
        <button
          type="button"
          className="btn-ingame-leave"
          onClick={() => setShowLeaveModal(true)}
        >
          나가기
        </button>
        <span>•</span>
        <span>
          방 코드: <strong className="status-highlight">{room.code}</strong>
        </span>
        <span>•</span>
        <span>
          현재 턴:{' '}
          <strong className="status-highlight">
            {currentTurnPlayer?.nickname || '-'}
            {isMyTurn ? ' (나)' : ''}
          </strong>
        </span>
      </div>

      {/* 중앙 테이블 존: 덱 & 2색 연결 와일드카드 슬롯 */}
      <div className="center-table-zone">
        <div className="deck-area">
          <div
            ref={deckRef}
            className={`blitz-card card-vertical card-back ${
              isMyTurn && !isDuelActive ? 'my-turn' : ''
            }`}
            onClick={() => {
              if (isMyTurn && !isDuelActive && !room.voteState && !room.badgeState) {
                onDrawCard();
              }
            }}
            title={
              isMyTurn
                ? '클릭하거나 스페이스바를 눌러 카드를 뒤집으세요'
                : `${currentTurnPlayer?.nickname}님의 턴입니다`
            }
          >
            <div className="deck-count">{room.deckCount}</div>
            <div className="deck-label">남은 카드</div>
          </div>

          {!isDuelActive ? (
            <div className={`turn-guide-pill ${isMyTurn ? '' : 'waiting'}`}>
              {isMyTurn
                ? !hasDrawnOnce
                  ? '내 차례! 스페이스바 또는 클릭 [SPACE]'
                  : '내 차례!'
                : `${currentTurnPlayer?.nickname}님 차례`}
            </div>
          ) : (
            <div
              className="turn-guide-pill"
              style={{ background: '#D6336C', boxShadow: '0 4px 14px rgba(214,51,108,0.4)' }}
            >
              ⚡ 대결 진행 중!
            </div>
          )}
        </div>

        {/* 와일드카드 슬롯 */}
        <div className="deck-area">
          <div ref={wildSlotRef}>
            <BlitzCard
              card={
                drawCardAnim?.targetType === 'wild'
                  ? drawCardAnim.prevCard
                  : room.activeWildCard
              }
              orientation="vertical"
            />
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
            와일드카드
          </div>
        </div>
      </div>

      {/* 테두리 플레이어 좌석 배치 */}
      {seats.map(({ player, pos, orientation }) => {
        const isParticipant =
          isDuelActive && room.duelState.participants.includes(player.id);
        const isTurn = room.currentTurnPlayerId === player.id;
        const isTopSeat = pos.startsWith('seat-top');
        const diffLabel = player.isBot
          ? player.difficulty === 'hard'
            ? '(상)'
            : player.difficulty === 'easy'
            ? '(하)'
            : '(중)'
          : '';
        const isReceivingDraw =
          drawCardAnim?.targetType === 'player' &&
          drawCardAnim?.targetPlayerId === player.id;
        const displayedCard = isReceivingDraw ? drawCardAnim.prevCard : player.topCard;

        return (
          <div
            key={player.id}
            ref={(el) => {
              seatRefs.current[player.id] = el;
            }}
            className={`player-seat ${pos}`}
          >
            {/* 상단 좌석은 이름표를 카드 위에 배치 */}
            {isTopSeat && (
              <div
                className={`seat-info ${isTurn ? 'active-turn' : ''} ${
                  player.id === myId ? 'me-seat' : ''
                }`}
              >
                <span>
                  {player.nickname} {diffLabel} {player.id === myId ? '(나)' : ''}
                </span>
                <span className="seat-score">★ {player.score}장</span>
              </div>
            )}

            <div
              ref={(el) => {
                seatCardRefs.current[player.id] = el;
              }}
            >
              <BlitzCard
                card={displayedCard}
                orientation={orientation}
                isGlowing={isParticipant && !isReceivingDraw}
              />
            </div>

            {/* 하단 및 좌/우 좌석은 이름표를 카드 아래에 배치 */}
            {!isTopSeat && (
              <div
                className={`seat-info ${isTurn ? 'active-turn' : ''} ${
                  player.id === myId ? 'me-seat' : ''
                }`}
              >
                <span>
                  {player.nickname} {diffLabel} {player.id === myId ? '(나)' : ''}
                </span>
                <span className="seat-score">★ {player.score}장</span>
              </div>
            )}
          </div>
        );
      })}

      {/* 덱에서 플레이어 더미 / 와일드카드 더미로 이동하는 카드 뽑기 애니메이션 */}
      {drawCardAnim && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 440,
            transform:
              drawCardAnim.phase === 'moving'
                ? `translate(${drawCardAnim.endX}px, ${drawCardAnim.endY}px) translate(-50%, -50%) scale(1)`
                : `translate(${drawCardAnim.startX}px, ${drawCardAnim.startY}px) translate(-50%, -50%) scale(0.85)`,
            opacity: 1,
            transition:
              drawCardAnim.phase === 'moving'
                ? 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'none'
          }}
        >
          <BlitzCard
            card={drawCardAnim.card}
            orientation={drawCardAnim.orientation}
            isGlowing={false}
          />
        </div>
      )}

      {/* 대결 승리 시 패자의 카드가 승자 쪽으로 축소되며 흡수되는 애니메이션 */}
      {flyingCardAnim && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 450,
            transform:
              flyingCardAnim.phase === 'moving'
                ? `translate(${flyingCardAnim.endX}px, ${flyingCardAnim.endY}px) translate(-50%, -50%) scale(0.18) rotate(12deg)`
                : `translate(${flyingCardAnim.startX}px, ${flyingCardAnim.startY}px) translate(-50%, -50%) scale(1.05) rotate(0deg)`,
            opacity: flyingCardAnim.phase === 'moving' ? 0.15 : 1,
            transition:
              flyingCardAnim.phase === 'moving'
                ? 'transform 0.78s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.78s ease-in'
                : 'none'
          }}
        >
          <BlitzCard
            card={flyingCardAnim.card}
            orientation={flyingCardAnim.orientation}
            isGlowing={true}
          />
        </div>
      )}

      {/* 하단 대결 정답 입력창 (내가 대결 대상자일 때 표시) */}
      {amIInDuel && !room.voteState && !room.badgeState && (
        <form className="duel-input-bar" onSubmit={handleSubmitForm}>
          {/* 3인 이상 다자 경합 시 상대방 선택 탭 */}
          {myOpponents.length > 1 && (
            <div className="duel-target-tabs">
              {myOpponents.map((opp) => (
                <button
                  key={opp.playerId}
                  type="button"
                  className={`duel-target-tab ${
                    activeTarget?.playerId === opp.playerId ? 'active' : ''
                  }`}
                  onClick={() => setSelectedTargetId(opp.playerId)}
                >
                  🎯 {opp.nickname} [{opp.category}]
                </button>
              ))}
            </div>
          )}

          <div className="duel-input-row">
            <input
              ref={inputRef}
              type="text"
              className="duel-input"
              disabled={cooldownLeft > 0}
              placeholder={
                cooldownLeft > 0
                  ? `오답 페널티! ${cooldownLeft}초 후 입력 가능...`
                  : activeTarget
                  ? `상대방 주제 [${activeTarget.category}] 단어를 입력하세요!`
                  : '단어를 입력하세요!'
              }
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
            />
            <button
              type="submit"
              className="btn-submit"
              disabled={cooldownLeft > 0 || !answerText.trim()}
            >
              입력
            </button>
          </div>
        </form>
      )}

      {/* 실시간 투표 모달 (5초 카운트다운, 남은 인원수, 본인 제외, O/X 확장) & 1초 인정/노인정 모달 */}
      <VoteModal
        voteState={room.voteState}
        badgeState={room.badgeState}
        myId={myId}
        onCastVote={onCastVote}
      />

      {/* 게임 종료 결과 모달 (학습 내용 제외, 순위 보드만 표시) */}
      {room.status === 'ended' && (
        <ResultModal
          players={room.players}
          myId={myId}
          onPlayAgain={onPlayAgain}
          onLeaveRoom={onLeaveRoom}
        />
      )}

      {/* 인게임 나가기 경고 확인 모달 */}
      {showLeaveModal && (
        <div className="leave-modal-overlay">
          <div className="leave-modal">
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ fontSize: '19px', fontWeight: 800, marginBottom: '24px', lineHeight: 1.4 }}>
              점수가 모두 삭제됩니다.
              <br />
              나가시겠습니까?
            </h3>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLeaveModal(false)}
              >
                아니오
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#C92A2A', color: '#fff' }}
                onClick={() => {
                  setShowLeaveModal(false);
                  onLeaveRoom();
                }}
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
