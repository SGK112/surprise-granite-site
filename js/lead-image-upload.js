/**
 * Lead Image Upload Component
 * Handles image uploads for lead/estimate forms
 * Supports drag & drop, mobile camera, and multiple images
 */

class LeadImageUpload {
  constructor(options = {}) {
    this.containerId = options.containerId || 'image-upload-container';
    this.maxImages = options.maxImages || 5;
    this.maxFileSizeMB = options.maxFileSizeMB || 10;
    this.acceptedTypes = options.acceptedTypes || ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    this.images = [];
    this.onImagesChange = options.onImagesChange || (() => {});

    // Supabase config - use centralized config
    const sgConfig = window.SG_CONFIG || {};
    this.supabaseUrl = options.supabaseUrl || sgConfig.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
    this.supabaseKey = options.supabaseKey || sgConfig.SUPABASE_ANON_KEY || '';
    this.storageBucket = options.storageBucket || 'lead-images';

    this.init();
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.warn(`Container #${this.containerId} not found`);
      return;
    }
    this.render(container);
    this.attachEventListeners();
  }

  render(container) {
    container.innerHTML = `
      <div class="image-upload-wrapper">
        <div class="image-upload-label">
          <span class="upload-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </span>
          Add Project Photos <span class="upload-optional">(Optional - helps us provide accurate estimates)</span>
        </div>

        <div class="image-upload-dropzone" id="dropzone-${this.containerId}">
          <div class="dropzone-content">
            <div class="dropzone-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p class="dropzone-text">
              <span class="desktop-text">Drag photos here or <span class="upload-link">browse</span></span>
              <span class="mobile-text">Tap to add photos</span>
            </p>
            <p class="dropzone-hint">Up to ${this.maxImages} images, ${this.maxFileSizeMB}MB each (JPG, PNG, WebP)</p>
          </div>
          <input type="file"
                 id="file-input-${this.containerId}"
                 class="file-input"
                 accept="${this.acceptedTypes.join(',')}"
                 multiple
                 capture="environment">
        </div>

        <div class="image-preview-grid" id="preview-grid-${this.containerId}"></div>

        <div class="upload-progress" id="upload-progress-${this.containerId}" style="display: none;">
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill-${this.containerId}"></div>
          </div>
          <span class="progress-text" id="progress-text-${this.containerId}">Uploading...</span>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const dropzone = document.getElementById(`dropzone-${this.containerId}`);
    const fileInput = document.getElementById(`file-input-${this.containerId}`);

    if (!dropzone || !fileInput) return;

    // Click to open file picker
    dropzone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

    // Drag & drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      this.handleFiles(e.dataTransfer.files);
    });
  }

  async handleFiles(fileList) {
    const files = Array.from(fileList);
    const remainingSlots = this.maxImages - this.images.length;

    if (remainingSlots <= 0) {
      this.showError(`Maximum ${this.maxImages} images allowed`);
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      if (!this.validateFile(file)) continue;
      await this.processFile(file);
    }
  }

  validateFile(file) {
    // Check file type
    if (!this.acceptedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      this.showError(`${file.name}: Invalid file type`);
      return false;
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > this.maxFileSizeMB) {
      this.showError(`${file.name}: File too large (max ${this.maxFileSizeMB}MB)`);
      return false;
    }

    return true;
  }

  async processFile(file) {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const imageData = {
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file: file,
        name: file.name,
        size: file.size,
        type: file.type,
        preview: e.target.result,
        uploaded: false,
        url: null,
        error: null
      };

      this.images.push(imageData);
      this.renderPreviews();
      this.onImagesChange(this.images);
    };

    reader.readAsDataURL(file);
  }

  renderPreviews() {
    const grid = document.getElementById(`preview-grid-${this.containerId}`);
    if (!grid) return;

    grid.innerHTML = this.images.map((img, index) => `
      <div class="image-preview-item ${img.error ? 'has-error' : ''}" data-id="${img.id}">
        <div class="preview-image-container">
          <img src="${img.preview}" alt="${img.name}" class="preview-image">
          ${img.uploaded ? '<div class="upload-success"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' : ''}
          ${img.error ? '<div class="upload-error"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>' : ''}
        </div>
        <button type="button" class="preview-remove-btn" onclick="leadImageUpload.removeImage('${img.id}')" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="preview-info">
          <span class="preview-name">${this.truncateName(img.name)}</span>
          <span class="preview-size">${this.formatSize(img.size)}</span>
        </div>
      </div>
    `).join('');

    // Show/hide dropzone based on remaining slots
    const dropzone = document.getElementById(`dropzone-${this.containerId}`);
    if (dropzone) {
      if (this.images.length >= this.maxImages) {
        dropzone.classList.add('max-reached');
      } else {
        dropzone.classList.remove('max-reached');
      }
    }
  }

  removeImage(imageId) {
    this.images = this.images.filter(img => img.id !== imageId);
    this.renderPreviews();
    this.onImagesChange(this.images);
  }

  async uploadImages() {
    const unuploadedImages = this.images.filter(img => !img.uploaded && !img.error);

    if (unuploadedImages.length === 0) {
      return this.getUploadedUrls();
    }

    this.showProgress(0, 'Uploading images...');

    for (let i = 0; i < unuploadedImages.length; i++) {
      const img = unuploadedImages[i];
      const progress = Math.round(((i + 1) / unuploadedImages.length) * 100);

      try {
        const url = await this.uploadToStorage(img);
        img.url = url;
        img.uploaded = true;
      } catch (error) {
        console.error('Upload error:', error);
        img.error = error.message;
      }

      this.showProgress(progress, `Uploading ${i + 1} of ${unuploadedImages.length}...`);
      this.renderPreviews();
    }

    this.hideProgress();
    return this.getUploadedUrls();
  }

  async uploadToStorage(imageData) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const extension = imageData.name.split('.').pop() || 'jpg';
    const fileName = `lead_${timestamp}_${randomId}.${extension}`;
    const filePath = `uploads/${new Date().toISOString().split('T')[0]}/${fileName}`;

    // Resize image if needed (max 2000px)
    const resizedBlob = await this.resizeImage(imageData.file, 2000);

    // Upload to Supabase Storage
    const response = await fetch(
      `${this.supabaseUrl}/storage/v1/object/${this.storageBucket}/${filePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
          'Content-Type': resizedBlob.type,
          'x-upsert': 'true'
        },
        body: resizedBlob
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Upload failed');
    }

    // Return public URL
    return `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${filePath}`;
  }

  async resizeImage(file, maxDimension) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Only resize if needed
        if (width <= maxDimension && height <= maxDimension) {
          resolve(file);
          return;
        }

        // Calculate new dimensions
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => resolve(blob),
          'image/jpeg',
          0.85
        );
      };
      img.src = URL.createObjectURL(file);
    });
  }

  getUploadedUrls() {
    return this.images
      .filter(img => img.uploaded && img.url)
      .map(img => img.url);
  }

  getImageData() {
    return this.images.map(img => ({
      id: img.id,
      name: img.name,
      size: img.size,
      type: img.type,
      url: img.url,
      uploaded: img.uploaded
    }));
  }

  showProgress(percent, text) {
    const container = document.getElementById(`upload-progress-${this.containerId}`);
    const fill = document.getElementById(`progress-fill-${this.containerId}`);
    const textEl = document.getElementById(`progress-text-${this.containerId}`);

    if (container) container.style.display = 'block';
    if (fill) fill.style.width = `${percent}%`;
    if (textEl) textEl.textContent = text;
  }

  hideProgress() {
    const container = document.getElementById(`upload-progress-${this.containerId}`);
    if (container) container.style.display = 'none';
  }

  showError(message) {
    console.error('Image upload error:', message);
    // Could show a toast notification here
    const dropzone = document.getElementById(`dropzone-${this.containerId}`);
    if (dropzone) {
      const originalContent = dropzone.querySelector('.dropzone-text').textContent;
      dropzone.querySelector('.dropzone-text').innerHTML = `<span style="color: #ef4444;">${message}</span>`;
      setTimeout(() => {
        dropzone.querySelector('.dropzone-text').innerHTML = `<span class="desktop-text">Drag photos here or <span class="upload-link">browse</span></span><span class="mobile-text">Tap to add photos</span>`;
      }, 3000);
    }
  }

  truncateName(name, maxLength = 15) {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const baseName = name.slice(0, maxLength - ext.length - 4);
    return `${baseName}...${ext}`;
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  reset() {
    this.images = [];
    this.renderPreviews();
    this.onImagesChange(this.images);
    const fileInput = document.getElementById(`file-input-${this.containerId}`);
    if (fileInput) fileInput.value = '';
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.LeadImageUpload = LeadImageUpload;
}

// Styles (inject into document)
const imageUploadStyles = document.createElement('style');
imageUploadStyles.textContent = `
  .image-upload-wrapper {
    margin: 24px 0;
  }

  .image-upload-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .upload-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(204, 166, 0, 0.15);
    border-radius: 8px;
    color: #cca600;
  }

  .upload-optional {
    font-size: 0.8rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.5);
  }

  .image-upload-dropzone {
    position: relative;
    border: 2px dashed rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 32px 24px;
    text-align: center;
    transition: all 0.3s ease;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.02);
  }

  .image-upload-dropzone:hover {
    border-color: rgba(204, 166, 0, 0.5);
    background: rgba(204, 166, 0, 0.05);
  }

  .image-upload-dropzone.dragover {
    border-color: #cca600;
    background: rgba(204, 166, 0, 0.1);
    transform: scale(1.01);
  }

  .image-upload-dropzone.max-reached {
    opacity: 0.5;
    pointer-events: none;
  }

  .dropzone-content {
    pointer-events: none;
  }

  .dropzone-icon {
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 12px;
  }

  .dropzone-text {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 8px;
  }

  .upload-link {
    color: #cca600;
    font-weight: 500;
    cursor: pointer;
  }

  .dropzone-hint {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
  }

  .mobile-text {
    display: none;
  }

  @media (max-width: 768px) {
    .desktop-text { display: none; }
    .mobile-text { display: inline; }
  }

  .file-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .image-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
    margin-top: 16px;
  }

  .image-preview-item {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .image-preview-item.has-error {
    border-color: rgba(239, 68, 68, 0.5);
  }

  .preview-image-container {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
  }

  .preview-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .upload-success, .upload-error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .upload-success {
    background: rgba(34, 197, 94, 0.9);
    color: white;
  }

  .upload-error {
    background: rgba(239, 68, 68, 0.9);
    color: white;
  }

  .preview-remove-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .image-preview-item:hover .preview-remove-btn {
    opacity: 1;
  }

  .preview-info {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preview-name {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview-size {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.4);
  }

  .upload-progress {
    margin-top: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #cca600, #f9cb00);
    transition: width 0.3s ease;
    width: 0%;
  }

  .progress-text {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
  }
`;
document.head.appendChild(imageUploadStyles);
