import React from 'react';

const COLOR_HEX_MAP = {
  yellow: '#F59F00',
  green: '#2B8A3E',
  purple: '#7950F2',
  pink: '#D6336C',
  blue: '#1C7ED6',
  orange: '#E8590C'
};

export default function BlitzCard({
  card,
  orientation = 'vertical', // 'vertical' | 'horizontal'
  isGlowing = false,
  emptyLabel = '카드 없음'
}) {
  const sizeClass = orientation === 'horizontal' ? 'card-horizontal' : 'card-vertical';
  const glowClass = isGlowing ? 'card-glow' : '';

  // 카드가 아직 없을 때 빈 슬롯 표시
  if (!card) {
    return (
      <div className={`blitz-card ${sizeClass} card-empty-slot`}>
        <span>{emptyLabel}</span>
      </div>
    );
  }

  // 2색 연결 와일드카드
  if (card.type === 'wild') {
    const c1 = COLOR_HEX_MAP[card.colors?.[0]] || '#7950F2';
    const c2 = COLOR_HEX_MAP[card.colors?.[1]] || '#F59F00';
    const s1 = card.symbols?.[0] || '⚡';
    const s2 = card.symbols?.[1] || '★';

    return (
      <div
        className={`blitz-card ${sizeClass} ${glowClass}`}
        style={{
          background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`,
          border: '3px solid #FFFFFF'
        }}
      >
        <span className="card-corner corner-tl">{s1}</span>
        <span className="card-corner corner-tr">{s1}</span>
        <span className="card-corner corner-bl">{s2}</span>
        <span className="card-corner corner-br">{s2}</span>
        <div className="wild-divider">↔ 연결</div>
      </div>
    );
  }

  // 일반 주제어 카드 (6가지 색상 + 4꼭짓점 문양 + 중앙 흰색 Pretendard Bold 텍스트)
  const colorClass = `card-${card.color || 'blue'}`;
  const symbol = card.symbol || '◆';

  return (
    <div className={`blitz-card ${sizeClass} ${colorClass} ${glowClass}`}>
      <span className="card-corner corner-tl">{symbol}</span>
      <span className="card-corner corner-tr">{symbol}</span>
      <span className="card-corner corner-bl">{symbol}</span>
      <span className="card-corner corner-br">{symbol}</span>
      <div className="card-title">{card.category}</div>
    </div>
  );
}
