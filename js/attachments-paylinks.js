/**
 * Attachments & Pay Links Module
 * Provides UI components and API integration for file attachments and Stripe pay links
 *
 * Usage:
 * 1. Include this script in your page
 * 2. Call AttachmentsPayLinks.init() with configuration
 * 3. Use the provided methods to render UI components
 */

const AttachmentsPayLinks = (function() {
  'use strict';

  // Configuration
  let config = {
    apiBase: window.API_BASE_URL || '',
    supabaseUrl: window.SUPABASE_URL || '',
    supabaseKey: window.SUPABASE_ANON_KEY || '',
    storageBucket: 'document-attachments',
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxImageSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
    maxAttachments: 10
  };

  let supabase = null;

  // Initialize the module
  function init(options = {}) {
    config = { ...config, ...options };

    // Initialize Supabase client if not already done
    if (window.supabase) {
      supabase = window.supabase;
    } else if (config.supabaseUrl && config.supabaseKey) {
      supabase = window.supabase?.createClient?.(config.supabaseUrl, config.supabaseKey);
    }

    console.log('AttachmentsPayLinks initialized');
  }

  // Get auth token
  async function getAuthToken() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token;
    } catch (e) {
      console.error('Failed to get auth token:', e);
      return null;
    }
  }

  // API helper
  async function apiCall(endpoint, method = 'GET', data = null) {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${config.apiBase}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'API request failed');
    }

    return result;
  }

  // ============ ATTACHMENTS ============

  // Upload file to Supabase Storage
  async function uploadFile(file, entityType, entityId) {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    // Validate file type
    if (!config.allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} not allowed. Allowed: ${config.allowedTypes.join(', ')}`);
    }

    // Validate file size
    const maxSize = file.type.startsWith('image/') ? config.maxImageSize : config.maxFileSize;
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size: ${maxSize / 1024 / 1024}MB`);
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const fileName = `${entityType}/${entityId}/${timestamp}-${randomStr}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(config.storageBucket)
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(config.storageBucket)
      .getPublicUrl(fileName);

    return {
      fileName: file.name,
      fileUrl: publicUrl,
      fileType: file.type.startsWith('image/') ? 'image' : 'pdf',
      mimeType: file.type,
      fileSize: file.size,
      storagePath: fileName
    };
  }

  // Create attachment record
  async function createAttachment(entityType, entityId, fileData, options = {}) {
    const payload = {
      [`${entityType}_id`]: entityId,
      file_name: fileData.fileName,
      file_url: fileData.fileUrl,
      file_type: fileData.fileType,
      mime_type: fileData.mimeType,
      file_size: fileData.fileSize,
      category: options.category || 'general',
      description: options.description || '',
      visible_to_customer: options.visibleToCustomer !== false,
      include_in_email: options.includeInEmail === true
    };

    return await apiCall('/api/attachments', 'POST', payload);
  }

  // Upload and create attachment in one step
  async function uploadAttachment(file, entityType, entityId, options = {}) {
    const fileData = await uploadFile(file, entityType, entityId);
    return await createAttachment(entityType, entityId, fileData, options);
  }

  // Get attachments for an entity
  async function getAttachments(entityType, entityId) {
    return await apiCall(`/api/${entityType}s/${entityId}/attachments`);
  }

  // Delete attachment
  async function deleteAttachment(attachmentId) {
    return await apiCall(`/api/attachments/${attachmentId}`, 'DELETE');
  }

  // ============ PAY LINKS ============

  // Create pay link for an entity
  async function createPayLink(entityType, entityId, options = {}) {
    const payload = {
      amount_type: options.amountType || 'deposit',
      custom_amount: options.customAmount
    };

    return await apiCall(`/api/${entityType}s/${entityId}/pay-link`, 'POST', payload);
  }

  // Send pay link email
  async function sendPayLinkEmail(params) {
    return await apiCall('/api/pay-link/send', 'POST', params);
  }

  // Send entity with attachments and pay link
  async function sendEntity(entityType, entityId, options = {}) {
    const payload = {
      include_attachments: options.includeAttachments !== false,
      include_pay_link: options.includePayLink === true,
      generate_pay_link: options.generatePayLink === true,
      notes: options.notes
    };

    return await apiCall(`/api/${entityType}s/${entityId}/send`, 'POST', payload);
  }

  // ============ UI COMPONENTS ============

  // Render attachment upload dropzone
  function renderDropzone(containerId, entityType, entityId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container #${containerId} not found`);
      return;
    }

    const dropzoneHtml = `
      <div class="attachment-dropzone" id="dropzone-${entityId}">
        <div class="dropzone-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="dropzone-text">Drag & drop files here or <span class="dropzone-browse">browse</span></p>
          <p class="dropzone-hint">Images (JPEG, PNG, WebP) up to 10MB, PDFs up to 25MB</p>
        </div>
        <input type="file" class="dropzone-input" multiple accept="${config.allowedTypes.join(',')}" />
      </div>
      <div class="attachment-list" id="attachments-${entityId}"></div>
    `;

    container.innerHTML = dropzoneHtml;

    // Add styles if not already present
    if (!document.getElementById('attachment-styles')) {
      const styles = document.createElement('style');
      styles.id = 'attachment-styles';
      styles.textContent = `
        .attachment-dropzone {
          border: 2px dashed rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(255,255,255,0.02);
          position: relative;
        }
        .attachment-dropzone:hover,
        .attachment-dropzone.dragover {
          border-color: #f9cb00;
          background: rgba(249,203,0,0.05);
        }
        .attachment-dropzone .dropzone-input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .dropzone-content svg {
          color: rgba(255,255,255,0.4);
          margin-bottom: 12px;
        }
        .dropzone-text {
          color: rgba(255,255,255,0.8);
          margin-bottom: 8px;
        }
        .dropzone-browse {
          color: #f9cb00;
          font-weight: 600;
        }
        .dropzone-hint {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
        }
        .attachment-list {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .attachment-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .attachment-item.uploading {
          opacity: 0.6;
        }
        .attachment-icon {
          width: 40px;
          height: 40px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
        .attachment-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 6px;
        }
        .attachment-info {
          flex: 1;
          min-width: 0;
        }
        .attachment-name {
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .attachment-meta {
          font-size: 12px;
          color: rgba(255,255,255,0.5);
          display: flex;
          gap: 8px;
          margin-top: 2px;
        }
        .attachment-actions {
          display: flex;
          gap: 8px;
        }
        .attachment-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
          cursor: pointer;
        }
        .attachment-toggle input {
          accent-color: #f9cb00;
        }
        .attachment-delete {
          padding: 6px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .attachment-delete:hover {
          color: #ef4444;
          background: rgba(239,68,68,0.1);
        }
        .upload-progress {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          margin-top: 8px;
          overflow: hidden;
        }
        .upload-progress-bar {
          height: 100%;
          background: #f9cb00;
          transition: width 0.3s;
        }
      `;
      document.head.appendChild(styles);
    }

    // Setup event listeners
    const dropzone = container.querySelector('.attachment-dropzone');
    const input = container.querySelector('.dropzone-input');

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      await handleFiles(e.dataTransfer.files, entityType, entityId, options);
    });

    input.addEventListener('change', async (e) => {
      await handleFiles(e.target.files, entityType, entityId, options);
      input.value = ''; // Reset input
    });

    // Load existing attachments
    loadAttachments(entityType, entityId);
  }

  // Handle file uploads
  async function handleFiles(files, entityType, entityId, options = {}) {
    const listContainer = document.getElementById(`attachments-${entityId}`);

    for (const file of files) {
      // Create placeholder item
      const itemId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const itemHtml = `
        <div class="attachment-item uploading" id="${itemId}">
          <div class="attachment-icon">${getFileIcon(file.type)}</div>
          <div class="attachment-info">
            <div class="attachment-name">${escapeHtml(file.name)}</div>
            <div class="attachment-meta">
              <span>${formatFileSize(file.size)}</span>
              <span>Uploading...</span>
            </div>
            <div class="upload-progress">
              <div class="upload-progress-bar" style="width: 0%"></div>
            </div>
          </div>
        </div>
      `;
      listContainer.insertAdjacentHTML('beforeend', itemHtml);

      try {
        // Upload file
        const result = await uploadAttachment(file, entityType, entityId, options);

        // Replace placeholder with actual attachment
        const item = document.getElementById(itemId);
        if (item && result.attachment) {
          item.outerHTML = renderAttachmentItem(result.attachment);
        }
      } catch (error) {
        console.error('Upload failed:', error);
        const item = document.getElementById(itemId);
        if (item) {
          item.querySelector('.attachment-meta').innerHTML = `<span style="color:#ef4444">Upload failed: ${error.message}</span>`;
        }
      }
    }
  }

  // Load and render attachments
  async function loadAttachments(entityType, entityId) {
    try {
      const result = await getAttachments(entityType, entityId);
      const listContainer = document.getElementById(`attachments-${entityId}`);

      if (result.attachments && result.attachments.length > 0) {
        listContainer.innerHTML = result.attachments.map(renderAttachmentItem).join('');
      }
    } catch (error) {
      console.error('Failed to load attachments:', error);
    }
  }

  // Render single attachment item
  function renderAttachmentItem(attachment) {
    const isImage = attachment.file_type === 'image' || attachment.file_type === 'photo';
    const icon = isImage
      ? `<img src="${attachment.file_url}" alt="${escapeHtml(attachment.file_name)}" />`
      : getFileIcon(attachment.mime_type);

    return `
      <div class="attachment-item" data-id="${attachment.id}">
        <div class="attachment-icon">${icon}</div>
        <div class="attachment-info">
          <div class="attachment-name">${escapeHtml(attachment.file_name)}</div>
          <div class="attachment-meta">
            <span>${formatFileSize(attachment.file_size)}</span>
            <span>${attachment.category || 'general'}</span>
          </div>
        </div>
        <div class="attachment-actions">
          <label class="attachment-toggle">
            <input type="checkbox" ${attachment.include_in_email ? 'checked' : ''}
              onchange="AttachmentsPayLinks.toggleEmailInclude('${attachment.id}', this.checked)" />
            Email
          </label>
          <button class="attachment-delete" onclick="AttachmentsPayLinks.removeAttachment('${attachment.id}')" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  // Render pay link button
  function renderPayLinkButton(containerId, entityType, entityId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const buttonHtml = `
      <div class="paylink-section">
        <button class="paylink-btn" id="paylink-btn-${entityId}" onclick="AttachmentsPayLinks.showPayLinkModal('${entityType}', '${entityId}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          Generate Pay Link
        </button>
        ${options.existingPayLink ? `
          <div class="paylink-existing">
            <span>Active: <a href="${options.existingPayLink}" target="_blank">${options.existingPayLink.substring(0, 40)}...</a></span>
          </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = buttonHtml;

    // Add styles
    if (!document.getElementById('paylink-styles')) {
      const styles = document.createElement('style');
      styles.id = 'paylink-styles';
      styles.textContent = `
        .paylink-section {
          margin: 16px 0;
        }
        .paylink-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%);
          color: #1a1a2e;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .paylink-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(249,203,0,0.3);
        }
        .paylink-existing {
          margin-top: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
        }
        .paylink-existing a {
          color: #f9cb00;
        }
        .paylink-modal {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s;
        }
        .paylink-modal.active {
          opacity: 1;
          visibility: visible;
        }
        .paylink-modal-content {
          background: #1e1e2d;
          border-radius: 16px;
          padding: 24px;
          max-width: 440px;
          width: 90%;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .paylink-modal h3 {
          margin-bottom: 16px;
          font-size: 18px;
        }
        .paylink-form-group {
          margin-bottom: 16px;
        }
        .paylink-form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          color: rgba(255,255,255,0.7);
        }
        .paylink-form-group select,
        .paylink-form-group input {
          width: 100%;
          padding: 10px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
        }
        .paylink-form-group input:focus,
        .paylink-form-group select:focus {
          outline: none;
          border-color: #f9cb00;
        }
        .paylink-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }
        .paylink-actions button {
          flex: 1;
          padding: 12px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .paylink-cancel {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
          color: rgba(255,255,255,0.7);
        }
        .paylink-create {
          background: #f9cb00;
          border: none;
          color: #1a1a2e;
        }
        .paylink-result {
          margin-top: 16px;
          padding: 12px;
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.3);
          border-radius: 8px;
        }
        .paylink-result-url {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
        .paylink-result-url input {
          flex: 1;
          background: rgba(0,0,0,0.2);
          border: none;
          padding: 8px;
          border-radius: 4px;
          color: #fff;
          font-family: monospace;
          font-size: 12px;
        }
        .paylink-copy {
          padding: 8px 12px;
          background: rgba(255,255,255,0.1);
          border: none;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
        }
      `;
      document.head.appendChild(styles);
    }
  }

  // Show pay link modal
  function showPayLinkModal(entityType, entityId) {
    // Remove existing modal
    const existing = document.getElementById('paylink-modal');
    if (existing) existing.remove();

    const modalHtml = `
      <div class="paylink-modal" id="paylink-modal">
        <div class="paylink-modal-content">
          <h3>Generate Pay Link</h3>
          <div class="paylink-form-group">
            <label>Amount Type</label>
            <select id="paylink-amount-type">
              <option value="deposit">Deposit (50%)</option>
              <option value="full">Full Amount</option>
              <option value="custom">Custom Amount</option>
            </select>
          </div>
          <div class="paylink-form-group" id="paylink-custom-amount-group" style="display:none">
            <label>Custom Amount ($)</label>
            <input type="number" id="paylink-custom-amount" placeholder="0.00" step="0.01" min="0" />
          </div>
          <div class="paylink-actions">
            <button class="paylink-cancel" onclick="AttachmentsPayLinks.closePayLinkModal()">Cancel</button>
            <button class="paylink-create" onclick="AttachmentsPayLinks.generatePayLink('${entityType}', '${entityId}')">Generate Link</button>
          </div>
          <div class="paylink-result" id="paylink-result" style="display:none">
            <strong>Pay Link Created!</strong>
            <div class="paylink-result-url">
              <input type="text" id="paylink-url" readonly />
              <button class="paylink-copy" onclick="AttachmentsPayLinks.copyPayLink()">Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Setup amount type toggle
    document.getElementById('paylink-amount-type').addEventListener('change', (e) => {
      const customGroup = document.getElementById('paylink-custom-amount-group');
      customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    // Show modal
    setTimeout(() => document.getElementById('paylink-modal').classList.add('active'), 10);

    // Close on backdrop click
    document.getElementById('paylink-modal').addEventListener('click', (e) => {
      if (e.target.id === 'paylink-modal') closePayLinkModal();
    });
  }

  // Close pay link modal
  function closePayLinkModal() {
    const modal = document.getElementById('paylink-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 200);
    }
  }

  // Generate pay link
  async function generatePayLink(entityType, entityId) {
    const amountType = document.getElementById('paylink-amount-type').value;
    const customAmount = document.getElementById('paylink-custom-amount')?.value;

    const btn = document.querySelector('.paylink-create');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const result = await createPayLink(entityType, entityId, {
        amountType,
        customAmount: amountType === 'custom' ? parseFloat(customAmount) : null
      });

      if (result.success && result.pay_link) {
        document.getElementById('paylink-result').style.display = 'block';
        document.getElementById('paylink-url').value = result.pay_link.url;
        btn.textContent = 'Link Created!';
      }
    } catch (error) {
      alert('Failed to create pay link: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Generate Link';
    }
  }

  // Copy pay link
  function copyPayLink() {
    const urlInput = document.getElementById('paylink-url');
    urlInput.select();
    document.execCommand('copy');

    const btn = document.querySelector('.paylink-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  }

  // Toggle email include for attachment
  async function toggleEmailInclude(attachmentId, include) {
    try {
      await apiCall(`/api/attachments/${attachmentId}`, 'PATCH', {
        include_in_email: include
      });
    } catch (error) {
      console.error('Failed to update attachment:', error);
    }
  }

  // Remove attachment
  async function removeAttachment(attachmentId) {
    if (!confirm('Delete this attachment?')) return;

    try {
      await deleteAttachment(attachmentId);
      const item = document.querySelector(`.attachment-item[data-id="${attachmentId}"]`);
      if (item) item.remove();
    } catch (error) {
      alert('Failed to delete: ' + error.message);
    }
  }

  // ============ UTILITIES ============

  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  function getFileIcon(mimeType) {
    if (mimeType?.startsWith('image/')) {
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>`;
    }
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>`;
  }

  // Public API
  return {
    init,
    uploadAttachment,
    getAttachments,
    deleteAttachment,
    createPayLink,
    sendPayLinkEmail,
    sendEntity,
    renderDropzone,
    renderPayLinkButton,
    showPayLinkModal,
    closePayLinkModal,
    generatePayLink,
    copyPayLink,
    toggleEmailInclude,
    removeAttachment
  };
})();

// Auto-initialize if config is available
if (typeof window !== 'undefined') {
  window.AttachmentsPayLinks = AttachmentsPayLinks;
}
