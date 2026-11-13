/**
 * Hachi Life Portal — 通知サーバー（プッシュ通知＋メール通知）
 *
 * 設定方法
 * 1. スクリプト プロパティに SA_JSON を追加し、Firebaseのサービスアカウント秘密鍵（JSONファイルの中身ぜんぶ）を貼る
 * 2. testSetup を実行して「OK」と表示されるか確認
 * 3. デプロイ > 新しいデプロイ > ウェブアプリ（実行ユーザー：自分／アクセス：全員）
 * 4. 発行されたURLを portal/config.js の NOTIFY_URL に入れる
 *
 * アプリからは {idToken, type, id} だけを受け取り、本文はFirestoreの実データから作る（なりすまし防止）
 */
const PROJECT = 'hachi-portal';
const API_KEY = 'AIzaSyA8SU4Fe6RsOFUjLSzeerkuuqqOxbBTE3s';
const BASE = 'https://hachi-lp-eta.vercel.app/portal/';
const ICON = BASE + 'icons/icon-192.png';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const MAIL_INTERVAL_SEC = 600; // チャットのメールは同じ相手に10分に1通まで（プッシュは毎回）

function doPost(e) {
  try { handle_(JSON.parse(e.postData.contents)); } catch (err) { console.error(err && err.stack || err); }
  return ContentService.createTextOutput('ok');
}
function doGet() { return ContentService.createTextOutput('Hachi Life notify: ok'); }

function handle_(b) {
  const caller = verify_(b.idToken);
  if (!caller || !b.type || !b.id) return;
  const cache = CacheService.getScriptCache();
  const callerDoc = getDoc_('staff/' + caller);
  const isAdmin = !!callerDoc && callerDoc.role === 'admin';
  let out = [], key = b.type + '|' + b.id;

  if (b.type === 'message') {
    const m = getDoc_('messages/' + b.id); if (!m) return;
    if (m.from === 'hq') {
      if (!isAdmin) return;
      const kind = getDoc_('clients/' + m.uid) ? 'client' : 'staff';
      out.push(kind === 'staff'
        ? {uid: m.uid, kind, title: 'Hachi Life Office', body: m.textTr || m.text, chat: true}
        : {uid: m.uid, kind, title: 'ハチライフ事務局からメッセージ', body: m.text, chat: true});
    } else {
      if (m.uid !== caller) return;
      const who = (m.fromName || (m.from === 'client' ? 'お客様' : 'スタッフ'));
      admins_(caller).forEach(uid => out.push({uid, kind: 'admin', title: who + ' さんからメッセージ', body: m.text + (m.textTr ? '\n（訳）' + m.textTr : ''), chat: true}));
    }
  } else if (b.type === 'notice') {
    if (!isAdmin) return;
    const n = getDoc_('notices/' + b.id); if (!n) return;
    listDocs_('staff').forEach(s => { if (s.role !== 'admin' && s.active !== false) out.push({uid: s._id, kind: 'staff', title: 'Hachi Life: New notice', body: n.textTr || n.text}); });
  } else if (b.type === 'report') {
    const r = getDoc_('reports/' + b.id); if (!r || r.uid !== caller) return;
    if (r.clientUid) out.push({uid: r.clientUid, kind: 'client', title: '本日の作業報告が届きました', body: (r.name || '担当スタッフ') + ' が本日の作業を完了しました。アプリで内容をご確認いただけます。'});
    admins_(caller).forEach(uid => out.push({uid, kind: 'admin', title: '作業報告：' + (r.name || ''), body: (r.client ? r.client + ' 様／' : '') + r.day + ' の報告が提出されました。', noMail: true}));
  } else if (b.type === 'visit') {
    if (!isAdmin) return;
    const v = getDoc_('visits/' + b.id); if (!v) return;
    const when = v.day + ' ' + (v.time || '');
    out.push({uid: v.uid, kind: 'staff', title: 'New visit scheduled', body: when + (v.note ? '\n' + v.note : '')});
    if (v.clientUid) out.push({uid: v.clientUid, kind: 'client', title: 'ご訪問予定のお知らせ', body: when + ' に ' + (v.name || '担当スタッフ') + ' がお伺いします。'});
  } else if (b.type === 'leave') {
    const l = getDoc_('leaves/' + b.id); if (!l) return;
    key += '|' + l.status;
    const span = l.from + (l.to && l.to !== l.from ? ' – ' + l.to : '');
    if (l.status === 'pending') {
      if (l.uid !== caller) return;
      admins_(caller).forEach(uid => out.push({uid, kind: 'admin', title: '休み申請：' + (l.name || ''), body: span + (l.reason ? '\n' + l.reason : '')}));
    } else {
      if (!isAdmin) return;
      out.push({uid: l.uid, kind: 'staff', title: 'Leave request ' + (l.status === 'approved' ? 'approved' : 'declined'), body: span});
    }
  } else return;

  if (!out.length) return;
  if (cache.get(key)) return;           // 同じ通知の二重送信を防ぐ
  cache.put(key, '1', 21600);

  const emails = emails_(out.filter(o => !o.noMail).map(o => o.uid));
  out.forEach(o => {
    const link = BASE + (o.kind === 'admin' ? 'admin.html' : o.kind === 'client' ? 'client.html' : 'staff.html');
    try { push_(o.uid, o.title, o.body, link); } catch (err) { console.error('push', err); }
    try {
      const to = emails[o.uid];
      if (!to || o.noMail) return;
      if (o.chat) { const mk = 'mail|' + o.uid; if (cache.get(mk)) return; cache.put(mk, '1', MAIL_INTERVAL_SEC); }
      const en = o.kind === 'staff';
      MailApp.sendEmail(to, (en ? '[Hachi Life] ' : '【ハチライフ】') + o.title,
        o.body + '\n\n' + (en ? 'Open the app: ' : 'アプリで確認する：') + link + '\n\n' +
        (en ? 'This is an automatic message from Hachi Life.' : '※このメールはハチライフのアプリから自動でお送りしています。'),
        {name: 'Hachi Life'});
    } catch (err) { console.error('mail', err); }
  });
}

