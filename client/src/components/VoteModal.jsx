import React, { useState, useEffect } from 'react';

export default function VoteModal({ voteState, badgeState, myId, onCastVote }) {
  const [myChoice, setMyChoice] = useState(null); // 'yes' | 'no' | null

  // 새로운 투표가 열릴 때마다 내 선택 상태 초기화
  useEffect(() => {
    if (!voteState) {
      setMyChoice(null);
    }
  }, [voteState?.word, voteState?.submitterId]);

  const handleSelect = (choice) => {
    if (myChoice) return;
    setMyChoice(choice);
    onCastVote(choice);
  };

  return (
    <>
      {/* 1. 5초 실시간 투표 모달 */}
      {voteState && (
        <div className="vote-modal-overlay">
          <div className="vote-modal">
            <div className="vote-header">
              <span className="vote-progress-badge">
                {voteState.remainingCount > 0
                  ? `투표 현황: ${voteState.votedCount} / ${voteState.totalVoters}명 (${voteState.remainingCount}명 남음)`
                  : `투표 현황: ${voteState.votedCount} / ${voteState.totalVoters}명 (전원 완료!)`}
              </span>
              <span className="vote-timer-pill">
                ⏱ <span>{voteState.secondsLeft}</span>초
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  background: 'rgba(245, 159, 0, 0.16)',
                  border: '1.5px solid #F59F00',
                  color: '#F59F00',
                  padding: '6px 16px',
                  borderRadius: '999px',
                  fontSize: '16px',
                  fontWeight: 800
                }}
              >
                주제어: {voteState.category}
              </div>
              <div className="vote-word-display">{voteState.word}</div>
              <div className="vote-subtext">
                {voteState.submitterNickname}님이 제출한 단어입니다
              </div>
            </div>

            {myId === voteState.submitterId ? (
              /* 답을 입력한 본인은 투표 불가 */
              <div className="vote-submitter-notice">
                <span style={{ fontSize: '26px' }}>⏳</span>
                <span>내가 제출한 단어입니다</span>
                <span style={{ fontSize: '13px', color: '#38bdf8' }}>
                  다른 플레이어들의 투표를 기다리는 중...
                </span>
              </div>
            ) : (
              /* 다른 플레이어들: 정사각형 O / X 버튼 및 선택 시 가로 100% 확장 */
              <div className="vote-btn-grid">
                <button
                  type="button"
                  className={`btn-vote-choice btn-vote-yes ${
                    myChoice === 'yes'
                      ? 'expanded'
                      : myChoice === 'no'
                      ? 'fade-out'
                      : ''
                  }`}
                  onClick={() => handleSelect('yes')}
                >
                  O
                </button>
                <button
                  type="button"
                  className={`btn-vote-choice btn-vote-no ${
                    myChoice === 'no'
                      ? 'expanded'
                      : myChoice === 'yes'
                      ? 'fade-out'
                      : ''
                  }`}
                  onClick={() => handleSelect('no')}
                >
                  X
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. 1초간 뜨고 사라지는 인정 / 노인정 결과 모달 */}
      {badgeState && (
        <div
          className={`vote-result-badge-modal ${
            badgeState.approved ? 'badge-approved' : 'badge-rejected'
          }`}
        >
          <span>{badgeState.approved ? '✓' : '✕'}</span>
          <span>{badgeState.approved ? '인정' : '노인정'}</span>
        </div>
      )}
    </>
  );
}
