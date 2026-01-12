/**
 * Surprise Granite Blog Engine
 * Standalone blog system - replaces Webflow CMS / Finsweet
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    dataUrl: '/data/blog-posts.json',
    containerSelector: '.blog10_main-list',
    filterSelector: '[data-blog-filter]',
    countSelector: '[data-blog-count]',
  };

  // State
  let allPosts = [];
  let currentFilter = 'all';

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      await loadPosts();
      setupFilters();
      renderPosts();
      updateCount();
    } catch (error) {
      console.error('Blog engine error:', error);
    }
  }

  async function loadPosts() {
    const response = await fetch(CONFIG.dataUrl);
    const data = await response.json();
    allPosts = data.posts || [];
  }

  function setupFilters() {
    const filters = document.querySelectorAll(CONFIG.filterSelector);

    filters.forEach(filter => {
      filter.addEventListener('click', (e) => {
        e.preventDefault();

        // Update active state
        filters.forEach(f => f.classList.remove('is-active'));
        filter.classList.add('is-active');

        // Get filter value
        currentFilter = filter.dataset.category || 'all';

        // Re-render
        renderPosts();
        updateCount();
      });
    });
  }

  function getFilteredPosts() {
    if (currentFilter === 'all') {
      return allPosts;
    }

    return allPosts.filter(post => {
      const category = (post.categorySlug || post.category || '').toLowerCase();
      return category === currentFilter ||
             post.category.toLowerCase() === currentFilter ||
             post.category.toLowerCase().includes(currentFilter);
    });
  }

  function renderPosts() {
    const container = document.querySelector(CONFIG.containerSelector);
    if (!container) {
      console.warn('Blog container not found');
      return;
    }

    const posts = getFilteredPosts();

    // Clear container
    container.innerHTML = '';

    // Render each post
    posts.forEach(post => {
      const card = createPostCard(post);
      container.appendChild(card);
    });
  }

  function createPostCard(post) {
    const article = document.createElement('div');
    article.className = 'blog10_item w-dyn-item';
    article.setAttribute('role', 'listitem');

    const categoryUpper = (post.category || 'General').toUpperCase();
    const imageUrl = post.image || '/images/blog-placeholder.jpg';

    article.innerHTML = `
      <a href="${post.url}" class="blog10_image-link w-inline-block">
        <div class="blog10_image-wrapper">
          <img
            src="${imageUrl}"
            loading="lazy"
            alt="${post.title}"
            class="blog10_image"
            sizes="(max-width: 479px) 92vw, (max-width: 767px) 95vw, (max-width: 991px) 46vw, (max-width: 1439px) 30vw, 400px"
          />
        </div>
      </a>
      <div class="blog10_meta-wrapper">
        <a href="/blog-categories/${post.categorySlug || 'guides'}/" class="blog10_category-link w-inline-block">
          <div class="text-style-tagline">${categoryUpper}</div>
        </a>
        <div class="blog10_date">${post.dateFormatted}</div>
      </div>
      <a href="${post.url}" class="blog10_main-title-link w-inline-block">
        <h3 class="blog10_title">${post.title}</h3>
      </a>
      <p class="blog10_excerpt text-style-2lines">${post.description}</p>
    `;

    return article;
  }

  function updateCount() {
    const countEl = document.querySelector(CONFIG.countSelector);
    if (!countEl) return;

    const posts = getFilteredPosts();
    countEl.textContent = `${posts.length} articles`;
  }

  // Expose for external use if needed
  window.SurpriseGraniteBlog = {
    refresh: () => {
      renderPosts();
      updateCount();
    },
    filter: (category) => {
      currentFilter = category;
      renderPosts();
      updateCount();
    },
    getPostCount: () => getFilteredPosts().length,
    getAllPosts: () => allPosts,
  };

})();
