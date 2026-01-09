/**
 * Native Components - Webflow Replacement
 * Replaces Webflow's interactive components with lightweight vanilla JS
 * Version: 1.0.0
 */

(function() {
  'use strict';

  // ===========================================
  // TABS COMPONENT
  // Replaces w-tabs functionality
  // ===========================================
  function initTabs() {
    const tabContainers = document.querySelectorAll('.w-tabs');

    tabContainers.forEach(container => {
      const tabLinks = container.querySelectorAll('.w-tab-link');
      const tabPanes = container.querySelectorAll('.w-tab-pane');

      // Get animation settings from container
      const duration = parseInt(container.dataset.durationIn) || 300;
      const easing = container.dataset.easing || 'ease';

      tabLinks.forEach(link => {
        link.addEventListener('click', function(e) {
          e.preventDefault();

          const targetTab = this.dataset.wTab;
          if (!targetTab) return;

          // Update tab links
          tabLinks.forEach(l => l.classList.remove('w--current'));
          this.classList.add('w--current');

          // Update tab panes
          tabPanes.forEach(pane => {
            if (pane.dataset.wTab === targetTab) {
              pane.classList.add('w--tab-active');
              pane.style.opacity = '0';
              pane.style.display = 'block';

              // Animate in
              requestAnimationFrame(() => {
                pane.style.transition = `opacity ${duration}ms ${easing}`;
                pane.style.opacity = '1';
              });
            } else {
              pane.classList.remove('w--tab-active');
              pane.style.display = 'none';
            }
          });

          // Update container's data-current attribute
          container.dataset.current = targetTab;
        });

        // Add keyboard support
        link.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
          }
        });

        // Ensure tab links are focusable
        if (!link.hasAttribute('tabindex')) {
          link.setAttribute('tabindex', '0');
        }
        link.setAttribute('role', 'tab');
      });

      // Set ARIA attributes
      const tabMenu = container.querySelector('.w-tab-menu');
      if (tabMenu) tabMenu.setAttribute('role', 'tablist');

      tabPanes.forEach(pane => {
        pane.setAttribute('role', 'tabpanel');
      });
    });
  }

  // ===========================================
  // ACCORDION/FAQ COMPONENT
  // Replaces Webflow accordion interactions
  // ===========================================
  function initAccordions() {
    // Handle FAQ accordions with data-w-id
    const faqQuestions = document.querySelectorAll('.faq6_question, .faq_question, [class*="faq"][class*="question"]');

    faqQuestions.forEach(question => {
      const accordion = question.closest('.faq6_accordion, .faq_accordion, [class*="faq"][class*="accordion"]');
      if (!accordion) return;

      const answerWrapper = accordion.querySelector('.faq6_answer-wrapper, .faq_answer-wrapper, [class*="answer-wrapper"]');
      const icon = question.querySelector('.faq6_icon, .faq_icon, [class*="faq"][class*="icon"]');

      // Set initial state
      if (answerWrapper) {
        answerWrapper.style.overflow = 'hidden';
        answerWrapper.style.transition = 'height 0.3s ease';
      }

      question.addEventListener('click', function() {
        const isOpen = accordion.classList.contains('is-open');

        if (isOpen) {
          // Close
          accordion.classList.remove('is-open');
          if (answerWrapper) {
            answerWrapper.style.height = answerWrapper.scrollHeight + 'px';
            requestAnimationFrame(() => {
              answerWrapper.style.height = '0px';
            });
          }
          if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
          // Open
          accordion.classList.add('is-open');
          if (answerWrapper) {
            const height = answerWrapper.scrollHeight;
            answerWrapper.style.height = height + 'px';

            // Remove fixed height after animation
            setTimeout(() => {
              answerWrapper.style.height = 'auto';
            }, 300);
          }
          if (icon) icon.style.transform = 'rotate(45deg)';
        }
      });

      // Add keyboard support
      question.setAttribute('tabindex', '0');
      question.setAttribute('role', 'button');
      question.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
      });
    });
  }

  // ===========================================
  // DROPDOWN COMPONENT
  // Replaces w-dropdown functionality
  // ===========================================
  function initDropdowns() {
    const dropdowns = document.querySelectorAll('.w-dropdown');

    dropdowns.forEach(dropdown => {
      const toggle = dropdown.querySelector('.w-dropdown-toggle');
      const list = dropdown.querySelector('.w-dropdown-list');

      if (!toggle || !list) return;

      // Set initial state
      list.style.display = 'none';
      list.style.opacity = '0';
      list.style.transition = 'opacity 0.2s ease';

      function openDropdown() {
        dropdown.classList.add('w--open');
        list.style.display = 'block';
        requestAnimationFrame(() => {
          list.style.opacity = '1';
        });
      }

      function closeDropdown() {
        dropdown.classList.remove('w--open');
        list.style.opacity = '0';
        setTimeout(() => {
          if (!dropdown.classList.contains('w--open')) {
            list.style.display = 'none';
          }
        }, 200);
      }

      // Toggle on click
      toggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = dropdown.classList.contains('w--open');

        // Close all other dropdowns first
        dropdowns.forEach(d => {
          if (d !== dropdown && d.classList.contains('w--open')) {
            const otherList = d.querySelector('.w-dropdown-list');
            d.classList.remove('w--open');
            if (otherList) {
              otherList.style.opacity = '0';
              setTimeout(() => {
                otherList.style.display = 'none';
              }, 200);
            }
          }
        });

        if (isOpen) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });

      // Close on click outside
      document.addEventListener('click', function(e) {
        if (!dropdown.contains(e.target)) {
          closeDropdown();
        }
      });

      // Close on escape
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          closeDropdown();
        }
      });

      // Keyboard navigation
      toggle.setAttribute('tabindex', '0');
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('aria-haspopup', 'true');
      toggle.setAttribute('aria-expanded', 'false');

      toggle.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
      });
    });
  }

  // ===========================================
  // SLIDER COMPONENT
  // Replaces w-slider functionality
  // ===========================================
  function initSliders() {
    const sliders = document.querySelectorAll('.w-slider');

    sliders.forEach(slider => {
      const mask = slider.querySelector('.w-slider-mask');
      const slides = slider.querySelectorAll('.w-slide');
      const leftArrow = slider.querySelector('.w-slider-arrow-left');
      const rightArrow = slider.querySelector('.w-slider-arrow-right');
      const nav = slider.querySelector('.w-slider-nav');

      if (!mask || slides.length === 0) return;

      // Get settings from data attributes
      const autoplay = slider.dataset.autoplay === 'true';
      const delay = parseInt(slider.dataset.delay) || 4000;
      const duration = parseInt(slider.dataset.duration) || 500;
      const infinite = slider.dataset.infinite !== 'false';

      let currentIndex = 0;
      let autoplayInterval = null;

      // Set up slides
      slides.forEach((slide, index) => {
        slide.style.position = index === 0 ? 'relative' : 'absolute';
        slide.style.top = '0';
        slide.style.left = '0';
        slide.style.width = '100%';
        slide.style.opacity = index === 0 ? '1' : '0';
        slide.style.transition = `opacity ${duration}ms ease`;
        slide.style.display = 'block';
      });

      mask.style.position = 'relative';
      mask.style.overflow = 'hidden';

      function goToSlide(index) {
        if (index < 0) {
          index = infinite ? slides.length - 1 : 0;
        } else if (index >= slides.length) {
          index = infinite ? 0 : slides.length - 1;
        }

        slides.forEach((slide, i) => {
          slide.style.opacity = i === index ? '1' : '0';
          slide.style.position = i === index ? 'relative' : 'absolute';
        });

        currentIndex = index;
        updateNav();
      }

      function nextSlide() {
        goToSlide(currentIndex + 1);
      }

      function prevSlide() {
        goToSlide(currentIndex - 1);
      }

      function updateNav() {
        if (!nav) return;
        const dots = nav.querySelectorAll('.w-slider-dot');
        dots.forEach((dot, i) => {
          dot.classList.toggle('w-active', i === currentIndex);
        });
      }

      // Create navigation dots if nav exists
      if (nav && !nav.classList.contains('hidden')) {
        nav.innerHTML = '';
        slides.forEach((_, index) => {
          const dot = document.createElement('div');
          dot.className = 'w-slider-dot' + (index === 0 ? ' w-active' : '');
          dot.addEventListener('click', () => goToSlide(index));
          nav.appendChild(dot);
        });
      }

      // Arrow controls
      if (leftArrow) {
        leftArrow.addEventListener('click', prevSlide);
        leftArrow.style.cursor = 'pointer';
      }

      if (rightArrow) {
        rightArrow.addEventListener('click', nextSlide);
        rightArrow.style.cursor = 'pointer';
      }

      // Autoplay
      if (autoplay) {
        autoplayInterval = setInterval(nextSlide, delay);

        // Pause on hover
        slider.addEventListener('mouseenter', () => {
          clearInterval(autoplayInterval);
        });

        slider.addEventListener('mouseleave', () => {
          autoplayInterval = setInterval(nextSlide, delay);
        });
      }

      // Touch support
      let touchStartX = 0;
      let touchEndX = 0;

      mask.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      mask.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > 50) {
          if (diff > 0) {
            nextSlide();
          } else {
            prevSlide();
          }
        }
      }, { passive: true });
    });
  }

  // ===========================================
  // INITIALIZATION
  // ===========================================
  function init() {
    initTabs();
    initAccordions();
    initDropdowns();
    initSliders();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual re-initialization if needed
  window.NativeComponents = {
    initTabs,
    initAccordions,
    initDropdowns,
    initSliders,
    init
  };

})();
