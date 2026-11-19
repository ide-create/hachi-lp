// Hachi Life — 広告の流入元を記録する（資料請求の「きっかけ」に自動で添える）
(function(){
  var KEY='hl_attr', DAYS=30;
  function read(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&Date.now()-v.t<DAYS*864e5)return v}catch(e){}return null}
  try{
    var q=new URLSearchParams(location.search), a={};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){var v=q.get(k);if(v)a[k]=v.slice(0,80)});
    if(q.get('gclid')||q.get('gbraid')||q.get('wbraid')){a.utm_source=a.utm_source||'google';a.utm_medium=a.utm_medium||'cpc';a.click='gclid'}
    if(q.get('fbclid')){a.utm_source=a.utm_source||'instagram';a.click=a.click||'fbclid'}
    if(Object.keys(a).length){a.t=Date.now();a.lp=location.pathname;localStorage.setItem(KEY,JSON.stringify(a))}
    else if(!read()&&document.referrer&&document.referrer.indexOf(location.host)<0){
      localStorage.setItem(KEY,JSON.stringify({t:Date.now(),ref:document.referrer.split('/')[2]||'',lp:location.pathname}))}
  }catch(e){}
  // 例：「google / cpc / nagoya-kaseifu」。広告以外は参照元サイト名
  window.hlAttr=function(){var v=read();if(!v)return'';
    if(v.utm_source)return[v.utm_source,v.utm_medium||'',v.utm_campaign||'',v.utm_term||''].filter(Boolean).join(' / ');
    return v.ref?('参照元 '+v.ref):''};
  // 電話タップも計測（GTM用のイベント）
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('a[href^="tel:"]');
    if(t){window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:'tel_click',lead_source:window.hlAttr()})}});
})();