/* ---------- プッシュ送信 ---------- */
function push_(uid, title, body, link) {
  const d = getDoc_('pushTokens/' + uid);
  const tokens = (d && d.tokens) || [];
  const dead = [];
  tokens.forEach(t => {
    const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + saToken_()},
      payload: JSON.stringify({message: {token: t, webpush: {
        notification: {title: title, body: String(body).slice(0, 300), icon: ICON, badge: ICON},
        fcm_options: {link: link}
      }}})
    });
    const c = r.getResponseCode();
    if (c === 404 || (c === 400 && /UNREGISTERED|not a valid FCM/i.test(r.getContentText()))) dead.push(t);
    else if (c >= 300) console.error('fcm', c, r.getContentText());
  });
  if (dead.length) {  // 使えなくなった端末を掃除
    const keep = tokens.filter(t => dead.indexOf(t) < 0);
    UrlFetchApp.fetch(FS + '/pushTokens/' + uid + '?updateMask.fieldPaths=tokens', {
      method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + saToken_()},
      payload: JSON.stringify({fields: {tokens: {arrayValue: {values: keep.map(t => ({stringValue: t}))}}}})
    });
  }
}

/* ---------- 認証まわり ---------- */
function verify_(idToken) {  // アプリのログイン本人確認
  if (!idToken) return null;
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({idToken: idToken})});
  if (r.getResponseCode() !== 200) return null;
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  return u ? u.localId : null;
}
function saToken_() {
  const cache = CacheService.getScriptCache();
  let t = cache.get('sat'); if (t) return t;
  const raw = PropertiesService.getScriptProperties().getProperty('SA_JSON');
  if (!raw) throw new Error('スクリプト プロパティ SA_JSON が未設定です');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const enc = o => Utilities.base64EncodeWebSafe(JSON.stringify(o), Utilities.Charset.UTF_8).replace(/=+$/, '');
  const input = enc({alg: 'RS256', typ: 'JWT'}) + '.' + enc({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/identitytoolkit'});
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(input, sa.private_key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {method: 'post',
    payload: {grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: input + '.' + sig}});
  t = JSON.parse(r.getContentText()).access_token;
  cache.put('sat', t, 3000);
  return t;
}
function emails_(uids) {
  const out = {}; uids = uids.filter((u, i) => u && uids.indexOf(u) === i);
  if (!uids.length) return out;
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + saToken_()}, payload: JSON.stringify({localId: uids})});
  if (r.getResponseCode() !== 200) { console.error('lookup', r.getContentText()); return out; }
  (JSON.parse(r.getContentText()).users || []).forEach(u => { if (u.email) out[u.localId] = u.email; });
  return out;
}

/* ---------- Firestore 読み取り ---------- */
function val_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val_);
  if ('mapValue' in v) return obj_(v.mapValue.fields || {});
  return null;
}
function obj_(f) { const o = {}; Object.keys(f).forEach(k => o[k] = val_(f[k])); return o; }
function getDoc_(path) {
  const r = UrlFetchApp.fetch(FS + '/' + path, {muteHttpExceptions: true, headers: {Authorization: 'Bearer ' + saToken_()}});
  if (r.getResponseCode() !== 200) return null;
  const d = JSON.parse(r.getContentText()); const o = obj_(d.fields || {}); o._id = d.name.split('/').pop(); return o;
}
function listDocs_(col) {
  const r = UrlFetchApp.fetch(FS + '/' + col + '?pageSize=300', {muteHttpExceptions: true, headers: {Authorization: 'Bearer ' + saToken_()}});
  if (r.getResponseCode() !== 200) return [];
  return (JSON.parse(r.getContentText()).documents || []).map(d => { const o = obj_(d.fields || {}); o._id = d.name.split('/').pop(); return o; });
}
function admins_(except) {
  return listDocs_('staff').filter(s => s.role === 'admin' && s._id !== except).map(s => s._id);
}

/* ---------- 動作確認（エディタで実行） ---------- */
function testSetup() {
  saToken_();
  const staff = listDocs_('staff');
  const adminIds = staff.filter(s => s.role === 'admin').map(s => s._id);
  const mails = emails_(adminIds);
  const me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(me, '【ハチライフ】通知のテスト', '通知サーバーの設定が完了しました。\nスタッフ登録：' + staff.length + '名／管理者：' + adminIds.length + '名', {name: 'Hachi Life'});
  console.log('OK スタッフ' + staff.length + '名・管理者' + adminIds.length + '名（' + Object.values(mails).join(', ') + '）。テストメールを ' + me + ' に送りました。');
}
