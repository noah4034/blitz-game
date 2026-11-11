import React from 'react';

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4위', '5위', '6위'];

export default function ResultModal({ players, myId, onPlayAgain, onLeaveRoom }) {
  // 게임 도중 나간 사람(isLeft)은 무조건 맨 꼴찌에 배치하고, 나머지는 획득 카드 순으로 정렬
  const sortedPlayers = [...(players || [])].sort((a, b) => {
    if (a.isLeft && !b.isLeft) return 1;
    if (!a.isLeft && b.isLeft) return -1;
    return (b.score || 0) - (a.score || 0);
  });

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
          {sortedPlayers.map((p, idx) => {
            const isFirst = idx === 0 && !p.isLeft;
            return (
              <div
                key={p.id}
                className={`rank-item ${isFirst ? 'first' : ''}`}
                style={
                  p.isLeft
                    ? { opacity: 0.55, borderColor: '#1e293b' }
                    : undefined
                }
              >
                <span style={{ fontWeight: 800, fontSize: '16px' }}>
                  {p.isLeft ? '꼴찌' : RANK_MEDALS[idx] || `${idx + 1}위`}{' '}
                  <span
                    style={
                      p.isLeft
                        ? { textDecoration: 'line-through', color: '#64748b' }
                        : undefined
                    }
                  >
                    {p.nickname}
                  </span>{' '}
                  {p.id === myId ? '(나)' : ''}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    color: p.isLeft
                      ? '#64748b'
                      : isFirst
                      ? '#38bdf8'
                      : '#94a3b8'
                  }}
                >
                  {p.score || 0}장 획득
                </span>
              </div>
            );
          })}
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
