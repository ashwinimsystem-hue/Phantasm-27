/* PHANTASM'27 — REGISTRATION PAGE V3 */
(function(){
  const ready=()=>{
    if(!/\/register\/?$/i.test(location.pathname)) return;
    const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/registration-page-v3.css';css.dataset.registrationV3='true';document.head.appendChild(css);
    const root=document.querySelector('#root'); if(!root||root.dataset.registrationV3) return; root.dataset.registrationV3='true';
    const apply=()=>{
      const form=root.querySelector('.Formcontainer form,form'); if(!form) return;
      const box=form.closest('.Formcontainer')||root.querySelector('.Formcontainer'); if(box) box.classList.add('register-page-shell');
      form.querySelectorAll('*').forEach(el=>{const t=(el.textContent||'').trim().toLowerCase();if(t==='male fee'||t==='female fee'||t==='male price'||t==='female price')el.remove();});
      form.querySelectorAll('input,select,textarea').forEach(i=>{if(!i.id&&i.name)i.id='registration-'+i.name.replace(/[^a-z0-9]+/gi,'-');});
    };
    apply(); new MutationObserver(apply).observe(root,{childList:true,subtree:true});
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ready,{once:true}):ready();
})();
