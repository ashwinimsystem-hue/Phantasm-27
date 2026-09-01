/* PHANTASM'27 — STANDARD EVENT FEE DISPLAY v5
   Registration display rule: gender is NEVER a pricing input.
   Every event shows its standard participant fee. Legacy FREE/zero labels are
   replaced with the event's standard fee. Empty/orphan fee rows are removed.
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
  const titleFor=card=>{
    const nodes=card.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,[class*="title" i],[class*="name" i]');
    for(const n of nodes){const t=n.textContent.trim();if(feeFor(t)!=null)return t}
    return '';
  };
  function cleanCard(card){
    const title=titleFor(card), fee=feeFor(title); if(fee==null)return;
    const leaves=[...card.querySelectorAll('*')].filter(n=>!n.children.length);
    for(const n of leaves){
      const t=n.textContent.replace(/\s+/g,' ').trim(); if(!t)continue;
      if(/^free$/i.test(t)||/^(?:₹|rs\.?|inr)\s*0(?:\.00)?$/i.test(t)){n.textContent=`₹${fee}`;continue}
      if(/^fee\s*:/i.test(t)&&/\bfree\b/i.test(t)){const a=amount(t);n.textContent=a?`Fee: ₹${a}`:`Fee: ₹${fee}`;continue}
      if(/^fee\s*:\s*₹?\s*$/i.test(t)||/^₹\s*$/i.test(t)||/^rs\.?\s*$/i.test(t))n.remove();
    }
    // Remove a stray fee-only sibling that contains no event name/content.
    [...card.children].forEach(child=>{
      const text=child.textContent.replace(/\s+/g,' ').trim();
      if(!text)return;
      if(/^(?:fee\s*:\s*)?(?:₹|rs\.?|inr)?\s*100\s*$/i.test(text)&&!titleFor(child))child.remove();
    });
  }
  function fix(root){
    if(!root||!isRegister())return;
    const candidates=root.querySelectorAll('article,li,section,[class*="event-card" i],[class*="eventCard" i],[class*="workshop" i],[class*="event-item" i]');
    candidates.forEach(cleanCard);
  }
  function start(){
    if(!isRegister())return; const root=document.getElementById('root');if(!root)return;
    fix(root);[300,800,1600,3000].forEach(t=>setTimeout(()=>fix(root),t));
    if(root.dataset.standardFeeObserver)return;root.dataset.standardFeeObserver='true';
    let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>fix(root),80)}).observe(root,{childList:true,subtree:true});
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
