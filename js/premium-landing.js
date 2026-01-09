/**
 * Premium Landing Page Interactions
 * High-tech animations and visual effects
 */

(function() {
  'use strict';

  // Counter animation for stats
  function animateCounter(element, target, duration = 2000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString();
    }, 16);
  }

  // Initialize stat counters when visible
  function initStatCounters() {
    const statValues = document.querySelectorAll('.stat-value[data-count]');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = parseInt(entry.target.dataset.count, 10);
          animateCounter(entry.target, target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    statValues.forEach(stat => observer.observe(stat));
  }

  // Scroll reveal animations
  function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

    reveals.forEach(el => observer.observe(el));
  }

  // Parallax effect for hero
  function initParallax() {
    const hero = document.querySelector('.premium-hero');
    if (!hero) return;

    const heroVisual = hero.querySelector('.premium-hero-visual');
    const heroMesh = hero.querySelector('.premium-hero-mesh');

    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const rate = scrolled * 0.3;

      if (heroVisual) {
        heroVisual.style.transform = `translateY(${rate * 0.5}px)`;
      }
      if (heroMesh) {
        heroMesh.style.transform = `translateY(${rate * 0.2}px)`;
      }
    }, { passive: true });
  }

  // Mouse follow effect for hero
  function initMouseFollow() {
    const hero = document.querySelector('.premium-hero');
    if (!hero) return;

    const mesh = hero.querySelector('.premium-hero-mesh');
    if (!mesh) return;

    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      mesh.style.background = `
        radial-gradient(ellipse at ${x * 100}% ${y * 100}%, rgba(249, 203, 0, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at ${100 - x * 100}% ${y * 100}%, rgba(45, 74, 94, 0.2) 0%, transparent 40%),
        radial-gradient(ellipse at ${x * 100}% ${100 - y * 100}%, rgba(249, 203, 0, 0.1) 0%, transparent 50%)
      `;
    });
  }

  // Tilt effect for cards
  function initTiltEffect() {
    const cards = document.querySelectorAll('.category-card, .showcase-card');

    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
      });
    });
  }

  // Smooth scroll for anchor links
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // Typing effect for hero title
  function initTypingEffect() {
    const typingEl = document.querySelector('[data-typing]');
    if (!typingEl) return;

    const words = typingEl.dataset.typing.split(',');
    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let delay = 100;

    function type() {
      const currentWord = words[wordIndex];

      if (isDeleting) {
        typingEl.textContent = currentWord.substring(0, charIndex - 1);
        charIndex--;
        delay = 50;
      } else {
        typingEl.textContent = currentWord.substring(0, charIndex + 1);
        charIndex++;
        delay = 100;
      }

      if (!isDeleting && charIndex === currentWord.length) {
        delay = 2000;
        isDeleting = true;
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        delay = 500;
      }

      setTimeout(type, delay);
    }

    type();
  }

  // Video background autoplay handling
  function initVideoBackground() {
    const video = document.querySelector('.premium-hero-bg video');
    if (!video) return;

    // Ensure video plays
    video.play().catch(() => {
      // If autoplay fails, show poster or fallback image
      video.style.display = 'none';
    });

    // Pause when not visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          video.play();
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.25 });

    observer.observe(video);
  }

  // Create floating particles dynamically
  function createParticles() {
    const container = document.querySelector('.premium-hero-particles');
    if (!container) return;

    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 15}s`;
      particle.style.animationDuration = `${10 + Math.random() * 10}s`;
      particle.style.width = `${2 + Math.random() * 4}px`;
      particle.style.height = particle.style.width;
      container.appendChild(particle);
    }
  }

  // Magnetic button effect
  function initMagneticButtons() {
    const buttons = document.querySelectorAll('.premium-btn');

    buttons.forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate(0, 0)';
      });
    });
  }

  // Image lazy loading with blur effect
  function initLazyImages() {
    const images = document.querySelectorAll('img[data-src]');

    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.onload = () => {
            img.classList.add('loaded');
          };
          imageObserver.unobserve(img);
        }
      });
    }, { rootMargin: '50px' });

    images.forEach(img => imageObserver.observe(img));
  }

  // Progress indicator on scroll
  function initScrollProgress() {
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.innerHTML = '<div class="scroll-progress-bar"></div>';
    document.body.appendChild(progress);

    const bar = progress.querySelector('.scroll-progress-bar');

    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const percent = (scrolled / maxScroll) * 100;
      bar.style.width = `${percent}%`;
    }, { passive: true });

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .scroll-progress {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(0,0,0,0.1);
        z-index: 100001;
      }
      .scroll-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #f9cb00, #e5b800);
        width: 0;
        transition: width 0.1s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize everything
  function init() {
    initScrollReveal();
    initStatCounters();
    initParallax();
    initMouseFollow();
    initTiltEffect();
    initSmoothScroll();
    initTypingEffect();
    initVideoBackground();
    createParticles();
    initMagneticButtons();
    initLazyImages();
    initScrollProgress();

    // Add loaded class to body for initial animations
    document.body.classList.add('premium-loaded');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
