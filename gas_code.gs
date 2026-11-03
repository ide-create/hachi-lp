/**
 * Hachi Life 資料請求フォーム 受信スクリプト
 * 機能: ①スプレッドシート「Hachi Life リード台帳」に自動記録
 *       ②お客様へ自動返信メール ③井手さんへ通知メール
 */

const NOTIFY_TO = 'ide@sanesu-s.co.jp'; // 通知先（必要なら変更）

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = e.parameter || {};
    const ss = getLedger_();
    const sh = ss.getSheets()[0];
    const now = new Date();
    sh.appendRow([
      now,
      p.name || '', p.email || '', p.tel || '',
      p.area || '', p.plan || '', p.wish || '', p.source || '',
      '未対応'
    ]);

    // お客様へ自動返信
    if (p.email) {
      MailApp.sendEmail({
        to: p.email,
        subject: '【Hachi Life】資料のご請求ありがとうございます',
        body:
p.name + ' 様\n\n' +
'このたびは Hachi Life（ハチライフ）の資料をご請求いただき、\nありがとうございます。\n\n' +
'1営業日以内に、担当者より資料をお送りいたします。\n' +
'ご不明な点はこのメールへの返信、または下記までお気軽にどうぞ。\n\n' +
'──────────────────\n' +
'Hachi Life（ハチライフ）\n' +
'運営：サンエスサービス株式会社\n' +
'TEL：0565-42-5002（平日 9:00–18:00）\n' +
'https://hachi-lp-eta.vercel.app\n' +
'──────────────────\n'
      });
    }

    // 井手さんへ通知
    MailApp.sendEmail({
      to: NOTIFY_TO,
      subject: '【LP資料請求】' + (p.name || '名前なし') + ' 様（' + (p.wish || '-') + '）',
      body:
'LPから新しい資料請求が届きました。\n\n' +
'お名前: ' + (p.name || '') + '\n' +
'メール: ' + (p.email || '') + '\n' +
'電話: ' + (p.tel || '') + '\n' +
'エリア: ' + (p.area || '') + '\n' +
'興味のあるプラン: ' + (p.plan || '') + '\n' +
'ご希望: ' + (p.wish || '') + '\n' +
'きっかけ: ' + (p.source || '') + '\n\n' +
'リード台帳: ' + ss.getUrl()
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/** リード台帳スプレッドシートを取得（なければ自動作成） */
function getLedger_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('LEDGER_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) {}
  }
  const ss = SpreadsheetApp.create('Hachi Life リード台帳');
  const sh = ss.getSheets()[0];
  sh.setName('リード');
  sh.appendRow(['受信日時', 'お名前', 'メール', '電話', 'エリア', '興味のあるプラン', 'ご希望', 'きっかけ', '対応状況']);
  sh.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#201a10').setFontColor('#ffc93d');
  sh.setFrozenRows(1);
  props.setProperty('LEDGER_ID', ss.getId());
  return ss;
}

/** 動作テスト用（エディタから実行して権限を承認する用） */
function testSetup() {
  const ss = getLedger_();
  Logger.log('リード台帳URL: ' + ss.getUrl());
}
