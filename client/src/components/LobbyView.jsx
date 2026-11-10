import React, { useState, useEffect } from 'react';

export default function LobbyView({ onCreateRoom, onJoinRoom, errorMsg }) {
  const [nickname, setNickname] = useState('');
  const [penaltySeconds, setPenaltySeconds] = useState(1);
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('room');
    if (codeParam) {
      setRoomCode(codeParam.toUpperCase());
    }
  }, []);

  const handleCreate = (e) => {
    e.preventDefault();
    onCreateRoom({ nickname: nickname.trim() || '플레이어1', penaltySeconds });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    onJoinRoom({
      roomCode: roomCode.trim().toUpperCase(),
      nickname: nickname.trim() || '플레이어'
    });
  };

  return (
    <div className="lobby-card">
      <h1 className="game-logo">⚡ BLITZ!</h1>
      <p className="game-desc">실시간 순발력 단어 연상 카드 게임</p>

      <div className="form-group">
        <label className="form-label">플레이어 닉네임</label>
        <input
          type="text"
          className="text-input"
          placeholder="닉네임을 입력하세요"
          maxLength={12}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">오답(노인정) 타이밍 페널티 설정</label>
        <div className="penalty-selector">
          {[0, 1, 2, 3].map((sec) => (
            <button
              key={sec}
              type="button"
              className={`penalty-option-btn ${penaltySeconds === sec ? 'active' : ''}`}
              onClick={() => setPenaltySeconds(sec)}
            >
              {sec === 0 ? '없음' : `${sec}초 잠금`}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={handleCreate}>
        방 만들기
      </button>

      <div className="divider">
        <span>또는 초대 코드로 입장</span>
      </div>

      <form onSubmit={handleJoin} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          className="text-input"
          placeholder="코드 6자리"
          maxLength={6}
          style={{ textTransform: 'uppercase' }}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />
        <button
          type="submit"
          className="btn btn-secondary"
          style={{ width: '110px', flexShrink: 0 }}
        >
          입장
        </button>
      </form>

      {errorMsg && <div className="error-msg">{errorMsg}</div>}
    </div>
  );
}
