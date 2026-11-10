import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  projectId: 'blitz-game-3d167',
  databaseURL: 'https://blitz-game-3d167-default-rtdb.asia-southeast1.firebasedatabase.app/'
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 탭/기기별 고유 플레이어 ID 생성 및 유지
export function getMyPlayerId() {
  let id = sessionStorage.getItem('blitz_player_id');
  if (!id) {
    id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('blitz_player_id', id);
  }
  return id;
}
