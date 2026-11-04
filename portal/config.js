// ===== Hachi Life Portal — Firebase設定 =====
// Firebaseコンソール（プロジェクトの設定 > 全般 > マイアプリ > SDKの設定と構成）
// に表示される firebaseConfig をここに貼り付ける
const firebaseConfig = {
  apiKey: "AIzaSyA8SU4Fe6RsOFUjLSzeerkuuqqOxbBTE3s",
  authDomain: "hachi-portal.firebaseapp.com",
  projectId: "hachi-portal",
  storageBucket: "hachi-portal.firebasestorage.app",
  messagingSenderId: "950289266003",
  appId: "1:950289266003:web:844e30a7d7fccfb829dda6"
};
// ============================================

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const TS = firebase.firestore.FieldValue.serverTimestamp;

function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function weekDays() { // 今週（月曜はじまり）の日付文字列
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 月=0
  const mon = new Date(now); mon.setDate(now.getDate() - dow);
  const out = [];
  for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); out.push(todayStr(d)); }
  return out;
}
function hm(ts) {
  if (!ts || !ts.toDate) return '--:--';
  return ts.toDate().toTimeString().slice(0, 5);
}
function minToH(min) { return (min / 60).toFixed(1) + 'h'; }

// 打刻配列から 勤務分数・休憩分数・状態 を計算
function calcDay(punches) {
  let workedMs = 0, breakMs = 0, state = 'none';
  let inAt = null, bsAt = null, lastOut = null;
  const sorted = punches.slice().sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0));
  sorted.forEach(p => {
    const t = (p.at && p.at.toDate) ? p.at.toDate() : new Date(); // 送信直後はサーバ時刻未確定→現在時刻扱い
    if (p.type === 'in') { inAt = t; state = 'working'; }
    if (p.type === 'bs' && inAt) { bsAt = t; state = 'break'; }
    if (p.type === 'be' && bsAt) { breakMs += t - bsAt; bsAt = null; state = 'working'; }
    if (p.type === 'out' && inAt) {
      if (bsAt) { breakMs += t - bsAt; bsAt = null; }
      workedMs += (t - inAt) - 0; lastOut = t; inAt = null; state = 'done';
    }
  });
  if (inAt) { // 勤務中
    const now = new Date();
    if (bsAt) { breakMs += now - bsAt; }
    workedMs += now - inAt;
  }
  workedMs -= breakMs;
  if (workedMs < 0) workedMs = 0;
  return { workedMin: Math.round(workedMs / 60000), breakMin: Math.round(breakMs / 60000), state, firstIn: sorted.find(p => p.type === 'in'), lastOut };
}
