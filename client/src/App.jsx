import React, { useState, useEffect, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { db, getMyPlayerId } from './firebase';
import {
  formatRoomSnapshot,
  createRoomInFirebase,
  joinRoomInFirebase,
  addBotInFirebase,
  toggleReadyInFirebase,
  updateOptionsInFirebase,
  startGameInFirebase,
  drawCardInFirebase,
  submitAnswerInFirebase,
  castVoteInFirebase,
  finalizeVoteInFirebase,
  backToWaitingInFirebase,
  leaveOrKickPlayerInFirebase,
  cleanupStaleRoomsInFirebase,
  syncLastHumanDisconnectHook
} from './gameService';
import LobbyView from './components/LobbyView';
import WaitingRoom from './components/WaitingRoom';
import GameTableView from './components/GameTableView';

export default function App() {
  const [myId] = useState(() => getMyPlayerId());
  const [activeRoomCode, setActiveRoomCode] = useState(null);
  const [rawRoom, setRawRoom] = useState(null);
  const [room, setRoom] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // 로비 진입 시 DB에 남아있는 유령 방(접속자 0명 방) 자동 청소
  useEffect(() => {
    if (!activeRoomCode) {
      cleanupStaleRoomsInFirebase();
    }
  }, [activeRoomCode]);

  // Firebase 실시간 방 구독 및 강퇴/연결 끊김 감지
  useEffect(() => {
    if (!activeRoomCode) {
      setRawRoom(null);
      setRoom(null);
      return;
    }

    const roomRef = ref(db, `rooms/${activeRoomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setActiveRoomCode(null);
        setRawRoom(null);
        setRoom(null);
        return;
      }

      const players = data.players || [];
      const me = players.find((p) => p.id === myId);

      // 내가 강퇴되었거나 퇴장 처리된 경우 로비로 이동
      if (!me || me.isLeft) {
        setActiveRoomCode(null);
        setRawRoom(null);
        setRoom(null);
        return;
      }

      // 방에 남은 인간 플레이어가 나 혼자뿐이라면 탭 종료 시 Firebase 서버가 방 통째로 삭제하도록 설정
      const activeHumans = players.filter((p) => !p.isBot && !p.isLeft);
      const isOnlyHuman = activeHumans.length === 1 && activeHumans[0].id === myId;
      syncLastHumanDisconnectHook(data.code, isOnlyHuman);

      // 다른 플레이어가 탭/창을 닫아 presence가 끊긴 경우 즉시 퇴장 처리
      const presence = data.presence || {};
      players.forEach((p) => {
        if (!p.isBot && !p.isLeft && p.id !== myId && !presence[p.id]) {
          leaveOrKickPlayerInFirebase(data.code, p.id);
        }
      });

      setRawRoom(data);
      setRoom(formatRoomSnapshot(data));
    });

    return () => unsubscribe();
  }, [activeRoomCode, myId]);

  // 브라우저 탭/창 닫기 시 즉시 방 나가기 처리
  useEffect(() => {
    if (!activeRoomCode) return;

    const handleUnload = () => {
      leaveOrKickPlayerInFirebase(activeRoomCode, myId);
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [activeRoomCode, myId]);

  // 5초 투표 타이머 실시간 카운트다운 및 만료 시 자동 집계
  useEffect(() => {
    if (!rawRoom?.voteState) return;

    const voteId = rawRoom.voteState.id;
    const expiresAt = rawRoom.voteState.expiresAt;
    const votedCount = Object.keys(rawRoom.voteState.votes || {}).length;
    const totalVoters = rawRoom.voteState.totalVoters || 0;

    if (totalVoters > 0 && votedCount >= totalVoters) {
      const t = setTimeout(() => {
        finalizeVoteInFirebase(rawRoom.code, voteId);
      }, 700);
      return () => clearTimeout(t);
    }

    const interval = setInterval(() => {
      const now = Date.now();
      setRoom(formatRoomSnapshot(rawRoom));

      if (expiresAt && now >= expiresAt) {
        clearInterval(interval);
        finalizeVoteInFirebase(rawRoom.code, voteId);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [rawRoom]);

  // 봇 턴일 때 방장 클라이언트가 1.1초 후 자동으로 봇 카드 뽑기 실행
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    if (room.duelState || room.voteState || room.badgeState) return;

    const me = room.players.find((p) => p.id === myId && !p.isLeft);
    if (!me?.isHost) return;

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer && currentPlayer.isBot && !currentPlayer.isLeft) {
      const timer = setTimeout(() => {
        drawCardInFirebase(room.code, currentPlayer.id);
      }, 1100);
      return () => clearTimeout(timer);
    }
  }, [
    room?.code,
    room?.status,
    room?.turnIndex,
    room?.needsExtraDraw,
    room?.duelState,
    room?.voteState,
    room?.badgeState,
    myId
  ]);

  const handleCreateRoom = useCallback(async ({ nickname, penaltySeconds }) => {
    setErrorMsg('');
    try {
      const res = await createRoomInFirebase({ nickname, penaltySeconds });
      if (res.ok) {
        setActiveRoomCode(res.roomCode);
      } else {
        setErrorMsg(res.message || '방 생성에 실패했습니다.');
      }
    } catch (err) {
      setErrorMsg('Firebase 연결 중 오류가 발생했습니다.');
    }
  }, []);

  const handleJoinRoom = useCallback(async ({ roomCode, nickname }) => {
    setErrorMsg('');
    try {
      const res = await joinRoomInFirebase({ roomCode, nickname });
      if (res.ok) {
        setActiveRoomCode(res.roomCode);
      } else {
        setErrorMsg(res.message || '방 입장에 실패했습니다.');
      }
    } catch (err) {
      setErrorMsg('방 입장 중 오류가 발생했습니다.');
    }
  }, []);

  const handleAddBot = useCallback(() => {
    if (!activeRoomCode) return;
    addBotInFirebase(activeRoomCode);
  }, [activeRoomCode]);

  const handleKickPlayer = useCallback(
    (targetPlayerId) => {
      if (!activeRoomCode) return;
      leaveOrKickPlayerInFirebase(activeRoomCode, targetPlayerId);
    },
    [activeRoomCode]
  );

  const handleToggleReady = useCallback(() => {
    if (!activeRoomCode) return;
    toggleReadyInFirebase(activeRoomCode);
  }, [activeRoomCode]);

  const handleUpdateOptions = useCallback(
    (options) => {
      if (!activeRoomCode) return;
      updateOptionsInFirebase(activeRoomCode, options);
    },
    [activeRoomCode]
  );

  const handleStartGame = useCallback(async () => {
    if (!activeRoomCode) return;
    const res = await startGameInFirebase(activeRoomCode);
    if (res && !res.ok) {
      setErrorMsg(res.message || '게임을 시작할 수 없습니다.');
    }
  }, [activeRoomCode]);

  const handleDrawCard = useCallback(() => {
    if (!activeRoomCode) return;
    drawCardInFirebase(activeRoomCode);
  }, [activeRoomCode]);

  const handleSubmitAnswer = useCallback(
    ({ word, targetPlayerId }) => {
      if (!activeRoomCode) return;
      submitAnswerInFirebase(activeRoomCode, { word, targetPlayerId });
    },
    [activeRoomCode]
  );

  const handleCastVote = useCallback(
    (choice) => {
      if (!activeRoomCode) return;
      castVoteInFirebase(activeRoomCode, choice);
    },
    [activeRoomCode]
  );

  const handlePlayAgain = useCallback(() => {
    if (!activeRoomCode) return;
    backToWaitingInFirebase(activeRoomCode);
  }, [activeRoomCode]);

  const handleLeaveRoom = useCallback(async () => {
    const codeToLeave = activeRoomCode;
    setActiveRoomCode(null);
    window.history.replaceState({}, '', '/');
    if (codeToLeave) {
      await leaveOrKickPlayerInFirebase(codeToLeave, myId);
    }
  }, [activeRoomCode, myId]);

  return (
    <div className="app-wrapper">
      {!room ? (
        <LobbyView
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          errorMsg={errorMsg}
        />
      ) : room.status === 'waiting' ? (
        <WaitingRoom
          room={room}
          myId={myId}
          onStartGame={handleStartGame}
          onAddBot={handleAddBot}
          onKickPlayer={handleKickPlayer}
          onToggleReady={handleToggleReady}
          onUpdateOptions={handleUpdateOptions}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <GameTableView
          room={room}
          myId={myId}
          onDrawCard={handleDrawCard}
          onSubmitAnswer={handleSubmitAnswer}
          onCastVote={handleCastVote}
          onPlayAgain={handlePlayAgain}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
