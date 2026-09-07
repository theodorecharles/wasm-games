// Isolated diagnostic page only. Never included by stage-site.sh.
(() => {
  const channel = new BroadcastChannel('q4-pass-diagnostic');
  const panel = document.createElement('section');
  panel.setAttribute('aria-label','Quake 4 diagnostic controls');
  Object.assign(panel.style,{position:'fixed',top:'8px',right:'8px',zIndex:'2147483647',
    background:'#171717',color:'white',padding:'8px',font:'12px sans-serif',maxWidth:'390px'});
  const status = document.createElement('div'); status.textContent='Test-only render pass controls: normal';
  panel.append(status);
  const modes = {normal:'Restore normal tests',depth:'Bypass depth test',stencil:'Bypass stencil test',
    cull:'Bypass face culling',scissor:'Bypass scissor test',all:'Bypass all four tests'};
  for (const [mode,label] of Object.entries(modes)) {
    const button = document.createElement('button'); button.textContent=label;
    button.style.margin='2px';
    button.addEventListener('click',() => {
      channel.postMessage({type:'set-mode',mode});
      status.textContent='Requested diagnostic: '+mode;
    });
    panel.append(button);
  }
  channel.addEventListener('message',event => {
    if (event.data?.type !== 'mode-confirmed') return;
    document.documentElement.dataset.q4PassMode=event.data.mode;
    status.textContent='Confirmed diagnostic: '+event.data.mode;
  });
  document.body.append(panel);
})();
