/**
 * Animated Invoice Builder
 * Creates a visual "building" experience where the invoice constructs itself
 * piece by piece in front of the user's eyes.
 */

(function() {
  'use strict';

  const COMPANY = {
    name: 'Surprise Granite Marble & Quartz',
    shortName: 'Surprise Granite',
    phone: '(602) 833-3189',
    email: 'info@surprisegranite.com',
    address: '15464 W Aster Dr, Surprise, AZ 85379',
    logo: '/migrated/6456ce4476abb25581fbad0c/6456ce4476abb23120fbb175_Surprise-Granite-webclip-icon-256x256px.png',
    license: 'AZ ROC# 341113',
    website: 'www.surprisegranite.com'
  };

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .inv-builder-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.85);
      z-index: 100002; display: flex; align-items: center; justify-content: center;
      padding: 20px; opacity: 0; transition: opacity 0.4s;
    }
    .inv-builder-overlay.show { opacity: 1; }
    .inv-builder-container {
      width: 100%; max-width: 680px; max-height: 90vh; overflow-y: auto;
      background: #fff; border-radius: 12px; box-shadow: 0 30px 100px rgba(0,0,0,0.5);
      position: relative;
    }
    .inv-builder-paper {
      padding: 48px 44px; min-height: 600px; position: relative;
      font-family: 'Inter', -apple-system, sans-serif; color: #1a1a2e;
    }
    @media (max-width: 600px) {
      .inv-builder-paper { padding: 24px 20px; min-height: 500px; }
    }

    /* Animation classes */
    .inv-animate { opacity: 0; transform: translateY(12px); transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
    .inv-animate.in { opacity: 1; transform: translateY(0); }
    .inv-type { overflow: hidden; white-space: nowrap; width: 0; transition: width 0.6s ease; display: inline-block; vertical-align: bottom; }
    .inv-type.in { width: auto; }
    .inv-line-draw { width: 0; height: 2px; background: #f9cb00; transition: width 0.8s ease; }
    .inv-line-draw.in { width: 100%; }
    .inv-scale { opacity: 0; transform: scale(0.5); transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .inv-scale.in { opacity: 1; transform: scale(1); }
    .inv-fade { opacity: 0; transition: opacity 0.6s ease; }
    .inv-fade.in { opacity: 1; }

    /* Invoice elements */
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .inv-logo { width: 60px; height: 60px; border-radius: 10px; }
    .inv-company { text-align: right; font-size: 12px; color: #666; line-height: 1.6; }
    .inv-company strong { color: #1a1a2e; font-size: 14px; display: block; margin-bottom: 2px; }
    .inv-title { font-size: 32px; font-weight: 800; color: #1a1a2e; letter-spacing: -1px; margin-bottom: 4px; }
    .inv-title span { color: #f9cb00; }
    .inv-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .inv-meta-group label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 600; display: block; margin-bottom: 4px; }
    .inv-meta-group span { font-size: 14px; color: #1a1a2e; font-weight: 500; }
    .inv-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .inv-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 600; padding: 10px 0; border-bottom: 2px solid #f0f0f0; }
    .inv-table th:last-child, .inv-table td:last-child { text-align: right; }
    .inv-table td { padding: 14px 0; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
    .inv-table .item-desc { font-weight: 500; }
    .inv-totals { display: flex; flex-direction: column; align-items: flex-end; margin-top: 16px; gap: 6px; }
    .inv-total-row { display: flex; justify-content: space-between; width: 240px; font-size: 14px; padding: 6px 0; }
    .inv-total-row.grand { font-size: 20px; font-weight: 700; border-top: 2px solid #1a1a2e; padding-top: 10px; margin-top: 4px; }
    .inv-total-row.grand .inv-amount { color: #f9cb00; }
    .inv-stamp { position: absolute; bottom: 80px; right: 30px; transform: rotate(-12deg); font-size: 36px; font-weight: 900; color: rgba(200,200,200,0.08); text-transform: uppercase; letter-spacing: 6px; pointer-events: none; z-index: 0; }
    .inv-notes { margin-top: 24px; padding: 16px; background: #fafafa; border-radius: 8px; font-size: 13px; color: #666; line-height: 1.6; }
    .inv-footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #999; text-align: center; }

    /* Action bar */
    .inv-actions {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; padding: 16px 20px;
      background: #1a1a2e; border-radius: 0 0 12px 12px;
    }
    .inv-actions button {
      padding: 12px 16px; border-radius: 8px; border: none; font-size: 13px;
      font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: all 0.2s; white-space: nowrap;
    }
    .inv-btn-print { background: #fff; color: #1a1a2e; }
    .inv-btn-print:hover { background: #f0f0f0; }
    .inv-btn-share { background: #3b82f6; color: #fff; }
    .inv-btn-share:hover { background: #2563eb; }
    .inv-btn-download { background: #22c55e; color: #fff; }
    .inv-btn-download:hover { background: #16a34a; }
    .inv-btn-send { background: #f9cb00; color: #1a1a2e; }
    .inv-btn-send:hover { background: #e5b800; }
    .inv-btn-close {
      position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.05);
      border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
      font-size: 18px; color: #999; display: flex; align-items: center; justify-content: center;
      z-index: 10; transition: all 0.2s;
    }
    .inv-btn-close:hover { background: rgba(0,0,0,0.1); color: #333; }
    @media (max-width: 500px) {
      .inv-actions { grid-template-columns: 1fr 1fr; }
      .inv-actions button { font-size: 12px; padding: 10px 12px; }
    }
  `;
  document.head.appendChild(style);

  /**
   * Build and animate an invoice
   * @param {Object} data - Invoice data
   * @param {Object} options - { onSend, onEdit, token, previewUrl }
   */
  window.buildInvoiceAnimation = function(data, options = {}) {
    const items = data.items || [];
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.amount), 0);
    const taxRate = data.taxRate || 0;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    const invoiceNumber = data.invoiceNumber || 'INV-' + Date.now().toString().slice(-6);
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const dueDate = data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'inv-builder-overlay';
    overlay.innerHTML = `
      <div class="inv-builder-container">
        <button class="inv-btn-close" onclick="this.closest('.inv-builder-overlay').remove()">&times;</button>
        <div class="inv-builder-paper" id="inv-paper">

          <!-- Header -->
          <div class="inv-header inv-animate" data-delay="200">
            <img src="${COMPANY.logo}" class="inv-logo" alt="${COMPANY.shortName}">
            <div class="inv-company">
              <strong>${COMPANY.name}</strong>
              ${COMPANY.address}<br>
              ${COMPANY.phone} | ${COMPANY.email}<br>
              ${COMPANY.license}
            </div>
          </div>

          <!-- Gold line -->
          <div class="inv-line-draw" data-delay="600"></div>

          <!-- Title -->
          <div style="margin: 20px 0 4px;" class="inv-animate" data-delay="800">
            <div class="inv-title">INV<span>OICE</span></div>
          </div>

          <!-- Meta info -->
          <div class="inv-meta inv-animate" data-delay="1000">
            <div>
              <div class="inv-meta-group">
                <label>Bill To</label>
                ${data.customerName ? `<span>${esc(data.customerName)}</span>` : `<input type="text" placeholder="Customer name" style="border:none;border-bottom:1px dashed #ccc;font-size:14px;font-weight:500;padding:4px 0;width:100%;font-family:inherit;outline:none;" id="inv-edit-name">`}
              </div>
              ${data.customerEmail ? `<div class="inv-meta-group" style="margin-top:8px"><label>Email</label><span>${esc(data.customerEmail)}</span></div>` : `<div class="inv-meta-group" style="margin-top:8px"><label>Email</label><input type="email" placeholder="customer@email.com" style="border:none;border-bottom:1px dashed #ccc;font-size:13px;padding:4px 0;width:100%;font-family:inherit;outline:none;color:#1a1a2e;" id="inv-edit-email"></div>`}
              ${data.customerPhone ? `<div class="inv-meta-group" style="margin-top:8px"><label>Phone</label><span>${esc(data.customerPhone)}</span></div>` : `<div class="inv-meta-group" style="margin-top:8px"><label>Phone</label><input type="tel" placeholder="(555) 123-4567" style="border:none;border-bottom:1px dashed #ccc;font-size:13px;padding:4px 0;width:100%;font-family:inherit;outline:none;color:#1a1a2e;" id="inv-edit-phone"></div>`}
              ${data.customerAddress ? `<div class="inv-meta-group" style="margin-top:8px"><label>Address</label><span>${esc(data.customerAddress)}${data.customerCity ? ', ' + esc(data.customerCity) : ''}${data.customerState ? ', ' + esc(data.customerState) : ''} ${esc(data.customerZip || '')}</span></div>` : `<div class="inv-meta-group" style="margin-top:8px"><label>Address</label><input type="text" placeholder="Street, City, State ZIP" style="border:none;border-bottom:1px dashed #ccc;font-size:13px;padding:4px 0;width:100%;font-family:inherit;outline:none;color:#1a1a2e;" id="inv-edit-address"></div>`}
            </div>
            <div style="text-align: right;">
              <div class="inv-meta-group">
                <label>Invoice #</label>
                <span>${esc(invoiceNumber)}</span>
              </div>
              <div class="inv-meta-group" style="margin-top:8px">
                <label>Date</label>
                <span>${date}</span>
              </div>
              <div class="inv-meta-group" style="margin-top:8px">
                <label>Due Date</label>
                <span>${dueDate}</span>
              </div>
            </div>
          </div>

          <!-- Line items table -->
          <table class="inv-table">
            <thead class="inv-animate" data-delay="1400">
              <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${items.map((item, i) => `
                <tr class="inv-animate" data-delay="${1600 + i * 200}">
                  <td class="item-desc">${esc(item.description || 'Item')}</td>
                  <td>${item.quantity || 1}</td>
                  <td>$${(item.amount || 0).toFixed(2)}</td>
                  <td>$${((item.quantity || 1) * (item.amount || 0)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Totals -->
          <div class="inv-totals">
            <div class="inv-total-row inv-animate" data-delay="${1800 + items.length * 200}">
              <span>Subtotal</span>
              <span>$${subtotal.toFixed(2)}</span>
            </div>
            ${taxRate > 0 ? `
            <div class="inv-total-row inv-animate" data-delay="${2000 + items.length * 200}">
              <span>Tax (${(taxRate * 100).toFixed(1)}%)</span>
              <span>$${tax.toFixed(2)}</span>
            </div>` : ''}
            ${data.depositAmount > 0 ? `
            <div class="inv-total-row inv-animate" data-delay="${2100 + items.length * 200}">
              <span>Deposit Due</span>
              <span>$${data.depositAmount.toFixed(2)}</span>
            </div>` : ''}
            <div class="inv-total-row grand inv-animate" data-delay="${2200 + items.length * 200}">
              <span>Total</span>
              <span class="inv-amount">$${total.toFixed(2)}</span>
            </div>
          </div>

          ${data.notes ? `
          <div class="inv-notes inv-animate" data-delay="${2500 + items.length * 200}">
            <strong style="color:#1a1a2e;">Notes:</strong><br>${esc(data.notes)}
          </div>` : ''}

          <!-- Pay Online Link → /pay/ pre-filled with this invoice.
               Previously pointed at /checkout/ (the store cart), which sent
               invoice customers to an empty Shopify cart. /pay/ is our
               invoice-specific payment page that builds a Stripe Checkout
               Session scoped to this invoice amount/number/email. -->
          <div class="inv-animate" data-delay="${2600 + items.length * 200}" style="margin-top:24px;text-align:center;">
            ${(() => {
              const payAmount = (data.depositAmount > 0 ? data.depositAmount : total);
              const payParams = new URLSearchParams();
              payParams.set('amount', Math.round(payAmount * 100));
              if (data.customerEmail) payParams.set('email', data.customerEmail);
              if (data.invoiceNumber) payParams.set('invoice', data.invoiceNumber);
              const memo = data.depositAmount > 0
                ? ('Deposit for ' + (data.projectName || data.invoiceNumber || 'Invoice'))
                : (data.projectName || 'Invoice Payment');
              payParams.set('memo', memo);
              const payUrl = '/pay/?' + payParams.toString();
              return `<a href="${payUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#f9cb00,#e5b800);color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;transition:all 0.2s;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform=''">Pay $${payAmount.toFixed(2)}</a>
            <div style="margin-top:6px;font-size:11px;color:#aaa;">${COMPANY.website}/pay</div>`;
            })()}
          </div>

          <!-- Footer -->
          <div class="inv-footer inv-animate" data-delay="${2800 + items.length * 200}">
            Thank you for your business! | ${COMPANY.website} | ${COMPANY.phone}
          </div>

          <!-- Stamp -->
          <div class="inv-stamp inv-scale" data-delay="${3000 + items.length * 200}">INVOICE</div>

        </div>

        <!-- Action buttons -->
        <div class="inv-actions inv-fade" data-delay="${3200 + items.length * 200}">
          <button class="inv-btn-print" onclick="window._invPrint()">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z"/></svg>
            Print
          </button>
          <button class="inv-btn-download" onclick="window._invDownload()">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download PDF
          </button>
          <button class="inv-btn-share" onclick="window._invShare()">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share Link
          </button>
          ${options.onSend ? `
          <button class="inv-btn-send" onclick="window._invSend()">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Send to Customer
          </button>` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    // Animate elements sequentially
    const animatables = overlay.querySelectorAll('[data-delay]');
    animatables.forEach(el => {
      const delay = parseInt(el.dataset.delay) || 0;
      setTimeout(() => el.classList.add('in'), delay);
    });

    // Action handlers
    window._invPrint = function() {
      const paper = document.getElementById('inv-paper');
      const win = window.open('', '_blank');
      win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoiceNumber}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a2e; }
          ${style.textContent.replace(/\.inv-animate[^{]*\{[^}]+\}/g, '').replace(/\.inv-[a-z-]+\.in[^{]*\{[^}]+\}/g, '')}
          .inv-animate, .inv-scale, .inv-fade, .inv-line-draw { opacity: 1 !important; transform: none !important; width: 100% !important; }
          .inv-builder-paper { padding: 0; min-height: auto; }
          .inv-actions, .inv-btn-close, .inv-stamp { display: none !important; }
          @media print { body { padding: 20px; } }
        </style>
      </head><body>${paper.outerHTML}</body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 500);
    };

    window._invDownload = function() {
      // Use print-to-PDF via the browser
      window._invPrint();
    };

    window._invShare = function() {
      if (options.token) {
        const url = window.location.origin + '/invoice/view/?token=' + options.token;
        if (navigator.share) {
          navigator.share({ title: 'Invoice ' + invoiceNumber, url: url });
        } else {
          navigator.clipboard.writeText(url).then(() => {
            if (window.showToast) window.showToast('Invoice link copied!', 'success');
            else alert('Link copied: ' + url);
          });
        }
      } else if (options.previewUrl) {
        navigator.clipboard.writeText(window.location.origin + options.previewUrl).then(() => {
          if (window.showToast) window.showToast('Invoice link copied!', 'success');
        });
      } else {
        if (window.showToast) window.showToast('Save the invoice first to get a shareable link', 'warning');
      }
    };

    window._invSend = options.onSend || function() {};

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    return overlay;
  };

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

})();
