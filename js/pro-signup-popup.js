/**
 * Pro Signup Popup - Minimal Design
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg_pro_popup';
  const DELAY = 8000;
  const COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days

  function shouldShow() {
    if (window.location.pathname.includes('/account')) return false;
    const last = localStorage.getItem(STORAGE_KEY);
    return !last || (Date.now() - parseInt(last, 10)) > COOLDOWN;
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    const el = document.getElementById('sgProPopup');
    if (el) {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }
  }

  function create() {
    const el = document.createElement('div');
    el.id = 'sgProPopup';
    // Repurposed 2026-05-01: was driving signups for the in-house "design
    // pro" account which nobody used. Now promotes ASPN (Arizona Stone
    // Providers Network). Visual rebuild 2026-05-02 — cleaner hierarchy,
    // scannable benefits, stronger CTA. Was a wall of text; now a card
    // that reads in 2 seconds.
    el.innerHTML = `
      <div class="sg-popup-card">
        <button class="sg-popup-x" aria-label="Close">&times;</button>
        <div class="sg-popup-logo">ASPN</div>
        <div class="sg-popup-eyebrow">Arizona Stone Providers Network</div>
        <h2>Get found by Arizona homeowners.</h2>
        <p class="sg-popup-sub">Public directory for fabricators, designers, installers, and suppliers. Free founding seat for the first 50 — no credit card.</p>
        <ul class="sg-popup-bullets">
          <li><span class="sg-popup-check">✓</span> Public profile + leads</li>
          <li><span class="sg-popup-check">✓</span> 60-second signup, 3 fields</li>
          <li><span class="sg-popup-check">✓</span> Free for the first 50 members</li>
        </ul>
        <a href="/aspn/join/" class="sg-popup-btn">Claim a Founding Seat →</a>
        <button class="sg-popup-skip">Maybe later</button>
      </div>
    `;

    // Styles
    const css = document.createElement('style');
    css.textContent = `
      #sgProPopup {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.3s;
      }
      #sgProPopup.show { opacity: 1; }
      .sg-popup-card {
        background: #fff;
        border-radius: 16px;
        padding: 32px;
        max-width: 340px;
        width: 100%;
        text-align: center;
        position: relative;
        transform: translateY(20px);
        transition: transform 0.3s;
        box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      }
      #sgProPopup.show .sg-popup-card { transform: translateY(0); }
      .sg-popup-x {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 36px;
        height: 36px;
        background: #f0f0f0;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .sg-popup-x:hover { background: #e0e0e0; border-color: #d0d0d0; }
      .sg-popup-card { padding: 36px 32px 28px; max-width: 380px; text-align: left; }
      .sg-popup-logo {
        display: inline-block;
        background: #d97706;
        color: #fff;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: .04em;
      }
      .sg-popup-eyebrow {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .12em;
        color: #999;
        font-weight: 700;
        margin: 14px 0 10px;
      }
      .sg-popup-card h2 {
        font-size: 26px;
        font-weight: 800;
        color: #1a2b3c;
        margin: 0 0 12px;
        line-height: 1.2;
        letter-spacing: -.01em;
      }
      .sg-popup-sub {
        font-size: 14px;
        color: #555;
        margin: 0 0 20px;
        line-height: 1.55;
      }
      .sg-popup-bullets {
        list-style: none;
        margin: 0 0 24px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .sg-popup-bullets li {
        font-size: 14px;
        color: #1a2b3c;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sg-popup-check {
        flex: 0 0 22px;
        width: 22px;
        height: 22px;
        background: #fef3c7;
        color: #d97706;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 12px;
      }
      .sg-popup-btn {
        display: block;
        background: #d97706;
        color: #fff;
        padding: 14px 24px;
        border-radius: 10px;
        text-decoration: none;
        font-weight: 700;
        font-size: 15px;
        margin-bottom: 8px;
        text-align: center;
        transition: all 0.2s;
        box-shadow: 0 4px 14px rgba(217,119,6,0.3);
      }
      .sg-popup-btn:hover { background: #b45309; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(217,119,6,0.4); }
      .sg-popup-skip {
        display: block;
        width: 100%;
        background: none;
        border: none;
        color: #999;
        font-size: 13px;
        cursor: pointer;
        padding: 8px;
        margin: 0 auto;
        text-align: center;
      }
      .sg-popup-skip:hover { color: #555; }
    `;
    document.head.appendChild(css);
    document.body.appendChild(el);

    // Events
    el.querySelector('.sg-popup-x').onclick = dismiss;
    el.querySelector('.sg-popup-skip').onclick = dismiss;
    el.onclick = e => { if (e.target === el) dismiss(); };

    setTimeout(() => el.classList.add('show'), 10);
  }

  if (shouldShow()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(create, DELAY));
    } else {
      setTimeout(create, DELAY);
    }
  }
})();
