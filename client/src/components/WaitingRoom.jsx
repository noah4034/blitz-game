import React, { useState } from 'react';

const AVATAR_ICONS = ['👑', '🐱', '🚀', '⚡', '🔥', '🍀'];

export default function WaitingRoom({
  room,
  myId,
  onStartGame,
  onAddBot,
  onToggleReady,
  onUpdateOptions
}) {
  const [copied, setCopied] = useState(false);

  const me = room.players.find((p) => p.id === myId);
  const isHost = !!me?.isHost;
  const allReady = room.players.every((p) => p.isHost || p.isBot || p.isReady);

  const handleCopyCode = () => {
    const inviteUrl = `${window.location.origin}/?room=${room.code}`;
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const emptySlotCount = Math.max(0, 4 - room.players.length);

  return (
    <div className="room-container">
      <div className="room-header">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>
            🎮 파티 대기실
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            친구들에게 초대코드를 공유하거나 빈 슬롯을 눌러 봇을 추가할 수 있습니다.
          </p>
        </div>

        <div className="room-code-tag" onClick={handleCopyCode}>
          {copied ? '✓ 초대링크 복사됨!' : `초대코드: ${room.code} 📋`}
        </div>
      </div>

      <div className="player-grid">
        {room.players.map((p, idx) => {
          const ready = p.isHost || p.isBot || p.isReady;
          return (
            <div
              key={p.id}
              className={`player-slot ${p.id === myId ? 'me' : ''}`}
              style={{
                borderColor: ready
                  ? p.id === myId
                    ? '#38bdf8'
                    : 'rgba(34, 197, 94, 0.45)'
                  : '#222C3C'
              }}
            >
              {p.isHost && <span className="host-badge">👑 방장</span>}
              <div className="avatar-circle">
                {AVATAR_ICONS[idx % AVATAR_ICONS.length]}
              </div>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>
                {p.nickname} {p.id === myId ? '(나)' : ''}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: ready ? '#22c55e' : '#94a3b8',
                  fontWeight: 700
                }}
              >
                {p.isHost ? '방장 (대기중)' : ready ? '✓ 준비완료' : '준비 대기중...'}
              </div>
            </div>
          );
        })}

        {Array.from({ length: emptySlotCount }).map((_, idx) => (
          <div
            key={`empty_${idx}`}
            className="player-slot empty"
            onClick={() => isHost && onAddBot()}
            title={isHost ? '클릭하여 연습용 봇 추가' : '플레이어 대기 중'}
          >
            <div style={{ fontSize: '24px' }}>+</div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>
              {isHost ? '클릭하여 봇 추가 / 대기중' : '친구 초대 대기중'}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: '#0D1117',
          padding: '18px 22px',
          borderRadius: '16px',
          border: '1px solid #243042',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
            오답 페널티:
          </span>
          {[0, 1, 2, 3].map((sec) => (
            <button
              key={sec}
              type="button"
              disabled={!isHost}
              onClick={() => onUpdateOptions({ penaltySeconds: sec })}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border:
                  room.options.penaltySeconds === sec
                    ? '1.5px solid #38bdf8'
                    : '1px solid #2B384E',
                background:
                  room.options.penaltySeconds === sec
                    ? 'rgba(56, 189, 248, 0.15)'
                    : '#161F2C',
                color: room.options.penaltySeconds === sec ? '#38bdf8' : '#94a3b8',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isHost ? 'pointer' : 'default'
              }}
            >
              {sec === 0 ? '없음' : `${sec}초`}
            </button>
          ))}
        </div>

        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: 'auto', padding: '12px 30px' }}
            disabled={room.players.length < 2 || !allReady}
            onClick={onStartGame}
          >
            {room.players.length < 2
              ? '최소 2명이 필요합니다'
              : !allReady
              ? '모든 플레이어의 준비를 기다리는 중...'
              : '게임 시작하기 ➔'}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            style={{
              width: 'auto',
              padding: '12px 30px',
              background: me?.isReady ? '#2B8A3E' : '#3b82f6',
              color: '#fff'
            }}
            onClick={onToggleReady}
          >
            {me?.isReady ? '✓ 준비 완료됨 (클릭하여 취소)' : '준비하기'}
          </button>
        )}
      </div>
    </div>
  );
}
