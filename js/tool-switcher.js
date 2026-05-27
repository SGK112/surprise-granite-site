// Floating cross-link between the three SG pro tools (3D Room Visualizer,
// Blueprint Takeoff, E-Sign Documents). Each tool's <head> loads this script
// with a data-current="..." attribute identifying which tool the user is on;
// the script injects a small pill bar with the current tool highlighted and
// the others as one-click jumps. Fixed top-right, low z-index, dark glass
// styling so it sits cleanly on top of any tool's own theme.
(() => {
  const TOOLS = [
    { id: 'visualizer', short: '3D Visualizer',   href: '/tools/room-designer/' },
    { id: 'takeoff',    short: 'Blueprint Takeoff', href: '/tools/blueprint-takeoff/' },
    { id: 'invoicing',  short: 'Invoicing',         href: '/tools/invoicing/' },
    { id: 'esign',      short: 'E-Sign',           href: '/tools/e-sign/' },
  ];
  const current = (document.currentScript && document.currentScript.dataset.current) || '';

  function mount() {
    if (document.getElementById('sg-tool-switcher')) return;
    const wrap = document.createElement('div');
    wrap.id = 'sg-tool-switcher';
    wrap.setAttribute('aria-label', 'SG Pro tools');
    // Bottom-CENTER: centered horizontally so it doesn't sit on top of
    // the room-designer's right-side panel (Default Room selector, Price
    // List, Margins) or any other tool's right-edge controls.
    wrap.style.cssText = [
      'position:fixed','bottom:14px','left:50%','transform:translateX(-50%)','z-index:90',
      'display:flex','gap:4px','align-items:center',
      'background:rgba(15,15,26,.82)','backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'border:1px solid rgba(255,255,255,.12)','border-radius:999px',
      'padding:4px','font-family:Inter,-apple-system,system-ui,sans-serif',
      'font-size:11px','line-height:1','color:#f4f4f7',
      'box-shadow:0 4px 14px rgba(0,0,0,.25)',
    ].join(';');
    wrap.innerHTML = TOOLS.map(t => {
      const active = t.id === current;
      const style = active
        ? 'background:#f9cb00;color:#0b0b14;font-weight:700;cursor:default'
        : 'color:rgba(255,255,255,.78);font-weight:500';
      const aria = active ? ' aria-current="page"' : '';
      return `<a href="${t.href}"${aria} style="display:inline-flex;align-items:center;padding:6px 11px;border-radius:999px;text-decoration:none;transition:all .15s;${style}"
                onmouseover="if(!this.getAttribute('aria-current'))this.style.color='#fff'"
                onmouseout="if(!this.getAttribute('aria-current'))this.style.color='rgba(255,255,255,.78)'">${t.short}</a>`;
    }).join('');
    document.body.appendChild(wrap);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
