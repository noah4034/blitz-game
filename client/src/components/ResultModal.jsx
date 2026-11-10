import React from 'react';

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4위', '5위', '6위'];

export default function ResultModal({ players, myId, onPlayAgain, onLeaveRoom }) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="result-overlay">
      <div className="result-card">
        <div style={{ fontSize: '54px', marginBottom: '8px' }}>🏆</div>
        <h2 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '6px' }}>
          게임 종료!
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '26px' }}>
          모든 카드가 소진되었습니다.
        </p>

        <div style={{ marginBottom: '24px' }}>
          {sortedPlayers.map((p, idx) => (
            <div
              key={p.id}
              className={`rank-item ${idx === 0 ? 'first' : ''}`}
            >
              <span style={{ fontWeight: 800, fontSize: '16px' }}>
                {RANK_MEDALS[idx] || `${idx + 1}위`} {p.nickname}{' '}
                {p.id === myId ? '(나)' : ''}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  color: idx === 0 ? '#38bdf8' : '#94a3b8'
                }}
              >
                {p.score}장 획득
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLeaveRoom}
          >
            로비로 나가기
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPlayAgain}
          >
            한 판 더 하기
          </button>
        </div>
      </div>
    </div>
  );
}
