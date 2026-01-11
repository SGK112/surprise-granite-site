/**
 * SURPRISE GRANITE - QUIZ POPUP
 * Auto-triggers on page load to personalize user experience
 * Stores dismissal in localStorage to not annoy returning visitors
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg_quiz_dismissed';
  const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Check if quiz was recently dismissed
  function wasRecentlyDismissed() {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) return false;

    const dismissedTime = parseInt(dismissed, 10);
    return (Date.now() - dismissedTime) < DISMISS_DURATION;
  }

  // Mark quiz as dismissed
  function dismissQuiz() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }

  // Create and show the popup
  function showQuizPopup() {
    // Don't show if already dismissed or on quiz page
    if (wasRecentlyDismissed()) return;
    if (window.location.pathname.includes('/quiz')) return;

    const popup = document.createElement('div');
    popup.id = 'sgQuizPopup';
    popup.innerHTML = `
      <div class="quiz-popup-overlay" onclick="window.closeQuizPopup()"></div>
      <div class="quiz-popup-modal">
        <button class="quiz-popup-close" onclick="window.closeQuizPopup()" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="quiz-popup-content">
          <div class="quiz-popup-header">
            <div class="quiz-popup-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Style Quiz</span>
            </div>
          </div>

          <div class="quiz-popup-visual">
            <svg class="quiz-popup-icon" viewBox="0 0 390 402" fill="#f9cb00">
              <g transform="translate(0.269 0.052)">
                <path d="M194.6,32.106l166.79,96.3V373.463H27.807V128.406l166.79-96.3M194.6,0,0,112.353V401.271H389.213V112.353L194.6,0Z"/>
                <path d="M257.77,133.82,87.52,34.06,61.3,51.7l168.663,98.173V374.579H257.77Z" transform="translate(48.039 26.692)"/>
                <path d="M212.1,353.7H184.292V177.137L13.15,78.323,41.207,60.7,212.1,161.085Z" transform="translate(10.305 47.568)"/>
                <path d="M129.182,173.571,12.53,106.22v32.106l88.862,51.3V318.03h27.789Z" transform="translate(9.819 83.241)"/>
              </g>
            </svg>
            <div class="quiz-popup-glow"></div>
          </div>

          <h2 class="quiz-popup-title">Welcome to Surprise Granite</h2>
          <p class="quiz-popup-subtitle">Let us personalize your experience</p>

          <div class="quiz-popup-options">
            <a href="/quiz/" class="quiz-popup-btn primary" onclick="localStorage.setItem('sg_quiz_start', 'homeowner')">
              <span class="btn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </span>
              <span class="btn-text">
                <strong>I'm a Homeowner</strong>
                <small>Planning a remodel</small>
              </span>
              <span class="btn-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
            </a>
            <a href="/quiz/" class="quiz-popup-btn secondary" onclick="localStorage.setItem('sg_quiz_start', 'pro')">
              <span class="btn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </span>
              <span class="btn-text">
                <strong>I'm a Pro</strong>
                <small>Contractor or designer</small>
              </span>
              <span class="btn-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
            </a>
          </div>

          <button class="quiz-popup-skip" onclick="window.closeQuizPopup()">
            <span>Skip for now</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
      #sgQuizPopup {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        animation: quizPopupFadeIn 0.4s ease forwards;
      }

      @keyframes quizPopupFadeIn {
        to { opacity: 1; }
      }

      .quiz-popup-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        cursor: pointer;
      }

      .quiz-popup-modal {
        position: relative;
        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
        border-radius: 20px;
        max-width: 400px;
        width: 100%;
        padding: 32px 28px;
        box-shadow:
          0 0 0 1px rgba(249, 203, 0, 0.15),
          0 25px 60px -12px rgba(0, 0, 0, 0.6),
          0 0 80px rgba(249, 203, 0, 0.08);
        transform: scale(0.92) translateY(24px);
        animation: quizPopupSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s forwards;
      }

      @keyframes quizPopupSlideIn {
        to { transform: scale(1) translateY(0); }
      }

      /* Close Button - Fixed X visibility */
      .quiz-popup-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 40px;
        height: 40px;
        border: none;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 10;
      }

      .quiz-popup-close:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: scale(1.05);
      }

      .quiz-popup-close:active {
        transform: scale(0.95);
      }

      .quiz-popup-close svg {
        width: 20px;
        height: 20px;
        color: rgba(255, 255, 255, 0.7);
        stroke: rgba(255, 255, 255, 0.7);
      }

      .quiz-popup-close:hover svg {
        color: #fff;
        stroke: #fff;
      }

      .quiz-popup-content {
        text-align: center;
      }

      /* Header Badge */
      .quiz-popup-header {
        margin-bottom: 20px;
      }

      .quiz-popup-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        background: rgba(249, 203, 0, 0.12);
        border: 1px solid rgba(249, 203, 0, 0.25);
        border-radius: 20px;
        color: #f9cb00;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .quiz-popup-badge svg {
        width: 14px;
        height: 14px;
        stroke: #f9cb00;
      }

      /* Visual Icon */
      .quiz-popup-visual {
        position: relative;
        width: 72px;
        height: 72px;
        margin: 0 auto 20px;
      }

      .quiz-popup-icon {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 4px 16px rgba(249, 203, 0, 0.35));
        animation: quizIconFloat 3s ease-in-out infinite;
      }

      .quiz-popup-glow {
        position: absolute;
        inset: -20px;
        background: radial-gradient(circle, rgba(249, 203, 0, 0.15) 0%, transparent 70%);
        pointer-events: none;
        animation: quizGlowPulse 3s ease-in-out infinite;
      }

      @keyframes quizIconFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }

      @keyframes quizGlowPulse {
        0%, 100% { opacity: 0.5; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.1); }
      }

      .quiz-popup-title {
        color: #fff;
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
        letter-spacing: -0.02em;
      }

      .quiz-popup-subtitle {
        color: rgba(255, 255, 255, 0.55);
        font-size: 15px;
        margin: 0 0 24px;
        font-weight: 400;
      }

      /* Button Options */
      .quiz-popup-options {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 20px;
      }

      .quiz-popup-btn {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
        border-radius: 12px;
        text-decoration: none;
        transition: all 0.2s ease;
        text-align: left;
      }

      .quiz-popup-btn.primary {
        background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
        color: #0f172a;
        box-shadow: 0 4px 16px rgba(249, 203, 0, 0.25);
      }

      .quiz-popup-btn.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(249, 203, 0, 0.35);
      }

      .quiz-popup-btn.primary:active {
        transform: translateY(0);
      }

      .quiz-popup-btn.secondary {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .quiz-popup-btn.secondary:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(249, 203, 0, 0.4);
      }

      .quiz-popup-btn .btn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        min-width: 40px;
        border-radius: 10px;
        flex-shrink: 0;
      }

      .quiz-popup-btn.primary .btn-icon {
        background: rgba(15, 23, 42, 0.12);
      }

      .quiz-popup-btn.secondary .btn-icon {
        background: rgba(255, 255, 255, 0.08);
      }

      .quiz-popup-btn .btn-icon svg {
        width: 22px;
        height: 22px;
      }

      .quiz-popup-btn.primary .btn-icon svg {
        stroke: #0f172a;
      }

      .quiz-popup-btn.secondary .btn-icon svg {
        stroke: #f9cb00;
      }

      .quiz-popup-btn .btn-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }

      .quiz-popup-btn .btn-text strong {
        font-size: 15px;
        font-weight: 600;
      }

      .quiz-popup-btn .btn-text small {
        font-size: 12px;
        opacity: 0.7;
      }

      .quiz-popup-btn .btn-arrow {
        opacity: 0.5;
        transition: opacity 0.2s, transform 0.2s;
      }

      .quiz-popup-btn:hover .btn-arrow {
        opacity: 1;
        transform: translateX(2px);
      }

      .quiz-popup-btn .btn-arrow svg {
        width: 18px;
        height: 18px;
      }

      .quiz-popup-btn.primary .btn-arrow svg {
        stroke: #0f172a;
      }

      .quiz-popup-btn.secondary .btn-arrow svg {
        stroke: rgba(255, 255, 255, 0.6);
      }

      /* Skip Button */
      .quiz-popup-skip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        padding: 10px 16px;
        transition: all 0.2s ease;
        border-radius: 8px;
      }

      .quiz-popup-skip:hover {
        color: rgba(255, 255, 255, 0.7);
        background: rgba(255, 255, 255, 0.05);
      }

      .quiz-popup-skip svg {
        width: 14px;
        height: 14px;
        opacity: 0.6;
        transition: transform 0.2s;
      }

      .quiz-popup-skip:hover svg {
        transform: translateX(2px);
        opacity: 1;
      }

      /* Mobile adjustments */
      @media (max-width: 480px) {
        .quiz-popup-modal {
          padding: 28px 20px;
          margin: 16px;
          border-radius: 16px;
        }

        .quiz-popup-close {
          top: 10px;
          right: 10px;
          width: 36px;
          height: 36px;
        }

        .quiz-popup-close svg {
          width: 18px;
          height: 18px;
        }

        .quiz-popup-visual {
          width: 60px;
          height: 60px;
          margin-bottom: 16px;
        }

        .quiz-popup-title {
          font-size: 20px;
        }

        .quiz-popup-subtitle {
          font-size: 14px;
          margin-bottom: 20px;
        }

        .quiz-popup-btn {
          padding: 12px 14px;
        }

        .quiz-popup-btn .btn-icon {
          width: 36px;
          height: 36px;
          min-width: 36px;
        }

        .quiz-popup-btn .btn-icon svg {
          width: 18px;
          height: 18px;
        }

        .quiz-popup-btn .btn-text strong {
          font-size: 14px;
        }
      }

      /* Closing animation */
      #sgQuizPopup.closing {
        animation: quizPopupFadeOut 0.3s ease forwards;
      }

      #sgQuizPopup.closing .quiz-popup-modal {
        animation: quizPopupSlideOut 0.3s ease forwards;
      }

      @keyframes quizPopupFadeOut {
        to { opacity: 0; }
      }

      @keyframes quizPopupSlideOut {
        to { transform: scale(0.92) translateY(24px); }
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(popup);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  // Close popup function
  window.closeQuizPopup = function() {
    const popup = document.getElementById('sgQuizPopup');
    if (popup) {
      popup.classList.add('closing');
      dismissQuiz();
      document.body.style.overflow = '';

      setTimeout(() => {
        popup.remove();
      }, 300);
    }
  };

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeQuizPopup();
    }
  });

  // Auto-show popup after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(showQuizPopup, 1000); // 1 second delay for better UX
    });
  } else {
    setTimeout(showQuizPopup, 1000);
  }

})();
