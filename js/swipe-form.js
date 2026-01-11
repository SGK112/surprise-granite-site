/**
 * Swipe Form - Tinder-style Lead Capture
 * Multi-step form with swipe card navigation
 */

(function() {
  'use strict';

  // Configuration
  const API_URL = 'https://surprise-granite-email-api.onrender.com';

  // State
  let currentStep = 0;
  let formData = {
    category: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    zip: '',
    images: [],
    message: '',
    source: 'swipe-form',
    sourcePage: window.location.href
  };

  // Categories
  const categories = [
    { id: 'countertops', name: 'Countertops', icon: '🪨' },
    { id: 'kitchen', name: 'Kitchen Remodel', icon: '🍳' },
    { id: 'bathroom', name: 'Bathroom Remodel', icon: '🛁' },
    { id: 'flooring', name: 'Flooring', icon: '🏠' },
    { id: 'tile', name: 'Tile & Backsplash', icon: '🔲' },
    { id: 'cabinets', name: 'Cabinets', icon: '🚪' }
  ];

  // Steps configuration
  const steps = [
    { id: 'category', title: 'What can we help with?', subtitle: 'Select your project type' },
    { id: 'contact', title: 'How can we reach you?', subtitle: 'We\'ll never share your info' },
    { id: 'images', title: 'Show us your space', subtitle: 'Upload photos (optional)' },
    { id: 'message', title: 'Tell us more', subtitle: 'Describe your project' },
    { id: 'success', title: 'Request Sent!', subtitle: '' }
  ];

  // Initialize
  function init() {
    // Check if swipe form elements exist or create them
    if (!document.querySelector('.swipe-form-container')) {
      createFormHTML();
    }

    bindEvents();
    updateProgress();
  }

  // Create form HTML
  function createFormHTML() {
    const container = document.createElement('div');
    container.className = 'swipe-form-container hidden';
    container.innerHTML = `
      <!-- Header -->
      <div class="swipe-form-header">
        <button class="swipe-form-close" onclick="SwipeForm.close()">×</button>
        <span class="swipe-form-title">Get Free Estimate</span>
        <span class="swipe-form-step-indicator">Step <span id="current-step">1</span> of 4</span>
      </div>

      <!-- Progress Bar -->
      <div class="swipe-progress-bar">
        <div class="swipe-progress-fill" id="progress-fill"></div>
      </div>

      <!-- Cards Stack -->
      <div class="swipe-cards-stack">

        <!-- Card 1: Category Selection -->
        <div class="swipe-form-card active" data-step="0">
          <div class="swipe-card-icon">📋</div>
          <h2 class="swipe-card-title">What can we help with?</h2>
          <p class="swipe-card-subtitle">Select your project type</p>

          <div class="swipe-category-grid" id="category-grid">
            ${categories.map(cat => `
              <button class="swipe-category-btn" data-category="${cat.id}">
                <div class="category-icon">${cat.icon}</div>
                <div class="category-name">${cat.name}</div>
              </button>
            `).join('')}
          </div>

          <div class="swipe-nav-buttons">
            <button class="swipe-btn swipe-btn-next" id="btn-next-0" disabled onclick="SwipeForm.next()">
              Continue →
            </button>
          </div>
        </div>

        <!-- Card 2: Contact Info -->
        <div class="swipe-form-card" data-step="1">
          <div class="swipe-card-icon">📱</div>
          <h2 class="swipe-card-title">How can we reach you?</h2>
          <p class="swipe-card-subtitle">We'll never share your information</p>

          <div class="swipe-input-group swipe-input-row">
            <div>
              <label class="swipe-input-label">First Name *</label>
              <input type="text" class="swipe-input" id="input-firstName" placeholder="John" required>
            </div>
            <div>
              <label class="swipe-input-label">Last Name *</label>
              <input type="text" class="swipe-input" id="input-lastName" placeholder="Smith" required>
            </div>
          </div>

          <div class="swipe-input-group">
            <label class="swipe-input-label">Email *</label>
            <input type="email" class="swipe-input" id="input-email" placeholder="john@example.com" required>
          </div>

          <div class="swipe-input-group">
            <label class="swipe-input-label">Phone *</label>
            <input type="tel" class="swipe-input" id="input-phone" placeholder="(480) 555-1234" required>
          </div>

          <div class="swipe-input-group">
            <label class="swipe-input-label">ZIP Code *</label>
            <input type="text" class="swipe-input" id="input-zip" placeholder="85374" maxlength="5" required>
          </div>

          <div class="swipe-nav-buttons">
            <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">← Back</button>
            <button class="swipe-btn swipe-btn-next" id="btn-next-1" disabled onclick="SwipeForm.next()">Continue →</button>
          </div>
        </div>

        <!-- Card 3: Image Upload -->
        <div class="swipe-form-card" data-step="2">
          <div class="swipe-card-icon">📷</div>
          <h2 class="swipe-card-title">Show us your space</h2>
          <p class="swipe-card-subtitle">Upload photos of your project area</p>

          <div class="swipe-upload-zone" id="upload-zone">
            <div class="upload-icon">📁</div>
            <div class="upload-text">Tap to upload photos</div>
            <div class="upload-hint">JPG, PNG up to 10MB each</div>
            <input type="file" class="swipe-upload-input" id="image-upload" multiple accept="image/*">
          </div>

          <div class="swipe-preview-grid" id="preview-grid"></div>

          <p class="upload-skip">Photos help us give you a better estimate</p>

          <div class="swipe-nav-buttons">
            <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">← Back</button>
            <button class="swipe-btn swipe-btn-next" onclick="SwipeForm.next()">Continue →</button>
          </div>
        </div>

        <!-- Card 4: Message -->
        <div class="swipe-form-card" data-step="3">
          <div class="swipe-card-icon">✍️</div>
          <h2 class="swipe-card-title">Tell us about your project</h2>
          <p class="swipe-card-subtitle">Any details that would help us</p>

          <div class="swipe-input-group">
            <label class="swipe-input-label">Project Details</label>
            <textarea class="swipe-input swipe-textarea" id="input-message"
              placeholder="Tell us about your project... dimensions, material preferences, timeline, etc."></textarea>
          </div>

          <div class="swipe-nav-buttons">
            <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">← Back</button>
            <button class="swipe-btn swipe-btn-submit" id="btn-submit" onclick="SwipeForm.submit()">
              Submit Request 🚀
            </button>
          </div>
        </div>

        <!-- Card 5: Success -->
        <div class="swipe-form-card" data-step="4">
          <div class="swipe-success-animation">✓</div>
          <h2 class="swipe-success-title">Request Sent!</h2>
          <p class="swipe-success-message">
            Thank you for reaching out! One of our experts will contact you within 24 hours to discuss your project.
          </p>

          <div class="swipe-success-actions">
            <button class="swipe-btn swipe-btn-next" onclick="SwipeForm.close()">
              Done
            </button>
            <a href="/" class="swipe-btn-home">← Back to Home</a>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(container);

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.className = 'swipe-form-trigger';
    trigger.innerHTML = '✉️';
    trigger.onclick = () => window.SwipeForm.open();
    trigger.title = 'Get Free Estimate';
    document.body.appendChild(trigger);
  }

  // Bind events
  function bindEvents() {
    // Category selection
    document.querySelectorAll('.swipe-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.swipe-category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        formData.category = btn.dataset.category;
        document.getElementById('btn-next-0').disabled = false;
      });
    });

    // Contact form validation
    const contactInputs = ['firstName', 'lastName', 'email', 'phone', 'zip'];
    contactInputs.forEach(field => {
      const input = document.getElementById(`input-${field}`);
      if (input) {
        input.addEventListener('input', () => {
          formData[field] = input.value;
          validateContactStep();
        });
      }
    });

    // Message input
    const messageInput = document.getElementById('input-message');
    if (messageInput) {
      messageInput.addEventListener('input', () => {
        formData.message = messageInput.value;
      });
    }

    // Image upload
    const uploadZone = document.getElementById('upload-zone');
    const uploadInput = document.getElementById('image-upload');

    if (uploadZone && uploadInput) {
      uploadZone.addEventListener('click', () => uploadInput.click());

      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
      });

      uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
      });

      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
      });

      uploadInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
      });
    }

    // Phone formatting
    const phoneInput = document.getElementById('input-phone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 0) {
          if (value.length <= 3) {
            value = `(${value}`;
          } else if (value.length <= 6) {
            value = `(${value.slice(0,3)}) ${value.slice(3)}`;
          } else {
            value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6,10)}`;
          }
        }
        e.target.value = value;
        formData.phone = value;
        validateContactStep();
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      const container = document.querySelector('.swipe-form-container');
      if (container && !container.classList.contains('hidden')) {
        if (e.key === 'Escape') {
          close();
        }
      }
    });

    // Swipe gestures for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    document.querySelector('.swipe-cards-stack')?.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    });

    document.querySelector('.swipe-cards-stack')?.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    });

    function handleSwipe() {
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentStep < steps.length - 2) {
          // Swipe left - next
          if (canProceed()) next();
        } else if (diff < 0 && currentStep > 0) {
          // Swipe right - back
          prev();
        }
      }
    }
  }

  // Handle file uploads
  function handleFiles(files) {
    const previewGrid = document.getElementById('preview-grid');
    const uploadZone = document.getElementById('upload-zone');

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/') && formData.images.length < 6) {
        const reader = new FileReader();
        reader.onload = (e) => {
          formData.images.push({
            name: file.name,
            data: e.target.result,
            file: file
          });
          renderPreviews();
        };
        reader.readAsDataURL(file);
      }
    });

    if (formData.images.length > 0) {
      uploadZone.classList.add('has-files');
    }
  }

  // Render image previews
  function renderPreviews() {
    const previewGrid = document.getElementById('preview-grid');
    previewGrid.innerHTML = formData.images.map((img, index) => `
      <div class="swipe-preview-item">
        <img src="${img.data}" alt="Preview ${index + 1}">
        <button class="swipe-preview-remove" onclick="SwipeForm.removeImage(${index})">×</button>
      </div>
    `).join('');
  }

  // Remove image
  function removeImage(index) {
    formData.images.splice(index, 1);
    renderPreviews();

    const uploadZone = document.getElementById('upload-zone');
    if (formData.images.length === 0) {
      uploadZone.classList.remove('has-files');
    }
  }

  // Validate contact step
  function validateContactStep() {
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim();
    const phone = formData.phone.replace(/\D/g, '');
    const zip = formData.zip.replace(/\D/g, '');

    const isValid = firstName.length > 0 &&
                    lastName.length > 0 &&
                    email.includes('@') &&
                    phone.length >= 10 &&
                    zip.length === 5;

    const nextBtn = document.getElementById('btn-next-1');
    if (nextBtn) {
      nextBtn.disabled = !isValid;
    }

    return isValid;
  }

  // Check if can proceed to next step
  function canProceed() {
    switch (currentStep) {
      case 0: return formData.category !== '';
      case 1: return validateContactStep();
      case 2: return true; // Images optional
      case 3: return true; // Message optional
      default: return false;
    }
  }

  // Update progress bar
  function updateProgress() {
    const totalSteps = steps.length - 1; // Exclude success step
    const progress = (currentStep / (totalSteps - 1)) * 100;

    const progressFill = document.getElementById('progress-fill');
    if (progressFill) {
      progressFill.style.width = `${Math.min(progress, 100)}%`;
    }

    const stepIndicator = document.getElementById('current-step');
    if (stepIndicator) {
      stepIndicator.textContent = Math.min(currentStep + 1, totalSteps);
    }
  }

  // Navigate to next step
  function next() {
    if (currentStep >= steps.length - 1) return;
    if (!canProceed()) return;

    const cards = document.querySelectorAll('.swipe-form-card');
    cards[currentStep].classList.remove('active');
    cards[currentStep].classList.add('prev');

    currentStep++;

    cards[currentStep].classList.remove('next');
    cards[currentStep].classList.add('active');

    updateProgress();
  }

  // Navigate to previous step
  function prev() {
    if (currentStep <= 0) return;

    const cards = document.querySelectorAll('.swipe-form-card');
    cards[currentStep].classList.remove('active');
    cards[currentStep].classList.add('next');

    currentStep--;

    cards[currentStep].classList.remove('prev');
    cards[currentStep].classList.add('active');

    updateProgress();
  }

  // Submit form
  async function submit() {
    const submitBtn = document.getElementById('btn-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Sending... ⏳';
    }

    try {
      // Prepare form data
      const leadData = {
        name: `${formData.firstName} ${formData.lastName}`,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        zip: formData.zip,
        projectType: formData.category,
        message: formData.message,
        source: 'swipe-form',
        formName: 'swipe-lead-form',
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
        hasImages: formData.images.length > 0,
        imageCount: formData.images.length
      };

      // Send to API
      const response = await fetch(`${API_URL}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit');
      }

      // Also try to save to Supabase if available
      if (window.supabase) {
        try {
          const { createClient } = window.supabase;
          const supabaseClient = createClient(
            'https://ypeypgwsycxcagncgdur.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME'
          );

          await supabaseClient.from('leads').insert([{
            full_name: leadData.name,
            first_name: leadData.firstName,
            last_name: leadData.lastName,
            email: leadData.email,
            phone: leadData.phone,
            zip_code: leadData.zip,
            project_type: leadData.projectType,
            message: leadData.message,
            source: leadData.source,
            form_name: leadData.formName,
            page_url: leadData.pageUrl,
            raw_data: leadData
          }]);
        } catch (e) {
          console.warn('Supabase save failed:', e);
        }
      }

      // Show success
      next();

    } catch (error) {
      console.error('Submit error:', error);
      alert('Something went wrong. Please try again or call us at (623) 466-2424');

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Request 🚀';
      }
    }
  }

  // Open form
  function open() {
    const container = document.querySelector('.swipe-form-container');
    if (container) {
      container.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  // Close form
  function close() {
    const container = document.querySelector('.swipe-form-container');
    if (container) {
      container.classList.add('hidden');
      document.body.style.overflow = '';

      // Reset form after animation
      setTimeout(() => {
        resetForm();
      }, 300);
    }
  }

  // Reset form
  function resetForm() {
    currentStep = 0;
    formData = {
      category: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      zip: '',
      images: [],
      message: '',
      source: 'swipe-form',
      sourcePage: window.location.href
    };

    // Reset UI
    document.querySelectorAll('.swipe-category-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.swipe-input').forEach(i => i.value = '');
    document.getElementById('preview-grid').innerHTML = '';
    document.getElementById('upload-zone')?.classList.remove('has-files');
    document.getElementById('btn-next-0').disabled = true;
    document.getElementById('btn-next-1').disabled = true;

    const submitBtn = document.getElementById('btn-submit');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Request 🚀';
    }

    // Reset cards
    const cards = document.querySelectorAll('.swipe-form-card');
    cards.forEach((card, index) => {
      card.classList.remove('active', 'prev', 'next');
      if (index === 0) card.classList.add('active');
      else card.classList.add('next');
    });

    updateProgress();
  }

  // Public API
  window.SwipeForm = {
    init,
    open,
    close,
    next,
    prev,
    submit,
    removeImage
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
