/* PHANTASM'27 — STANDARD EVENT FEE DISPLAY v6
   Gender is participant information only. Male and female registrations use
   the same canonical standard event fee. This script only repairs stale
   presentation labels; payment totals remain governed by /api/pricing.js.
*/
(function(){
  const isRegister=()=>/\/register\/?$/i.test(location.pathname);
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
  const amount=v=>{const m=String(v||'').match(/(?:₹|rs\.?|inr\s*)\s*([0-9][0-9,]*(?:\.\d+)?)/i);return m?m[1].replace(/,/g,''):null};
  const FEES=[
    ['advanced cnc machining and precision manufacturing',200],['advanced cnc machining',200],['precision manufacturing',200],
    ['paper presentation',200],['ansys simulation challenge',200],['ansys simulation',200],['cad modeling',200],['cad modelling',200],
    ['glider competition',200],['glider',200],['line follower robot',300],['line follower',300],['technical quiz',100],
    ['water rocketry',200],['water rocket',200],['free fire',100],['freefire',100],['ipl auction',100],['college ipl auction',100],
    ['carrom',100],['chess',50],['bachelor samayal',100]
  ];
  const feeFor=name=>{const n=norm(name);const hit=FEES.find(([k])=>n===k||n.includes(k)||k.includes(n));return hit?hit[1]:null};
  const titleFor=card=>{for(const n of card.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,[class*="title" i],[class*="name" i]')){const t=n.textContent.trim();if(feeFor(t)!=null)return t}return ''};
  function repairOrphanFees(root){
    for(const el of root.querySelectorAll('*')){
      if(!el.isConnected||el.children.length||el.tagName==='SCRIPT'||el.tagName==='STYLE')continue;
      const t=el.textContent.replace(/\s+/g,' ').trim();
      if(!/^fee\s*:\s*₹?\s*100$/i.test(t))continue;
      const parent=el.parentElement;
      const parentText=norm(parent?.textContent||'');
      if(!titleFor(parent) && !/advanced cnc|paper presentation|ansys|cad modeling|glider|line follower|technical quiz|water rocketry|free fire|carrom|chess|ipl auction|bachelor samayal/.test(parentText)){
        (parent?.children?.length===1?parent:el).remove();
      }
    }
  }
  function cleanCard(card){
    const title=titleFor(card), fee=feeFor(title); if(fee==null)return;
    for(const n of card.querySelectorAll('*')){
      if(n.children.length)continue;
      const t=n.textContent.replace(/\s+/g,' ').trim();if(!t)continue;
      if(/^free$/i.test(t)||/^(?:₹|rs\.?|inr)\s*0(?:\.00)?$/i.test(t)){n.textContent=`₹${fee}`;continue}
      if(/^fee\s*:/i.test(t)&&/\bfree\b/i.test(t)){const a=amount(t);n.textContent=a?`Fee: ₹${a}`:`Fee: ₹${fee}`;continue}
      if(/^fee\s*:\s*₹?\s*$/i.test(t)||/^₹\s*$/.test(t))n.remove();
    }
  }
  function fix(root){
    if(!root||!isRegister())return;
    repairOrphanFees(root);
    root.querySelectorAll('article,li,section,[class*="event-card" i],[class*="eventCard" i],[class*="event-item" i],[class*="workshop" i]').forEach(cleanCard);
    repairOrphanFees(root);
  }
  function start(){
    if(!isRegister())return;const root=document.getElementById('root');if(!root)return;
    fix(root);[300,800,1600,3000].forEach(t=>setTimeout(()=>fix(root),t));
    if(root.dataset.standardFeeObserver)return;root.dataset.standardFeeObserver='true';let timer;
    new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>fix(root),80)}).observe(root,{childList:true,subtree:true});
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
