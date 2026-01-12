const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client (service role for backend operations)
const supabaseUrl = process.env.SUPABASE_URL || 'https://htjvyzmuqsrjpesdurni.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Blueprint Takeoff Analyzer with GPT-4 Vision and Ollama support
const { analyzeBlueprint, parseBluebeamBAX, CONFIG: TAKEOFF_CONFIG } = require('./lib/takeoff/blueprint-analyzer');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email configuration - using Gmail SMTP or configure your own
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

// Admin email for notifications
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@surprisegranite.com';

// Send email notification
async function sendNotification(to, subject, html) {
  try {
    if (!SMTP_USER) {
      console.log('Email notification (SMTP not configured):', { to, subject });
      return { success: false, reason: 'SMTP not configured' };
    }

    await transporter.sendMail({
      from: `"Surprise Granite" <${SMTP_USER}>`,
      to,
      subject,
      html
    });
    console.log('Email sent:', subject);
    return { success: true };
  } catch (err) {
    console.error('Email error:', err.message);
    return { success: false, reason: err.message };
  }
}

// Company Branding
const COMPANY = {
  name: 'Surprise Granite Marble & Quartz',
  shortName: 'Surprise Granite',
  email: 'info@surprisegranite.com',
  phone: '(602) 833-3189',
  address: '15464 W Aster Dr, Surprise, AZ 85379',
  website: 'https://www.surprisegranite.com',
  logo: 'https://cdn.prod.website-files.com/63d50be6d353ffb720a1aa80/63d50be6d353ffb720a1aae4_SG%20LOGO%20BLACK%203.png',
  tagline: 'Premium Countertops & Expert Installation',
  license: 'AZ ROC# 341113'
};

// ==================== PDF GENERATION ====================

// Generate professional estimate PDF
function generateEstimatePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 50,
        bufferPages: true
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const {
        customer_name,
        customer_email,
        customer_phone,
        customer_address,
        estimate_number,
        items = [],
        subtotal = 0,
        tax_rate = 0,
        tax_amount = 0,
        total = 0,
        notes,
        company_name,
        company_email,
        company_phone,
        company_address,
        company_logo,
        project_type,
        estimated_timeline,
        inclusions,
        exclusions,
        terms_conditions,
        payment_schedule,
        valid_until,
        created_at
      } = data;

      // Use company info or defaults
      const compName = company_name || COMPANY.name;
      const compEmail = company_email || COMPANY.email;
      const compPhone = company_phone || COMPANY.phone;
      const compAddress = company_address || COMPANY.address;

      // Colors
      const primaryColor = '#1a1a2e';
      const accentColor = '#f9cb00';
      const grayColor = '#666666';
      const lightGray = '#f5f5f5';

      // Format currency helper
      const formatCurrency = (amount) => {
        const num = parseFloat(amount) || 0;
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // Format date helper
      const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      };

      // ===== HEADER =====
      // Company name (large, bold)
      doc.fontSize(24).fillColor(primaryColor).font('Helvetica-Bold')
         .text(compName, 50, 50);

      // Tagline
      doc.fontSize(10).fillColor(grayColor).font('Helvetica')
         .text(COMPANY.tagline, 50, 78);

      // ESTIMATE label (right side)
      doc.fontSize(28).fillColor(accentColor).font('Helvetica-Bold')
         .text('ESTIMATE', 400, 50, { align: 'right' });

      // Estimate number
      doc.fontSize(12).fillColor(primaryColor).font('Helvetica')
         .text(`#${estimate_number || 'N/A'}`, 400, 82, { align: 'right' });

      // Accent line
      doc.moveTo(50, 105).lineTo(562, 105).strokeColor(accentColor).lineWidth(3).stroke();

      // ===== COMPANY & CUSTOMER INFO =====
      let yPos = 125;

      // Company info (left)
      doc.fontSize(9).fillColor(grayColor).font('Helvetica')
         .text('FROM:', 50, yPos);
      doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
         .text(compName, 50, yPos + 12);
      doc.fontSize(9).fillColor(grayColor).font('Helvetica')
         .text(compAddress, 50, yPos + 25)
         .text(`Phone: ${compPhone}`, 50, yPos + 37)
         .text(`Email: ${compEmail}`, 50, yPos + 49);

      // Customer info (right)
      doc.fontSize(9).fillColor(grayColor).font('Helvetica')
         .text('TO:', 350, yPos);
      doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
         .text(customer_name || 'Valued Customer', 350, yPos + 12);
      doc.fontSize(9).fillColor(grayColor).font('Helvetica');
      if (customer_address) doc.text(customer_address, 350, yPos + 25);
      if (customer_phone) doc.text(`Phone: ${customer_phone}`, 350, yPos + (customer_address ? 37 : 25));
      if (customer_email) doc.text(`Email: ${customer_email}`, 350, yPos + (customer_address ? 49 : 37));

      // ===== ESTIMATE DETAILS BOX =====
      yPos = 210;
      doc.rect(50, yPos, 512, 50).fillColor(lightGray).fill();

      // Details row
      doc.fontSize(8).fillColor(grayColor).font('Helvetica')
         .text('DATE', 60, yPos + 8)
         .text('VALID UNTIL', 180, yPos + 8)
         .text('PROJECT TYPE', 320, yPos + 8);

      doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
         .text(formatDate(created_at) || formatDate(new Date()), 60, yPos + 22)
         .text(formatDate(valid_until) || 'Upon Request', 180, yPos + 22)
         .text(project_type || 'Custom Project', 320, yPos + 22);

      if (estimated_timeline) {
        doc.fontSize(8).fillColor(grayColor).font('Helvetica')
           .text('TIMELINE', 450, yPos + 8);
        doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
           .text(estimated_timeline, 450, yPos + 22);
      }

      // ===== LINE ITEMS TABLE =====
      yPos = 280;

      // Table header
      doc.rect(50, yPos, 512, 25).fillColor(primaryColor).fill();
      doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
         .text('DESCRIPTION', 60, yPos + 8)
         .text('QTY', 350, yPos + 8, { width: 50, align: 'center' })
         .text('UNIT PRICE', 410, yPos + 8, { width: 70, align: 'right' })
         .text('TOTAL', 490, yPos + 8, { width: 60, align: 'right' });

      yPos += 25;

      // Table rows
      items.forEach((item, index) => {
        const rowHeight = 25;
        const bgColor = index % 2 === 0 ? '#ffffff' : lightGray;

        doc.rect(50, yPos, 512, rowHeight).fillColor(bgColor).fill();

        const qty = item.quantity || 1;
        const unitPrice = item.unit_price || item.price || 0;
        const lineTotal = item.total || (qty * unitPrice);

        doc.fontSize(9).fillColor(primaryColor).font('Helvetica')
           .text(item.description || item.name || 'Item', 60, yPos + 8, { width: 280 })
           .text(qty.toString(), 350, yPos + 8, { width: 50, align: 'center' })
           .text(formatCurrency(unitPrice), 410, yPos + 8, { width: 70, align: 'right' })
           .text(formatCurrency(lineTotal), 490, yPos + 8, { width: 60, align: 'right' });

        yPos += rowHeight;
      });

      // Table bottom border
      doc.moveTo(50, yPos).lineTo(562, yPos).strokeColor('#e0e0e0').lineWidth(1).stroke();

      // ===== TOTALS =====
      yPos += 15;
      const totalsX = 400;

      // Subtotal
      doc.fontSize(10).fillColor(grayColor).font('Helvetica')
         .text('Subtotal:', totalsX, yPos);
      doc.fontSize(10).fillColor(primaryColor).font('Helvetica')
         .text(formatCurrency(subtotal), 490, yPos, { width: 60, align: 'right' });

      yPos += 18;

      // Tax (if applicable)
      if (tax_amount && tax_amount > 0) {
        doc.fontSize(10).fillColor(grayColor).font('Helvetica')
           .text(`Tax (${tax_rate || 0}%):`, totalsX, yPos);
        doc.fontSize(10).fillColor(primaryColor).font('Helvetica')
           .text(formatCurrency(tax_amount), 490, yPos, { width: 60, align: 'right' });
        yPos += 18;
      }

      // Total line
      doc.moveTo(totalsX, yPos).lineTo(550, yPos).strokeColor(accentColor).lineWidth(2).stroke();
      yPos += 8;

      // Grand Total
      doc.fontSize(14).fillColor(primaryColor).font('Helvetica-Bold')
         .text('TOTAL:', totalsX, yPos);
      doc.fontSize(14).fillColor(accentColor).font('Helvetica-Bold')
         .text(formatCurrency(total), 480, yPos, { width: 70, align: 'right' });

      // ===== PAYMENT SCHEDULE =====
      if (payment_schedule && payment_schedule.length > 0) {
        yPos += 40;
        doc.fontSize(11).fillColor(primaryColor).font('Helvetica-Bold')
           .text('Payment Schedule', 50, yPos);
        yPos += 18;

        payment_schedule.forEach(payment => {
          doc.fontSize(9).fillColor(grayColor).font('Helvetica')
             .text(`${payment.name} (${payment.percentage}%)`, 60, yPos);
          doc.fontSize(9).fillColor(primaryColor).font('Helvetica')
             .text(formatCurrency(payment.amount), 200, yPos);
          yPos += 15;
        });
      }

      // ===== INCLUSIONS & EXCLUSIONS =====
      if (inclusions || exclusions) {
        yPos += 25;

        if (inclusions) {
          doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
             .text("What's Included:", 50, yPos);
          yPos += 15;
          doc.fontSize(9).fillColor(grayColor).font('Helvetica')
             .text(inclusions, 50, yPos, { width: 500 });
          yPos += doc.heightOfString(inclusions, { width: 500 }) + 15;
        }

        if (exclusions) {
          doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
             .text("What's Not Included:", 50, yPos);
          yPos += 15;
          doc.fontSize(9).fillColor(grayColor).font('Helvetica')
             .text(exclusions, 50, yPos, { width: 500 });
          yPos += doc.heightOfString(exclusions, { width: 500 }) + 15;
        }
      }

      // ===== NOTES =====
      if (notes) {
        yPos += 10;
        doc.rect(50, yPos, 512, 5).fillColor(accentColor).fill();
        yPos += 15;
        doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
           .text('Notes:', 50, yPos);
        yPos += 15;
        doc.fontSize(9).fillColor(grayColor).font('Helvetica')
           .text(notes, 50, yPos, { width: 500 });
      }

      // ===== TERMS & CONDITIONS =====
      if (terms_conditions) {
        // Check if we need a new page
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        } else {
          yPos += 40;
        }

        doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
           .text('Terms & Conditions', 50, yPos);
        yPos += 15;
        doc.fontSize(8).fillColor(grayColor).font('Helvetica')
           .text(terms_conditions, 50, yPos, { width: 500 });
      }

      // ===== FOOTER =====
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        // Footer line
        doc.moveTo(50, 730).lineTo(562, 730).strokeColor('#e0e0e0').lineWidth(1).stroke();

        // Footer text
        doc.fontSize(8).fillColor(grayColor).font('Helvetica')
           .text(compName, 50, 740)
           .text(`${compPhone} | ${compEmail}`, 50, 752)
           .text(COMPANY.license, 50, 764);

        // Page number
        doc.fontSize(8).fillColor(grayColor)
           .text(`Page ${i + 1} of ${pageCount}`, 500, 752, { align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Professional Invoice Templates
const invoiceTemplates = {
  // TEMPLATE 1: Classic Professional (White Background)
  classic: (invoice, items, customerName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border: 1px solid #e5e5e5;">
          <!-- Premium Header with Logo -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; text-align: center; border-bottom: 3px solid #f9cb00;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 60px; width: auto; margin-bottom: 15px;">
              <p style="color: #666; margin: 0; font-size: 14px; letter-spacing: 1px;">${COMPANY.tagline}</p>
            </td>
          </tr>

          <!-- Invoice Title -->
          <tr>
            <td style="padding: 40px 40px 20px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h2 style="margin: 0; color: #1a1a2e; font-size: 28px; font-weight: 600;">INVOICE</h2>
                    <p style="margin: 8px 0 0; color: #f9cb00; font-size: 16px; font-weight: 600;">#${invoice.number || invoice.id?.slice(-8)}</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; color: #333; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    <p style="margin: 5px 0 0; color: #333; font-size: 14px;"><strong>Due:</strong> ${invoice.due_date ? new Date(invoice.due_date * 1000).toLocaleDateString() : 'Upon Receipt'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bill To -->
          <tr>
            <td style="padding: 30px 40px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="50%" valign="top">
                    <p style="margin: 0 0 5px; color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Bill To</p>
                    <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: 600;">${customerName || 'Valued Customer'}</p>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">${invoice.customer_email}</p>
                  </td>
                  <td width="50%" valign="top" align="right">
                    <p style="margin: 0 0 5px; color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">From</p>
                    <p style="margin: 0; color: #1a1a2e; font-size: 14px; font-weight: 600;">${COMPANY.name}</p>
                    <p style="margin: 5px 0 0; color: #666; font-size: 13px;">${COMPANY.address}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items Table -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                <tr style="background-color: #f8f8f8; border-bottom: 2px solid #f9cb00;">
                  <td style="padding: 15px; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Description</td>
                  <td style="padding: 15px; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; text-align: center; font-weight: 600;">Qty</td>
                  <td style="padding: 15px; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; text-align: right; font-weight: 600;">Amount</td>
                </tr>
                ${items.map((item, i) => `
                <tr style="background-color: ${i % 2 === 0 ? '#f9f9f9' : '#ffffff'};">
                  <td style="padding: 15px; color: #333; font-size: 14px; border-bottom: 1px solid #eee;">${item.description}</td>
                  <td style="padding: 15px; color: #333; font-size: 14px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
                  <td style="padding: 15px; color: #333; font-size: 14px; border-bottom: 1px solid #eee; text-align: right;">$${(item.amount).toFixed(2)}</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td></td>
                  <td width="220" style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; border: 1px solid #e5e5e5;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #666; font-size: 14px;">Subtotal</td>
                        <td style="color: #333; font-size: 14px; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 10px 0;"><hr style="border: none; border-top: 1px solid #ddd; margin: 0;"></td>
                      </tr>
                      <tr>
                        <td style="color: #1a1a2e; font-size: 20px; font-weight: 700;">TOTAL</td>
                        <td style="color: #1a1a2e; font-size: 20px; font-weight: 700; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pay Button -->
          <tr>
            <td style="padding: 0 40px 40px; text-align: center;">
              <a href="${invoice.hosted_invoice_url}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 18px 50px; border-radius: 50px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(249, 203, 0, 0.4);">Pay Now</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 30px 40px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Questions? Contact us at <a href="mailto:${COMPANY.email}" style="color: #f9cb00; text-decoration: none;">${COMPANY.email}</a></p>
              <p style="margin: 0 0 10px; color: #666; font-size: 14px;">or call <a href="tel:${COMPANY.phone}" style="color: #f9cb00; text-decoration: none;">${COMPANY.phone}</a></p>
              <p style="margin: 20px 0 0; color: #999; font-size: 12px;">${COMPANY.name}<br>${COMPANY.address}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,

  // TEMPLATE 2: Modern Minimal (White Background with Logo)
  modern: (invoice, items, customerName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 60px 20px;">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0">
          <!-- Premium Logo Header -->
          <tr>
            <td style="padding-bottom: 40px; border-bottom: 2px solid #f9cb00;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 50px; width: auto;">
                  </td>
                  <td align="right">
                    <p style="margin: 0; color: #333; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Invoice</p>
                    <p style="margin: 4px 0 0; color: #f9cb00; font-size: 20px; font-weight: 700;">#${invoice.number || invoice.id?.slice(-8)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Date & Customer -->
          <tr>
            <td style="padding: 40px 0;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="50%">
                    <p style="margin: 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Billed To</p>
                    <p style="margin: 10px 0 0; color: #000; font-size: 18px; font-weight: 600;">${customerName || 'Valued Customer'}</p>
                    <p style="margin: 4px 0 0; color: #666; font-size: 14px;">${invoice.customer_email}</p>
                  </td>
                  <td width="50%" align="right">
                    <p style="margin: 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Invoice Date</p>
                    <p style="margin: 10px 0 0; color: #000; font-size: 16px;">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    <p style="margin: 20px 0 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Due Date</p>
                    <p style="margin: 10px 0 0; color: #000; font-size: 16px;">${invoice.due_date ? new Date(invoice.due_date * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Upon Receipt'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td>
              ${items.map((item, i) => `
              <table width="100%" cellspacing="0" cellpadding="0" style="border-bottom: 1px solid #f0f0f0;">
                <tr>
                  <td style="padding: 20px 0;">
                    <p style="margin: 0; color: #000; font-size: 16px; font-weight: 500;">${item.description}</p>
                    <p style="margin: 4px 0 0; color: #888; font-size: 13px;">Qty: ${item.quantity || 1}</p>
                  </td>
                  <td align="right" style="padding: 20px 0;">
                    <p style="margin: 0; color: #000; font-size: 16px; font-weight: 600;">$${(item.amount).toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              `).join('')}
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding: 30px 0;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td></td>
                  <td width="200" align="right">
                    <table cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 8px 20px 8px 0; color: #888; font-size: 14px;">Subtotal</td>
                        <td style="padding: 8px 0; color: #000; font-size: 14px; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 20px 15px 0; color: #000; font-size: 20px; font-weight: 700;">Total</td>
                        <td style="padding: 15px 0; color: #000; font-size: 24px; font-weight: 700; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pay Button -->
          <tr>
            <td style="padding: 20px 0 50px; text-align: center;">
              <a href="${invoice.hosted_invoice_url}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 16px 60px; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Pay Invoice →</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 40px 0; border-top: 1px solid #eee; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 13px;">${COMPANY.name}</p>
              <p style="margin: 8px 0 0; color: #aaa; font-size: 12px;">${COMPANY.address}</p>
              <p style="margin: 8px 0 0; color: #aaa; font-size: 12px;"><a href="mailto:${COMPANY.email}" style="color: #f9cb00; text-decoration: none;">${COMPANY.email}</a> • <a href="tel:${COMPANY.phone}" style="color: #f9cb00; text-decoration: none;">${COMPANY.phone}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,

  // TEMPLATE 3: Premium Luxury (White Background with Gold Accents)
  premium: (invoice, items, customerName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Georgia', 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 50px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 4px; overflow: hidden;">
          <!-- Gold Accent Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #f9cb00, #d4a800, #f9cb00);"></td>
          </tr>

          <!-- Premium Header with Logo -->
          <tr>
            <td style="background-color: #ffffff; padding: 50px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 70px; width: auto; margin-bottom: 20px;">
              <p style="margin: 0; color: #f9cb00; font-size: 12px; letter-spacing: 4px; text-transform: uppercase;">Premium Quality</p>
              <p style="margin: 10px 0 0; color: #666; font-size: 14px; letter-spacing: 2px;">${COMPANY.tagline}</p>
            </td>
          </tr>

          <!-- Invoice Header -->
          <tr>
            <td style="background-color: #fafafa; padding: 40px 50px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin: 0; color: #f9cb00; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; font-weight: 600;">Invoice Number</p>
                    <p style="margin: 8px 0 0; color: #1a1a2e; font-size: 24px; font-weight: 300;">#${invoice.number || invoice.id?.slice(-8)}</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; color: #666; font-size: 13px;">Issue Date: ${new Date().toLocaleDateString()}</p>
                    <p style="margin: 5px 0 0; color: #666; font-size: 13px;">Due: ${invoice.due_date ? new Date(invoice.due_date * 1000).toLocaleDateString() : 'Upon Receipt'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bill To Section -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 50px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="50%" valign="top">
                    <p style="margin: 0; color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Bill To</p>
                    <p style="margin: 15px 0 0; color: #1a1a2e; font-size: 20px; font-weight: 400;">${customerName || 'Valued Client'}</p>
                    <p style="margin: 8px 0 0; color: #666; font-size: 14px;">${invoice.customer_email}</p>
                  </td>
                  <td width="50%" valign="top" align="right">
                    <p style="margin: 0; color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">From</p>
                    <p style="margin: 15px 0 0; color: #1a1a2e; font-size: 14px;">${COMPANY.name}</p>
                    <p style="margin: 5px 0 0; color: #666; font-size: 13px;">${COMPANY.phone}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="background-color: #fafafa; padding: 0;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 20px 50px; border-bottom: 2px solid #f9cb00;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #333; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Description</td>
                        <td style="color: #333; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; text-align: center;" width="80">Qty</td>
                        <td style="color: #333; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; text-align: right;" width="120">Amount</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${items.map(item => `
                <tr>
                  <td style="padding: 25px 50px; border-bottom: 1px solid #e5e5e5; background-color: #ffffff;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #1a1a2e; font-size: 16px;">${item.description}</td>
                        <td style="color: #666; font-size: 14px; text-align: center;" width="80">${item.quantity || 1}</td>
                        <td style="color: #1a1a2e; font-size: 16px; text-align: right;" width="120">$${(item.amount).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); padding: 30px 50px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="color: #1a1a2e; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">Total Amount</td>
                  <td align="right" style="color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pay Button -->
          <tr>
            <td style="background-color: #ffffff; padding: 50px; text-align: center;">
              <a href="${invoice.hosted_invoice_url}" style="display: inline-block; background-color: #1a1a2e; color: #ffffff; text-decoration: none; padding: 18px 60px; font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; border-radius: 4px;">PAY INVOICE</a>
              <p style="margin: 30px 0 0; color: #888; font-size: 13px;">Secure payment powered by Stripe</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 40px 50px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: #1a1a2e; font-size: 12px; font-weight: 600; letter-spacing: 1px;">${COMPANY.name}</p>
              <p style="margin: 15px 0 0; color: #666; font-size: 12px;">${COMPANY.address}</p>
              <p style="margin: 10px 0 0; color: #666; font-size: 12px;">${COMPANY.email} • ${COMPANY.phone}</p>
              <p style="margin: 15px 0 0; color: #999; font-size: 11px;">${COMPANY.license} • Licensed & Insured</p>
              <p style="margin: 20px 0 0; color: #888; font-size: 11px;">Thank you for choosing Surprise Granite for your project.</p>
            </td>
          </tr>

          <!-- Gold Accent Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #f9cb00, #d4a800, #f9cb00);"></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
};

// Generate thank you email with next steps for customers
function generateThankYouEmail(invoice, job) {
  const amount = (invoice.amount_paid / 100).toFixed(2);
  const bookingUrl = `${COMPANY.website}/book/?job=${job.job_number}`;

  return {
    subject: `Thank You for Your Payment - ${COMPANY.shortName} Job #${job.job_number}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 50px; width: auto; margin-bottom: 15px;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 28px; font-weight: 700;">Thank You!</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0; font-size: 14px;">Your payment has been received</p>
            </td>
          </tr>

          <!-- Payment Confirmation -->
          <tr>
            <td style="padding: 40px;">
              <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 20px; margin-bottom: 30px; border-radius: 4px;">
                <p style="margin: 0; color: #2e7d32; font-size: 16px;">
                  <strong style="font-size: 20px;">Payment Confirmed</strong><br>
                  Amount: <strong>$${amount}</strong><br>
                  Job Number: <strong>#${job.job_number}</strong>
                </p>
              </div>

              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 20px;">Hi ${invoice.customer_name || 'Valued Customer'},</h2>

              <p style="margin: 0 0 20px; color: #666; font-size: 15px; line-height: 1.6;">
                Thank you for choosing ${COMPANY.shortName}! We're excited to work on your project. Here's what happens next:
              </p>

              <!-- Next Steps -->
              <div style="background: #f8f9fa; border-radius: 8px; padding: 25px; margin-bottom: 30px;">
                <h3 style="margin: 0 0 20px; color: #1a1a2e; font-size: 16px;">Next Steps:</h3>

                <div style="display: flex; margin-bottom: 15px;">
                  <div style="background: #f9cb00; color: #1a1a2e; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; margin-right: 15px; flex-shrink: 0;">1</div>
                  <div>
                    <strong style="color: #1a1a2e;">Schedule Your Field Measure</strong>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Our team will contact you within 24-48 hours to schedule a time to measure your space.</p>
                  </div>
                </div>

                <div style="display: flex; margin-bottom: 15px;">
                  <div style="background: #f9cb00; color: #1a1a2e; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; margin-right: 15px; flex-shrink: 0;">2</div>
                  <div>
                    <strong style="color: #1a1a2e;">Template & Material Selection</strong>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">We'll create precise templates and confirm your material selection.</p>
                  </div>
                </div>

                <div style="display: flex; margin-bottom: 15px;">
                  <div style="background: #f9cb00; color: #1a1a2e; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; margin-right: 15px; flex-shrink: 0;">3</div>
                  <div>
                    <strong style="color: #1a1a2e;">Fabrication</strong>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Your countertops will be precision-cut and polished in our facility.</p>
                  </div>
                </div>

                <div style="display: flex;">
                  <div style="background: #f9cb00; color: #1a1a2e; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; margin-right: 15px; flex-shrink: 0;">4</div>
                  <div>
                    <strong style="color: #1a1a2e;">Installation</strong>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Professional installation by our expert team.</p>
                  </div>
                </div>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 30px;">
                <a href="${bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 15px rgba(249, 203, 0, 0.3);">Schedule Field Measure</a>
              </div>

              <!-- Contact Info -->
              <div style="border-top: 1px solid #eee; padding-top: 25px;">
                <p style="margin: 0 0 10px; color: #1a1a2e; font-weight: 600;">Questions? We're here to help!</p>
                <p style="margin: 0; color: #666; font-size: 14px;">
                  <strong>Phone:</strong> <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; text-decoration: none;">${COMPANY.phone}</a><br>
                  <strong>Email:</strong> <a href="mailto:${COMPANY.email}" style="color: #1a1a2e; text-decoration: none;">${COMPANY.email}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 25px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 5px; color: #1a1a2e; font-weight: 600;">${COMPANY.name}</p>
              <p style="margin: 0 0 5px; color: #888; font-size: 13px;">${COMPANY.address}</p>
              <p style="margin: 0; color: #888; font-size: 12px;">${COMPANY.license} | Licensed & Insured</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  };
}

// Generate material order email
function generateMaterialOrderEmail(order, job) {
  return {
    subject: `Material Order Request - Job #${job.job_number} - ${order.material_name}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <div style="background: #1a1a2e; color: #f9cb00; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">Material Order Request</h1>
    </div>

    <div style="padding: 30px;">
      <table width="100%" cellspacing="0" cellpadding="8" style="border-collapse: collapse;">
        <tr style="background: #f8f9fa;">
          <td style="border: 1px solid #ddd; font-weight: bold; width: 40%;">Job Number:</td>
          <td style="border: 1px solid #ddd;">#${job.job_number}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; font-weight: bold;">Customer:</td>
          <td style="border: 1px solid #ddd;">${job.customer_name}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="border: 1px solid #ddd; font-weight: bold;">Material:</td>
          <td style="border: 1px solid #ddd; font-size: 16px; color: #1a1a2e;"><strong>${order.material_name}</strong></td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; font-weight: bold;">Color:</td>
          <td style="border: 1px solid #ddd;">${order.material_color || 'As specified'}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="border: 1px solid #ddd; font-weight: bold;">Thickness:</td>
          <td style="border: 1px solid #ddd;">${order.material_thickness || '3cm'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; font-weight: bold;">Quantity:</td>
          <td style="border: 1px solid #ddd;">${order.quantity} ${order.unit || 'slab(s)'}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="border: 1px solid #ddd; font-weight: bold;">Supplier:</td>
          <td style="border: 1px solid #ddd;">${order.supplier}</td>
        </tr>
        ${order.notes ? `
        <tr>
          <td style="border: 1px solid #ddd; font-weight: bold;">Notes:</td>
          <td style="border: 1px solid #ddd;">${order.notes}</td>
        </tr>
        ` : ''}
      </table>

      <div style="margin-top: 30px; padding: 20px; background: #fff8e1; border-left: 4px solid #f9cb00; border-radius: 4px;">
        <p style="margin: 0; color: #333;">
          <strong>Ship To:</strong><br>
          ${COMPANY.name}<br>
          ${COMPANY.address}
        </p>
      </div>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="margin: 0; color: #666; font-size: 14px;">
          <strong>Contact:</strong> ${COMPANY.phone}<br>
          <strong>Email:</strong> ${COMPANY.email}
        </p>
      </div>
    </div>

  </div>
</body>
</html>
`
  };
}

// Generate contractor job invite email
function generateContractorInviteEmail(contractor, job, inviteToken) {
  const acceptUrl = `${COMPANY.website}/contractor/job/?token=${inviteToken}`;

  return {
    subject: `New Job Assignment - ${COMPANY.shortName} Job #${job.job_number}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 35px; text-align: center;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 45px; width: auto; margin-bottom: 10px;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 24px;">New Job Assignment</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333; font-size: 16px;">Hi ${contractor.name},</p>

              <p style="margin: 0 0 25px; color: #666; font-size: 15px; line-height: 1.6;">
                You've been assigned to a new job. Please review the details below and accept or decline.
              </p>

              <!-- Job Details -->
              <div style="background: #f8f9fa; border-radius: 8px; padding: 25px; margin-bottom: 30px;">
                <h3 style="margin: 0 0 15px; color: #1a1a2e; font-size: 18px;">Job #${job.job_number}</h3>

                <table width="100%" cellspacing="0" cellpadding="8">
                  <tr>
                    <td style="color: #888; font-size: 13px; padding: 5px 0;">Customer:</td>
                    <td style="color: #333; font-size: 14px; font-weight: 500;">${job.customer_name}</td>
                  </tr>
                  <tr>
                    <td style="color: #888; font-size: 13px; padding: 5px 0;">Location:</td>
                    <td style="color: #333; font-size: 14px;">${job.job_address || job.customer_address || 'TBD'}</td>
                  </tr>
                  <tr>
                    <td style="color: #888; font-size: 13px; padding: 5px 0;">Project:</td>
                    <td style="color: #333; font-size: 14px;">${job.project_description || job.project_type || 'Countertop Installation'}</td>
                  </tr>
                  ${job.material_name ? `
                  <tr>
                    <td style="color: #888; font-size: 13px; padding: 5px 0;">Material:</td>
                    <td style="color: #333; font-size: 14px;">${job.material_name}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <!-- Action Buttons -->
              <div style="text-align: center; margin-bottom: 30px;">
                <a href="${acceptUrl}&action=accept" style="display: inline-block; background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%); color: #fff; text-decoration: none; padding: 14px 35px; border-radius: 50px; font-size: 15px; font-weight: 600; margin-right: 10px;">Accept Job</a>
                <a href="${acceptUrl}&action=decline" style="display: inline-block; background: #f5f5f5; color: #666; text-decoration: none; padding: 14px 35px; border-radius: 50px; font-size: 15px; font-weight: 600; border: 1px solid #ddd;">Decline</a>
              </div>

              <p style="margin: 0; color: #888; font-size: 13px; text-align: center;">
                This invitation expires in 48 hours.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; color: #888; font-size: 12px;">
                ${COMPANY.name} | ${COMPANY.phone}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  };
}

// Admin notification templates
const emailTemplates = {
  invoiceSent: (invoice, template = 'classic') => ({
    subject: `Invoice #${invoice.number} Sent - ${COMPANY.shortName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e5e5e5;">
          <tr>
            <td style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 3px solid #f9cb00;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 50px; width: auto;">
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                <p style="margin: 0; color: #2e7d32; font-weight: 600;">✓ Invoice Sent Successfully</p>
              </div>
              <p style="margin: 0 0 20px; color: #333; font-size: 15px;">Invoice <strong>#${invoice.number}</strong> has been sent to:</p>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Customer Email</p>
                <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: 600;">${invoice.customer_email}</p>
              </div>
              <table width="100%" style="margin-bottom: 25px;">
                <tr>
                  <td style="background: #fff8e1; padding: 20px; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 5px; color: #f57c00; font-size: 12px; text-transform: uppercase;">Amount Due</p>
                    <p style="margin: 0; color: #e65100; font-size: 28px; font-weight: 700;">$${(invoice.amount_due / 100).toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              <a href="${invoice.hosted_invoice_url}" style="display: block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 15px; border-radius: 8px; text-align: center; font-weight: 600;">View Invoice</a>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">${COMPANY.name}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  }),

  paymentReceived: (invoice) => ({
    subject: `Payment Received - Invoice #${invoice.number} | Surprise Granite`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e5e5e5;">

          <!-- Premium Header with Logo -->
          <tr>
            <td style="background-color: #ffffff; padding: 30px 40px; border-bottom: 3px solid #f9cb00;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 45px; width: auto;">
                  </td>
                  <td style="vertical-align: middle; text-align: right;">
                    <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Payment Receipt</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Bar -->
          <tr>
            <td style="background-color: #16a34a; padding: 14px 40px;">
              <p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 500;">
                <span style="margin-right: 8px;">&#10003;</span>
                Payment successfully received
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Invoice Info -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Invoice Number</p>
                    <p style="margin: 0; color: #1a2b3c; font-size: 18px; font-weight: 600; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">#${invoice.number}</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr><td style="border-bottom: 1px solid #e5e7eb;"></td></tr>
              </table>

              <!-- Amount -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="background-color: #f0fdf4; padding: 28px; border-radius: 6px; border: 1px solid #bbf7d0;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin: 0 0 4px; color: #166534; font-size: 13px;">Amount Received</p>
                          <p style="margin: 0; color: #15803d; font-size: 36px; font-weight: 700;">$${(invoice.amount_paid / 100).toFixed(2)}</p>
                        </td>
                        <td style="text-align: right; vertical-align: bottom;">
                          <p style="margin: 0; color: #16a34a; font-size: 13px; font-weight: 500;">Received</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Customer -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Customer</p>
                    <p style="margin: 0; color: #1a2b3c; font-size: 15px;">${invoice.customer_email}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${invoice.hosted_invoice_url}" style="display: inline-block; background-color: #1a2b3c; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 14px; font-weight: 500;">View Full Receipt</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 28px 40px; border-top: 1px solid #e5e7eb;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; color: #1a2b3c; font-size: 14px; font-weight: 600;">Questions about this payment?</p>
                    <p style="margin: 0; color: #6b7280; font-size: 13px;">
                      <a href="mailto:${COMPANY.email}" style="color: #1a2b3c; text-decoration: none;">${COMPANY.email}</a>
                      <span style="color: #d1d5db; margin: 0 8px;">|</span>
                      <a href="tel:${COMPANY.phone}" style="color: #1a2b3c; text-decoration: none;">${COMPANY.phone}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Legal Footer -->
          <tr>
            <td style="background-color: #1a2b3c; padding: 20px 40px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; color: rgba(255,255,255,0.8); font-size: 12px;">${COMPANY.shortName}</p>
                    <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 11px;">${COMPANY.address}</p>
                  </td>
                  <td style="text-align: right;">
                    <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 11px;">AZ ROC# 341113</p>
                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.4); font-size: 10px;">Licensed & Insured</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Bottom Note -->
        <table width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding: 20px 0; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated receipt from Surprise Granite. Please keep for your records.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  }),

  paymentFailed: (invoice) => ({
    subject: `⚠️ Payment Failed - Invoice #${invoice.number}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e5e5e5;">
          <tr>
            <td style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 3px solid #f9cb00;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 50px; width: auto;">
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                <p style="margin: 0; color: #c62828; font-weight: 600;">⚠️ Payment Failed</p>
              </div>
              <p style="margin: 0 0 20px; color: #333; font-size: 15px;">The payment for Invoice <strong>#${invoice.number}</strong> was declined.</p>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <table width="100%">
                  <tr>
                    <td style="color: #666; font-size: 13px; padding: 5px 0;">Customer:</td>
                    <td style="color: #1a1a2e; font-size: 14px; font-weight: 600; text-align: right;">${invoice.customer_email}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 13px; padding: 5px 0;">Amount:</td>
                    <td style="color: #c62828; font-size: 14px; font-weight: 600; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">Please follow up with the customer to arrange an alternative payment method.</p>
              <a href="${invoice.hosted_invoice_url}" style="display: block; background: #1a1a2e; color: #fff; text-decoration: none; padding: 15px; border-radius: 8px; text-align: center; font-weight: 600;">View Invoice</a>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">${COMPANY.name}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  }),

  // Customer invoice email - uses selected template
  invoiceCustomer: (invoice, items, customerName, templateName = 'classic') => ({
    subject: `Invoice #${invoice.number} from ${COMPANY.name}`,
    html: getInvoiceTemplate(templateName, invoice, items, customerName)
  })
};

// Get invoice template by name
function getInvoiceTemplate(templateName, invoice, items, customerName) {
  const template = invoiceTemplates[templateName] || invoiceTemplates.classic;
  return template(invoice, items, customerName);
}

// CORS Middleware
app.use(cors({
  origin: [
    'https://www.surprisegranite.com',
    'https://surprisegranite.com',
    'https://surprise-granite-site.onrender.com',
    'http://localhost:3000',
    'http://localhost:8888',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============ WEBHOOK HANDLER (MUST BE BEFORE express.json()) ============
// Stripe webhooks require raw body for signature verification
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Dev mode without signature verification
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Webhook event received:', event.type);

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Cart checkout completed successfully
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);
        console.log('Customer email:', session.customer_details?.email);
        console.log('Amount total:', session.amount_total / 100);

        // Send order confirmation to customer
        if (session.customer_details?.email) {
          const orderEmail = {
            subject: `Order Confirmed - Surprise Granite #SG-${session.id.slice(-8).toUpperCase()}`,
            html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e5e5e5;">
          <tr>
            <td style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 3px solid #f9cb00;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 50px; width: auto;">
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; text-align: center;">
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 25px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px; color: #fff; line-height: 80px;">✓</span>
              </div>
              <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 24px; font-weight: 600;">Order Confirmed!</h2>
              <p style="margin: 0 0 5px; color: #f9cb00; font-size: 16px; font-weight: 600;">Order #SG-${session.id.slice(-8).toUpperCase()}</p>
              <p style="margin: 0 0 30px; color: #666; font-size: 15px;">Thank you for your purchase!</p>
              <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #e5e5e5;">
                <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Order Total</p>
                <p style="margin: 0; color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(session.amount_total / 100).toFixed(2)}</p>
              </div>
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">We're preparing your order and will send you shipping information once it's on its way.</p>
              <a href="https://www.surprisegranite.com/shop" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 15px 35px; border-radius: 8px; font-weight: 600;">Continue Shopping</a>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f8f8; padding: 25px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Questions about your order?</p>
              <p style="margin: 0; color: #888; font-size: 13px;"><a href="mailto:${COMPANY.email}" style="color: #1a1a2e; text-decoration: none; font-weight: 500;">${COMPANY.email}</a> • <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; text-decoration: none; font-weight: 500;">${COMPANY.phone}</a></p>
              <p style="margin: 15px 0 0; color: #999; font-size: 11px;">${COMPANY.license} • Licensed & Insured</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
          };
          await sendNotification(session.customer_details.email, orderEmail.subject, orderEmail.html);
        }

        // Notify admin of new order
        const adminOrderEmail = {
          subject: `New Order Received - #SG-${session.id.slice(-8).toUpperCase()} - $${(session.amount_total / 100).toFixed(2)}`,
          html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <h2 style="color: #1a1a2e;">New Order Received!</h2>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Order ID:</strong> #SG-${session.id.slice(-8).toUpperCase()}</p>
    <p><strong>Session ID:</strong> ${session.id}</p>
    <p><strong>Customer:</strong> ${session.customer_details?.name || 'N/A'}</p>
    <p><strong>Email:</strong> ${session.customer_details?.email || 'N/A'}</p>
    <p><strong>Amount:</strong> $${(session.amount_total / 100).toFixed(2)}</p>
    <p><strong>Payment Status:</strong> ${session.payment_status}</p>
  </div>
  <p>View details in your <a href="https://dashboard.stripe.com/payments/${session.payment_intent}">Stripe Dashboard</a></p>
</body>
</html>`
        };
        await sendNotification(ADMIN_EMAIL, adminOrderEmail.subject, adminOrderEmail.html);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('Invoice paid:', invoice.id);

        // Send admin notification
        const paidEmail = emailTemplates.paymentReceived(invoice);
        await sendNotification(ADMIN_EMAIL, paidEmail.subject, paidEmail.html);

        // Auto-create customer and job record in Supabase
        if (supabase && invoice.customer_email) {
          try {
            // Get admin user ID (first admin in system)
            const { data: adminUser } = await supabase
              .from('sg_users')
              .select('id')
              .eq('account_type', 'admin')
              .limit(1)
              .single();

            const adminUserId = adminUser?.id;

            if (adminUserId) {
              // Create or find customer
              let customerId = null;
              const { data: existingCustomer } = await supabase
                .from('customers')
                .select('id')
                .eq('user_id', adminUserId)
                .eq('email', invoice.customer_email)
                .single();

              if (existingCustomer) {
                customerId = existingCustomer.id;
              } else {
                const { data: newCustomer, error: custErr } = await supabase
                  .from('customers')
                  .insert({
                    user_id: adminUserId,
                    name: invoice.customer_name || 'Customer',
                    email: invoice.customer_email,
                    phone: invoice.customer_phone,
                    stripe_customer_id: invoice.customer,
                    source: 'invoice_payment'
                  })
                  .select()
                  .single();

                if (!custErr && newCustomer) {
                  customerId = newCustomer.id;
                  console.log('Created customer:', customerId);
                }
              }

              // Generate job number
              const { data: settings } = await supabase
                .from('business_settings')
                .select('job_prefix, job_next_number')
                .eq('user_id', adminUserId)
                .single();

              const jobPrefix = settings?.job_prefix || 'JOB-';
              const jobNum = settings?.job_next_number || 1001;
              const jobNumber = `${jobPrefix}${jobNum}`;

              // Update next job number
              await supabase
                .from('business_settings')
                .upsert({
                  user_id: adminUserId,
                  job_prefix: jobPrefix,
                  job_next_number: jobNum + 1
                }, { onConflict: 'user_id' });

              // Get line items from invoice
              let projectDescription = '';
              if (invoice.lines?.data) {
                projectDescription = invoice.lines.data
                  .map(line => line.description)
                  .filter(Boolean)
                  .join(', ');
              }

              // Create job record
              const { data: newJob, error: jobErr } = await supabase
                .from('jobs')
                .insert({
                  user_id: adminUserId,
                  job_number: jobNumber,
                  customer_id: customerId,
                  customer_name: invoice.customer_name || 'Customer',
                  customer_email: invoice.customer_email,
                  customer_phone: invoice.customer_phone,
                  project_description: projectDescription || `Invoice #${invoice.number}`,
                  contract_amount: invoice.amount_paid / 100,
                  total_paid: invoice.amount_paid / 100,
                  deposit_paid: true,
                  deposit_paid_at: new Date().toISOString(),
                  stripe_invoice_id: invoice.id,
                  status: 'new'
                })
                .select()
                .single();

              if (!jobErr && newJob) {
                console.log('Created job:', newJob.job_number);

                // Send thank you email to customer with next steps
                const thankYouEmail = generateThankYouEmail(invoice, newJob);
                await sendNotification(invoice.customer_email, thankYouEmail.subject, thankYouEmail.html);
                console.log('Thank you email sent to customer:', invoice.customer_email);
              } else if (jobErr) {
                console.error('Error creating job:', jobErr.message);
              }
            }
          } catch (dbErr) {
            console.error('Database error in invoice.paid:', dbErr.message);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('Invoice payment failed:', invoice.id);
        const failedEmail = emailTemplates.paymentFailed(invoice);
        await sendNotification(ADMIN_EMAIL, failedEmail.subject, failedEmail.html);
        break;
      }

      case 'invoice.sent':
        console.log('Invoice sent:', event.data.object.id);
        break;

      case 'invoice.finalized':
        console.log('Invoice finalized:', event.data.object.id);
        break;

      case 'account.updated':
        console.log('Connect account updated:', event.data.object.id);
        break;

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('Payment intent succeeded:', paymentIntent.id);
        console.log('Amount:', paymentIntent.amount / 100);

        // Send order confirmation if we have shipping/customer details
        const shipping = paymentIntent.shipping;
        const receiptEmail = paymentIntent.receipt_email || paymentIntent.metadata?.customer_email;

        if (receiptEmail) {
          const orderDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          const orderEmail = {
            subject: `Order Confirmed - Surprise Granite #SG-${paymentIntent.id.slice(-8).toUpperCase()}`,
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f8f8;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color: #1a2b3c; padding: 30px 40px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <table cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 14px;">
                          <svg viewBox="0 0 122 125" width="42" height="42" style="display: block;">
                            <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#f9cb00"/>
                            <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#f9cb00"/>
                            <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#f9cb00"/>
                            <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#f9cb00"/>
                          </svg>
                        </td>
                        <td style="vertical-align: middle;">
                          <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">SURPRISE GRANITE</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align: middle; text-align: right;">
                    <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 12px;">Order Confirmation</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Bar -->
          <tr>
            <td style="background-color: #16a34a; padding: 14px 40px;">
              <p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 500;">
                <span style="margin-right: 8px;">&#10003;</span>
                Payment successful - Thank you for your order
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Order Info -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</p>
                    <p style="margin: 0; color: #1a2b3c; font-size: 18px; font-weight: 600; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">#SG-${paymentIntent.id.slice(-8).toUpperCase()}</p>
                  </td>
                  <td style="text-align: right;">
                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Date</p>
                    <p style="margin: 0; color: #1a2b3c; font-size: 14px;">${orderDate}</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr><td style="border-bottom: 1px solid #e5e7eb;"></td></tr>
              </table>

              <!-- Amount -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="background-color: #f9fafb; padding: 28px; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Amount Paid</p>
                          <p style="margin: 0; color: #1a2b3c; font-size: 32px; font-weight: 700;">$${(paymentIntent.amount / 100).toFixed(2)}</p>
                        </td>
                        <td style="text-align: right; vertical-align: bottom;">
                          <p style="margin: 0; color: #16a34a; font-size: 13px; font-weight: 500;">Paid</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${shipping ? `
              <!-- Shipping Address -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Shipping Address</p>
                    <p style="margin: 0; color: #1a2b3c; font-size: 15px; line-height: 1.6;">
                      <strong>${shipping.name}</strong><br>
                      ${shipping.address?.line1}${shipping.address?.line2 ? '<br>' + shipping.address.line2 : ''}<br>
                      ${shipping.address?.city}, ${shipping.address?.state} ${shipping.address?.postal_code}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr><td style="border-bottom: 1px solid #e5e7eb;"></td></tr>
              </table>
              ` : ''}

              <!-- Next Steps -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 16px; color: #1a2b3c; font-size: 15px; font-weight: 600;">What's Next</p>
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 10px 0; vertical-align: top; width: 28px;">
                          <div style="width: 20px; height: 20px; background-color: #f9cb00; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 600; color: #1a2b3c;">1</div>
                        </td>
                        <td style="padding: 10px 0; padding-left: 12px;">
                          <p style="margin: 0; color: #374151; font-size: 14px;">We're preparing your order</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; vertical-align: top; width: 28px;">
                          <div style="width: 20px; height: 20px; background-color: #e5e7eb; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 600; color: #6b7280;">2</div>
                        </td>
                        <td style="padding: 10px 0; padding-left: 12px;">
                          <p style="margin: 0; color: #374151; font-size: 14px;">You'll receive tracking information via email</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; vertical-align: top; width: 28px;">
                          <div style="width: 20px; height: 20px; background-color: #e5e7eb; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 600; color: #6b7280;">3</div>
                        </td>
                        <td style="padding: 10px 0; padding-left: 12px;">
                          <p style="margin: 0; color: #374151; font-size: 14px;">Your order will arrive within 5-7 business days</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://www.surprisegranite.com/shop" style="display: inline-block; background-color: #1a2b3c; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 14px; font-weight: 500;">Continue Shopping</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 28px 40px; border-top: 1px solid #e5e7eb;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; color: #1a2b3c; font-size: 14px; font-weight: 600;">Questions?</p>
                    <p style="margin: 0; color: #6b7280; font-size: 13px;">
                      <a href="mailto:${COMPANY.email}" style="color: #1a2b3c; text-decoration: none;">${COMPANY.email}</a>
                      <span style="color: #d1d5db; margin: 0 8px;">|</span>
                      <a href="tel:${COMPANY.phone}" style="color: #1a2b3c; text-decoration: none;">${COMPANY.phone}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Legal Footer -->
          <tr>
            <td style="background-color: #1a2b3c; padding: 20px 40px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; color: rgba(255,255,255,0.8); font-size: 12px;">${COMPANY.shortName}</p>
                    <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 11px;">${COMPANY.address}</p>
                  </td>
                  <td style="text-align: right;">
                    <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 11px;">AZ ROC# 341113</p>
                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.4); font-size: 10px;">Licensed & Insured</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Bottom Note -->
        <table width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding: 20px 0; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated confirmation for your order with ${COMPANY.shortName}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
          };
          await sendNotification(receiptEmail, orderEmail.subject, orderEmail.html);
        }

        // Notify admin
        const adminOrderEmail = {
          subject: `New Order - #SG-${paymentIntent.id.slice(-8).toUpperCase()} - $${(paymentIntent.amount / 100).toFixed(2)}`,
          html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <h2 style="color: #1a1a2e;">New Order Received!</h2>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Order ID:</strong> #SG-${paymentIntent.id.slice(-8).toUpperCase()}</p>
    <p><strong>Payment Intent:</strong> ${paymentIntent.id}</p>
    <p><strong>Customer:</strong> ${shipping?.name || 'N/A'}</p>
    <p><strong>Email:</strong> ${receiptEmail || 'N/A'}</p>
    <p><strong>Amount:</strong> $${(paymentIntent.amount / 100).toFixed(2)}</p>
    <p><strong>Status:</strong> ${paymentIntent.status}</p>
    ${shipping ? `
    <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
    <p><strong>Shipping Address:</strong></p>
    <p>${shipping.name}<br>
    ${shipping.address?.line1}${shipping.address?.line2 ? '<br>' + shipping.address.line2 : ''}<br>
    ${shipping.address?.city}, ${shipping.address?.state} ${shipping.address?.postal_code}</p>
    ` : ''}
  </div>
  <p>View details in your <a href="https://dashboard.stripe.com/payments/${paymentIntent.id}">Stripe Dashboard</a></p>
</body>
</html>`
        };
        await sendNotification(ADMIN_EMAIL, adminOrderEmail.subject, adminOrderEmail.html);
        break;
      }

      case 'payment_intent.payment_failed':
        console.log('Payment intent failed:', event.data.object.id);
        break;

      // ============ VENDOR SUBSCRIPTION EVENTS ============
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const vendorId = subscription.metadata?.vendor_id;
        if (vendorId) {
          console.log('Vendor subscription created:', subscription.id, 'Vendor:', vendorId);
          // Notify admin of new vendor subscription
          const subEmail = {
            subject: `New Vendor Subscription - ${subscription.metadata?.plan || 'Unknown'} Plan`,
            html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <h2 style="color: #1a1a2e;">New Vendor Subscription!</h2>
  <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; color: #2e7d32; font-weight: 600;">A new vendor has subscribed!</p>
  </div>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <p><strong>Vendor ID:</strong> ${vendorId}</p>
    <p><strong>Plan:</strong> ${subscription.metadata?.plan || 'Unknown'}</p>
    <p><strong>Leads/Month:</strong> ${subscription.metadata?.leads_per_month || '0'}</p>
    <p><strong>Subscription ID:</strong> ${subscription.id}</p>
    <p><strong>Status:</strong> ${subscription.status}</p>
  </div>
  <p>View in your <a href="https://dashboard.stripe.com/subscriptions/${subscription.id}">Stripe Dashboard</a></p>
</body>
</html>`
          };
          await sendNotification(ADMIN_EMAIL, subEmail.subject, subEmail.html);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const vendorId = subscription.metadata?.vendor_id;
        if (vendorId) {
          console.log('Vendor subscription updated:', subscription.id, 'Status:', subscription.status);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const vendorId = subscription.metadata?.vendor_id;
        if (vendorId) {
          console.log('Vendor subscription canceled:', subscription.id, 'Vendor:', vendorId);
          // Notify admin of cancellation
          const cancelEmail = {
            subject: `Vendor Subscription Canceled - ${subscription.metadata?.plan || 'Unknown'} Plan`,
            html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <h2 style="color: #c62828;">Vendor Subscription Canceled</h2>
  <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; color: #c62828;">A vendor has canceled their subscription.</p>
  </div>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <p><strong>Vendor ID:</strong> ${vendorId}</p>
    <p><strong>Plan:</strong> ${subscription.metadata?.plan || 'Unknown'}</p>
    <p><strong>Subscription ID:</strong> ${subscription.id}</p>
  </div>
</body>
</html>`
          };
          await sendNotification(ADMIN_EMAIL, cancelEmail.subject, cancelEmail.html);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook event:', err);
  }

  res.json({ received: true });
});

// JSON body parser - AFTER webhook route
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Surprise Granite API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ============ TEST EMAIL ENDPOINT ============
app.post('/api/test-email', async (req, res) => {
  try {
    const { email, type = 'order_confirmation' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let emailContent;

    if (type === 'order_confirmation') {
      emailContent = {
        subject: `Test Order Confirmation - Surprise Granite #SG-TEST123`,
        html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e5e5e5;">
          <tr>
            <td style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 3px solid #f9cb00;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 50px; width: auto;">
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; text-align: center;">
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 25px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px; color: #fff; line-height: 80px;">✓</span>
              </div>
              <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 24px; font-weight: 600;">Test Email - New Design!</h2>
              <p style="margin: 0 0 5px; color: #f9cb00; font-size: 16px; font-weight: 600;">Order #SG-TEST123</p>
              <p style="margin: 0 0 30px; color: #666; font-size: 15px;">This is a test of the new premium email template.</p>
              <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #e5e5e5;">
                <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Sample Total</p>
                <p style="margin: 0; color: #1a1a2e; font-size: 32px; font-weight: 700;">$1,234.56</p>
              </div>
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">White background with premium gold accents and branded logo header.</p>
              <a href="https://www.surprisegranite.com" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 15px 35px; border-radius: 8px; font-weight: 600;">Visit Website</a>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f8f8; padding: 25px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Questions? Contact us:</p>
              <p style="margin: 0; color: #888; font-size: 13px;"><a href="mailto:${COMPANY.email}" style="color: #1a1a2e; text-decoration: none; font-weight: 500;">${COMPANY.email}</a> • <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; text-decoration: none; font-weight: 500;">${COMPANY.phone}</a></p>
              <p style="margin: 15px 0 0; color: #999; font-size: 11px;">${COMPANY.license} • Licensed & Insured</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
      };
    } else if (type === 'invoice') {
      emailContent = emailTemplates.paymentReceived({
        number: 'TEST-001',
        amount_paid: 150000,
        customer_email: email,
        hosted_invoice_url: 'https://www.surprisegranite.com'
      });
    }

    const result = await sendNotification(email, emailContent.subject, emailContent.html);

    if (result.success) {
      res.json({ success: true, message: `Test email sent to ${email}` });
    } else {
      res.status(500).json({ success: false, error: result.reason });
    }
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ CUSTOMER MANAGEMENT ============

// Create or get a Stripe customer
app.post('/api/customers', async (req, res) => {
  try {
    const { email, name, phone, metadata } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      // Update existing customer
      const customer = await stripe.customers.update(existingCustomers.data[0].id, {
        name: name || existingCustomers.data[0].name,
        phone: phone || existingCustomers.data[0].phone,
        metadata: { ...existingCustomers.data[0].metadata, ...metadata }
      });
      return res.json({ customer, isNew: false });
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      phone,
      metadata: {
        source: 'surprise_granite_portal',
        ...metadata
      }
    });

    res.json({ customer, isNew: true });
  } catch (error) {
    console.error('Customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer by email
app.get('/api/customers/:email', async (req, res) => {
  try {
    const customers = await stripe.customers.list({
      email: req.params.email,
      limit: 1
    });

    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer: customers.data[0] });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CHECKOUT SESSION ============

// Create a Stripe Checkout Session for cart purchases
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { items, success_url, cancel_url, customer_email } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Build line items for Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
          metadata: {
            product_id: item.id || ''
          }
        },
        unit_amount: item.price // Price should already be in cents
      },
      quantity: item.quantity || 1
    }));

    // Create checkout session config
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: success_url || `${process.env.SITE_URL || 'https://surprisegranite.com'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.SITE_URL || 'https://surprisegranite.com'}/cart/`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      metadata: {
        order_source: 'website_cart'
      }
    };

    // Add customer email if provided
    if (customer_email) {
      sessionConfig.customer_email = customer_email;
    }

    // Create the session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('Checkout session created:', session.id);

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ PAYMENT INTENT (for Payment Element) ============

// Create a PaymentIntent for embedded checkout with Payment Element
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, items, metadata, customer_email } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Build payment intent config
    const paymentIntentConfig = {
      amount: Math.round(amount), // Should already be in cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        order_source: 'website_checkout',
        items_count: items?.length || 0,
        ...metadata
      }
    };

    // If customer email provided, find or create customer
    if (customer_email) {
      const existingCustomers = await stripe.customers.list({ email: customer_email, limit: 1 });

      if (existingCustomers.data.length > 0) {
        paymentIntentConfig.customer = existingCustomers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: customer_email,
          metadata: { source: 'surprise_granite_checkout' }
        });
        paymentIntentConfig.customer = customer.id;
      }
    }

    // Create the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig);

    console.log('PaymentIntent created:', paymentIntent.id, 'Amount:', amount / 100);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('PaymentIntent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ INVOICE MANAGEMENT ============

// Create and send an invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const {
      customer_email,
      customer_name,
      customer_phone,
      items,
      description,
      notes,
      due_days = 30,
      auto_send = true,
      template = 'classic'  // classic, modern, or premium
    } = req.body;

    if (!customer_email || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer email and at least one item are required' });
    }

    // Get or create customer
    let customer;
    const existingCustomers = await stripe.customers.list({ email: customer_email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customer_email,
        name: customer_name,
        phone: customer_phone,
        metadata: { source: 'surprise_granite_invoice' }
      });
    }

    // Create invoice with card + ACH bank transfer payment options
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: due_days,
      description,
      footer: notes || 'Thank you for your business! - Surprise Granite',
      payment_settings: {
        payment_method_types: ['card', 'us_bank_account'],
        payment_method_options: {
          us_bank_account: {
            financial_connections: {
              permissions: ['payment_method']
            }
          }
        }
      },
      metadata: {
        source: 'surprise_granite_portal',
        created_by: 'admin'
      }
    });

    // Add invoice items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        description: item.description,
        quantity: item.quantity || 1,
        unit_amount: Math.round(item.amount * 100) // Convert to cents
      });
    }

    // Finalize and optionally send the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    if (auto_send) {
      await stripe.invoices.sendInvoice(invoice.id);

      // Send email notifications to admin
      const emailData = emailTemplates.invoiceSent(finalizedInvoice, template);
      await sendNotification(ADMIN_EMAIL, emailData.subject, emailData.html);

      // Send branded invoice email to customer using selected template
      const customerEmailData = emailTemplates.invoiceCustomer(
        finalizedInvoice,
        items,
        customer_name,
        template
      );
      await sendNotification(customer_email, customerEmailData.subject, customerEmailData.html);
    }

    res.json({
      success: true,
      invoice: {
        id: finalizedInvoice.id,
        number: finalizedInvoice.number,
        amount_due: finalizedInvoice.amount_due / 100,
        status: finalizedInvoice.status,
        hosted_invoice_url: finalizedInvoice.hosted_invoice_url,
        pdf: finalizedInvoice.invoice_pdf,
        customer_email: customer_email
      }
    });
  } catch (error) {
    console.error('Invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all invoices (with optional filters)
app.get('/api/invoices', async (req, res) => {
  try {
    const { customer_email, status, limit = 20 } = req.query;

    let params = { limit: parseInt(limit) };

    if (customer_email) {
      const customers = await stripe.customers.list({ email: customer_email, limit: 1 });
      if (customers.data.length > 0) {
        params.customer = customers.data[0].id;
      }
    }

    if (status) {
      params.status = status;
    }

    const invoices = await stripe.invoices.list(params);

    res.json({
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number,
        customer_email: inv.customer_email,
        customer_name: inv.customer_name,
        amount_due: inv.amount_due / 100,
        amount_paid: inv.amount_paid / 100,
        status: inv.status,
        created: new Date(inv.created * 1000).toISOString(),
        due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        hosted_invoice_url: inv.hosted_invoice_url,
        pdf: inv.invoice_pdf
      }))
    });
  } catch (error) {
    console.error('List invoices error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single invoice
app.get('/api/invoices/:id', async (req, res) => {
  try {
    const invoice = await stripe.invoices.retrieve(req.params.id, {
      expand: ['lines.data']
    });

    res.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        customer_email: invoice.customer_email,
        customer_name: invoice.customer_name,
        amount_due: invoice.amount_due / 100,
        amount_paid: invoice.amount_paid / 100,
        status: invoice.status,
        description: invoice.description,
        created: new Date(invoice.created * 1000).toISOString(),
        due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        hosted_invoice_url: invoice.hosted_invoice_url,
        pdf: invoice.invoice_pdf,
        items: invoice.lines.data.map(line => ({
          description: line.description,
          quantity: line.quantity,
          amount: line.amount / 100
        }))
      }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send reminder for an invoice
app.post('/api/invoices/:id/remind', async (req, res) => {
  try {
    const invoice = await stripe.invoices.sendInvoice(req.params.id);
    res.json({ success: true, message: 'Reminder sent', invoice_id: invoice.id });
  } catch (error) {
    console.error('Remind invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Void an invoice
app.post('/api/invoices/:id/void', async (req, res) => {
  try {
    const invoice = await stripe.invoices.voidInvoice(req.params.id);
    res.json({ success: true, message: 'Invoice voided', status: invoice.status });
  } catch (error) {
    console.error('Void invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ QUICK PAYMENT LINKS ============

// Create a payment link for quick payments
app.post('/api/payment-links', async (req, res) => {
  try {
    const { amount, description, customer_email } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ error: 'Amount and description are required' });
    }

    // Create a product for this payment
    const product = await stripe.products.create({
      name: description,
      metadata: {
        source: 'surprise_granite_quick_payment',
        customer_email: customer_email || 'N/A'
      }
    });

    // Create a price for this product
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(amount * 100),
      currency: 'usd'
    });

    // Create the payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://www.surprisegranite.com/thank-you/' }
      },
      metadata: {
        description,
        customer_email: customer_email || 'N/A'
      }
    });

    res.json({
      success: true,
      payment_link: {
        id: paymentLink.id,
        url: paymentLink.url,
        amount: amount,
        description: description
      }
    });
  } catch (error) {
    console.error('Payment link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ WALLET / BALANCE ============

// Get Stripe account balance
app.get('/api/balance', async (req, res) => {
  try {
    const balance = await stripe.balance.retrieve();

    res.json({
      available: balance.available.map(b => ({
        amount: b.amount / 100,
        currency: b.currency
      })),
      pending: balance.pending.map(b => ({
        amount: b.amount / 100,
        currency: b.currency
      })),
      total_available: balance.available.reduce((sum, b) => sum + b.amount, 0) / 100,
      total_pending: balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent payouts
app.get('/api/payouts', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const payouts = await stripe.payouts.list({ limit: parseInt(limit) });

    res.json({
      payouts: payouts.data.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        currency: p.currency,
        status: p.status,
        arrival_date: new Date(p.arrival_date * 1000).toISOString(),
        created: new Date(p.created * 1000).toISOString(),
        method: p.method,
        description: p.description
      }))
    });
  } catch (error) {
    console.error('Payouts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent transactions/charges
app.get('/api/transactions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const charges = await stripe.charges.list({ limit: parseInt(limit) });

    res.json({
      transactions: charges.data.map(c => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        description: c.description,
        customer_email: c.billing_details?.email || c.receipt_email,
        created: new Date(c.created * 1000).toISOString(),
        receipt_url: c.receipt_url,
        paid: c.paid,
        refunded: c.refunded
      }))
    });
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get balance transactions (detailed)
app.get('/api/balance-transactions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const transactions = await stripe.balanceTransactions.list({ limit: parseInt(limit) });

    res.json({
      transactions: transactions.data.map(t => ({
        id: t.id,
        amount: t.amount / 100,
        net: t.net / 100,
        fee: t.fee / 100,
        currency: t.currency,
        type: t.type,
        description: t.description,
        created: new Date(t.created * 1000).toISOString(),
        status: t.status,
        available_on: new Date(t.available_on * 1000).toISOString()
      }))
    });
  } catch (error) {
    console.error('Balance transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initiate a payout
app.post('/api/payouts', async (req, res) => {
  try {
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      description: description || 'Manual payout from dashboard'
    });

    res.json({
      success: true,
      payout: {
        id: payout.id,
        amount: payout.amount / 100,
        status: payout.status,
        arrival_date: new Date(payout.arrival_date * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ STRIPE CONNECT (for vendor payouts) ============

// Create a Connect Express account for vendors
app.post('/api/connect/accounts', async (req, res) => {
  try {
    const { email, business_name, business_type = 'individual' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type,
      metadata: {
        source: 'surprise_granite_vendor',
        business_name: business_name || ''
      }
    });

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'https://www.surprisegranite.com/account/?connect=refresh',
      return_url: 'https://www.surprisegranite.com/account/?connect=success',
      type: 'account_onboarding'
    });

    res.json({
      success: true,
      account_id: account.id,
      onboarding_url: accountLink.url
    });
  } catch (error) {
    console.error('Connect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Connect account status
app.get('/api/connect/accounts/:id', async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve(req.params.id);

    res.json({
      account: {
        id: account.id,
        email: account.email,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        business_type: account.business_type
      }
    });
  } catch (error) {
    console.error('Get Connect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a login link for vendor dashboard
app.post('/api/connect/accounts/:id/login', async (req, res) => {
  try {
    const loginLink = await stripe.accounts.createLoginLink(req.params.id);
    res.json({ url: loginLink.url });
  } catch (error) {
    console.error('Login link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a payout to a connected account
app.post('/api/connect/payouts', async (req, res) => {
  try {
    const { account_id, amount, description } = req.body;

    if (!account_id || !amount) {
      return res.status(400).json({ error: 'Account ID and amount are required' });
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: account_id,
      description: description || 'Vendor payout from Surprise Granite'
    });

    res.json({
      success: true,
      transfer: {
        id: transfer.id,
        amount: transfer.amount / 100,
        destination: transfer.destination,
        created: new Date(transfer.created * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ VENDOR SUBSCRIPTIONS ============

// Subscription plan pricing (in cents)
const VENDOR_PLANS = {
  starter: { monthly: 0, annual: 0, name: 'Starter', leads_per_month: 0 },
  basic: { monthly: 999, annual: 9590, name: 'Basic', leads_per_month: 3 },
  plus: { monthly: 1999, annual: 19190, name: 'Plus', leads_per_month: 10 },
  pro: { monthly: 2999, annual: 28790, name: 'Pro', leads_per_month: 50 }
};

// Create vendor subscription checkout session
app.post('/api/create-vendor-subscription', async (req, res) => {
  try {
    const { vendor_id, plan_name, billing_cycle, success_url, cancel_url } = req.body;

    if (!vendor_id || !plan_name) {
      return res.status(400).json({ error: 'Vendor ID and plan name are required' });
    }

    const plan = VENDOR_PLANS[plan_name.toLowerCase()];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan name' });
    }

    // Free starter plan - no checkout needed
    if (plan_name.toLowerCase() === 'starter') {
      return res.json({
        success: true,
        plan: 'starter',
        message: 'Free plan activated - no payment required',
        redirect_url: success_url || 'https://www.surprisegranite.com/vendor/dashboard/'
      });
    }

    const isAnnual = billing_cycle === 'annual';
    const amount = isAnnual ? plan.annual : plan.monthly;
    const interval = isAnnual ? 'year' : 'month';

    // Create or get the product
    let product;
    const existingProducts = await stripe.products.list({
      limit: 100,
      active: true
    });

    product = existingProducts.data.find(p =>
      p.metadata?.type === 'vendor_subscription' &&
      p.metadata?.plan === plan_name.toLowerCase()
    );

    if (!product) {
      product = await stripe.products.create({
        name: `Surprise Granite Pro - ${plan.name} Plan`,
        description: `${plan.leads_per_month} leads/month, verified badge, priority support`,
        metadata: {
          type: 'vendor_subscription',
          plan: plan_name.toLowerCase(),
          leads_per_month: plan.leads_per_month.toString()
        }
      });
    }

    // Create a price for this billing cycle
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency: 'usd',
      recurring: {
        interval: interval
      },
      metadata: {
        plan: plan_name.toLowerCase(),
        billing_cycle: billing_cycle
      }
    });

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: price.id,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: success_url || `https://www.surprisegranite.com/vendor/dashboard/?subscription=success`,
      cancel_url: cancel_url || `https://www.surprisegranite.com/vendor/select-plan/?canceled=true`,
      metadata: {
        vendor_id: vendor_id,
        plan: plan_name.toLowerCase(),
        billing_cycle: billing_cycle,
        source: 'vendor_onboarding'
      },
      subscription_data: {
        metadata: {
          vendor_id: vendor_id,
          plan: plan_name.toLowerCase(),
          leads_per_month: plan.leads_per_month.toString()
        }
      },
      allow_promotion_codes: true
    });

    console.log('Vendor subscription session created:', session.id, 'Plan:', plan_name);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Vendor subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get vendor billing portal link
app.post('/api/vendor-billing-portal', async (req, res) => {
  try {
    const { customer_id, return_url } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer_id,
      return_url: return_url || 'https://www.surprisegranite.com/vendor/dashboard/'
    });

    res.json({
      success: true,
      url: portalSession.url
    });

  } catch (error) {
    console.error('Billing portal error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get vendor subscription status
app.get('/api/vendor-subscription/:vendor_id', async (req, res) => {
  try {
    const { vendor_id } = req.params;

    // Search for subscriptions with this vendor_id in metadata
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['vendor_id']:'${vendor_id}'`,
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.json({
        active: false,
        plan: 'starter',
        status: 'none'
      });
    }

    const subscription = subscriptions.data[0];
    const plan = subscription.metadata?.plan || 'starter';
    const leadsPerMonth = parseInt(subscription.metadata?.leads_per_month || '0');

    res.json({
      active: subscription.status === 'active',
      plan: plan,
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      leads_per_month: leadsPerMonth,
      stripe_subscription_id: subscription.id,
      customer_id: subscription.customer
    });

  } catch (error) {
    console.error('Get vendor subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel vendor subscription
app.post('/api/vendor-subscription/:vendor_id/cancel', async (req, res) => {
  try {
    const { vendor_id } = req.params;
    const { cancel_immediately = false } = req.body;

    // Find the subscription
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['vendor_id']:'${vendor_id}'`,
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const subscription = subscriptions.data[0];

    if (cancel_immediately) {
      await stripe.subscriptions.cancel(subscription.id);
    } else {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true
      });
    }

    res.json({
      success: true,
      message: cancel_immediately
        ? 'Subscription canceled immediately'
        : 'Subscription will cancel at end of billing period'
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ LEAD MANAGEMENT ============

// Submit a new lead (from estimate form or booking calendar)
app.post('/api/leads', async (req, res) => {
  try {
    const {
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      project_type,
      project_budget,
      project_timeline,
      project_zip,
      project_details,
      source = 'website',
      // Appointment-specific fields
      appointment_date,
      appointment_time,
      project_address,
      message
    } = req.body;

    if (!homeowner_name || !homeowner_email || !project_zip) {
      return res.status(400).json({
        error: 'Name, email, and ZIP code are required'
      });
    }

    // Calculate lead price based on project type
    let lead_price = 15; // Default price
    if (project_type === 'kitchen_countertops' || project_type === 'full_remodel') {
      lead_price = 25;
    } else if (project_type === 'bathroom') {
      lead_price = 20;
    } else if (project_type === 'commercial') {
      lead_price = 35;
    }

    // Lead data to store (you'd typically save this to Supabase)
    const leadData = {
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      project_type,
      project_budget,
      project_timeline,
      project_zip,
      project_details,
      source,
      lead_price,
      status: 'new',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72 hours
    };

    console.log('New lead received:', leadData);

    // Determine if this is an appointment request
    const isAppointment = appointment_date || appointment_time || source === 'Booking Calendar';
    const emailTitle = isAppointment ? 'New Appointment Request!' : 'New Lead Received!';
    const emailSubject = isAppointment
      ? `APPOINTMENT: ${homeowner_name} - ${appointment_date || 'Date TBD'} at ${appointment_time || 'Time TBD'}`
      : `New Lead - ${project_type} in ${project_zip}`;

    // Send notification to admin
    const adminEmail = {
      subject: emailSubject,
      html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, ${isAppointment ? '#22c55e' : '#1a1a2e'} 0%, ${isAppointment ? '#16a34a' : '#16213e'} 100%); padding: 25px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 20px;">${emailTitle}</h1>
    </div>
    <div style="padding: 25px;">
      ${isAppointment ? `
      <div style="background: #dcfce7; border-left: 4px solid #22c55e; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
        <p style="margin: 0; color: #166534; font-weight: 600; font-size: 16px;">
          📅 ${appointment_date || 'Date TBD'} at ${appointment_time || 'Time TBD'}
        </p>
        ${project_address ? `<p style="margin: 8px 0 0; color: #166534; font-size: 14px;">📍 ${project_address}</p>` : ''}
      </div>
      ` : `
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32; font-weight: 600;">Lead Value: $${lead_price}</p>
      </div>
      `}
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Name:</td>
          <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">${homeowner_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Email:</td>
          <td style="padding: 8px 0; color: #1a1a2e;"><a href="mailto:${homeowner_email}">${homeowner_email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Phone:</td>
          <td style="padding: 8px 0; color: #1a1a2e;"><a href="tel:${homeowner_phone}">${homeowner_phone || 'Not provided'}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Project:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_type}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Source:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${source}</td>
        </tr>
        ${!isAppointment ? `
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">ZIP Code:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_zip}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Budget:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_budget || 'Not specified'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Timeline:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_timeline || 'Not specified'}</td>
        </tr>
        ` : ''}
      </table>
      ${(project_details || message) ? `
      <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
        <p style="margin: 0 0 8px; color: #666; font-size: 12px; text-transform: uppercase;">${isAppointment ? 'Notes' : 'Project Details'}:</p>
        <p style="margin: 0; color: #1a1a2e; font-size: 14px; white-space: pre-wrap;">${project_details || message}</p>
      </div>
      ` : ''}
      <div style="margin-top: 20px; text-align: center;">
        <a href="mailto:${homeowner_email}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; margin-right: 10px;">Reply to Customer</a>
        ${homeowner_phone ? `<a href="tel:${homeowner_phone}" style="display: inline-block; background: #1a1a2e; color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600;">Call Now</a>` : ''}
      </div>
    </div>
    <div style="background: #f8f9fa; padding: 15px; text-align: center;">
      <p style="margin: 0; color: #666; font-size: 12px;">Surprise Granite • (602) 833-3189 • info@surprisegranite.com</p>
    </div>
  </div>
</body>
</html>`
    };
    await sendNotification(ADMIN_EMAIL, adminEmail.subject, adminEmail.html);

    res.json({
      success: true,
      message: 'Lead submitted successfully',
      lead_id: `lead_${Date.now()}`
    });

  } catch (error) {
    console.error('Lead submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Purchase a lead (a la carte)
app.post('/api/purchase-lead', async (req, res) => {
  try {
    const { vendor_id, lead_id, lead_price, success_url, cancel_url } = req.body;

    if (!vendor_id || !lead_id || !lead_price) {
      return res.status(400).json({ error: 'Vendor ID, lead ID, and lead price are required' });
    }

    // Create a one-time checkout session for the lead
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Lead Purchase',
            description: `Lead ID: ${lead_id}`,
            metadata: {
              type: 'lead_purchase',
              lead_id: lead_id
            }
          },
          unit_amount: Math.round(lead_price * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: success_url || `https://www.surprisegranite.com/vendor/dashboard/leads/?purchased=${lead_id}`,
      cancel_url: cancel_url || `https://www.surprisegranite.com/vendor/dashboard/leads/`,
      metadata: {
        vendor_id: vendor_id,
        lead_id: lead_id,
        type: 'lead_purchase'
      }
    });

    console.log('Lead purchase session created:', session.id);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Lead purchase error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ AI VISUALIZER ============

// AI Visualize endpoint using Replicate
app.post('/api/visualize', async (req, res) => {
  try {
    const { image, prompt, style, material } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    if (!REPLICATE_API_TOKEN) {
      console.log('Replicate API not configured, returning demo mode');
      return res.json({
        success: true,
        demo: true,
        output: getDemoImage(style),
        message: 'Demo mode - API not configured'
      });
    }

    // Use Flux model for image-to-image transformation
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'black-forest-labs/flux-1.1-pro',
        input: {
          prompt: prompt || `Transform this space with ${style} design style and ${material} countertops. Professional interior design, high quality, realistic.`,
          image: image,
          prompt_strength: 0.6,
          num_inference_steps: 28,
          guidance_scale: 3.5
        }
      })
    });

    const prediction = await response.json();

    if (prediction.error) {
      console.error('Replicate error:', prediction.error);
      return res.status(500).json({ error: prediction.error });
    }

    // Poll for completion
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`
        }
      });

      result = await pollResponse.json();
      attempts++;
    }

    if (result.status === 'failed') {
      console.error('Prediction failed:', result.error);
      return res.status(500).json({ error: 'Image generation failed' });
    }

    if (result.status !== 'succeeded') {
      return res.status(504).json({ error: 'Generation timed out' });
    }

    res.json({
      success: true,
      output: Array.isArray(result.output) ? result.output[0] : result.output,
      prediction_id: prediction.id
    });

  } catch (error) {
    console.error('Visualize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ BLUEPRINT TAKEOFF ============

// Analyze blueprint using AI vision (GPT-4 Vision or Ollama)
app.post('/api/analyze-blueprint', async (req, res) => {
  try {
    const {
      image,
      projectType,
      blueprintUrl,
      baxFile,
      useOllama = false,
      laborRate,
      materialPricing
    } = req.body;

    // Validate input
    if (!image && !blueprintUrl && !baxFile) {
      return res.status(400).json({
        error: 'Blueprint image, URL, or Bluebeam BAX file is required'
      });
    }

    let analysisResults;

    // Handle Bluebeam BAX file (XML markup data)
    if (baxFile) {
      console.log('Processing Bluebeam BAX file...');
      analysisResults = parseBluebeamBAX(baxFile);

    } else {
      // Handle image or URL-based blueprints
      let blueprintData = image;

      // Convert URL to base64 if needed
      if (blueprintUrl) {
        console.log('Processing blueprint from URL:', blueprintUrl);
        try {
          const fetch = (await import('node-fetch')).default;
          const response = await fetch(blueprintUrl);
          const buffer = await response.buffer();
          const mimeType = response.headers.get('content-type') || 'image/png';
          blueprintData = `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (urlError) {
          console.error('Error fetching URL:', urlError);
          // Fall back to demo mode if URL fetch fails
          blueprintData = null;
        }
      }

      // Check if we have OpenAI API key for GPT-4 Vision
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasOllama = useOllama; // User explicitly requests Ollama

      if (blueprintData && (hasOpenAI || hasOllama)) {
        // Use AI-powered analysis
        const provider = hasOllama ? 'ollama' : 'openai';
        console.log(`Analyzing blueprint with ${provider}...`);

        try {
          const aiResult = await analyzeBlueprint({
            image: blueprintData,
            projectType: projectType || 'full-home',
            provider: provider,
            apiKey: process.env.OPENAI_API_KEY,
            rates: materialPricing,
            wasteFactor: 0.10
          });

          // Convert AI result to expected format
          analysisResults = convertAIResultToLegacy(aiResult, projectType);
          analysisResults.mode = 'ai';
          analysisResults.provider = provider;

        } catch (aiError) {
          console.error('AI analysis error, falling back to demo:', aiError);
          analysisResults = generateTakeoffAnalysis(projectType);
          analysisResults.mode = 'demo';
          analysisResults.aiError = aiError.message;
        }
      } else {
        // Fallback to demo data
        console.log('No AI configured, using demo analysis...');
        analysisResults = generateTakeoffAnalysis(projectType);
        analysisResults.mode = 'demo';

        if (!hasOpenAI && !hasOllama) {
          analysisResults.notice = 'Demo mode: Add OPENAI_API_KEY for real blueprint analysis';
        }
      }
    }

    // Add pricing calculations if labor rate provided
    if (laborRate && analysisResults.rooms) {
      analysisResults.laborEstimate = calculateLaborEstimate(analysisResults, laborRate);
    }

    res.json(analysisResults);

  } catch (error) {
    console.error('Blueprint analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Convert AI result format to legacy frontend format
function convertAIResultToLegacy(aiResult, projectType) {
  if (!aiResult || !aiResult.takeoff) {
    return generateTakeoffAnalysis(projectType);
  }

  const takeoff = aiResult.takeoff;
  const totals = takeoff.totals || {};
  const rooms = takeoff.rooms || [];

  return {
    totalArea: totals.totalSF || rooms.reduce((sum, r) => sum + (r.sqft || 0), 0),
    countertopSqft: totals.countertops?.sqft || 0,
    flooringSqft: totals.flooring?.sqft || 0,
    tileSqft: totals.tile?.sqft || 0,
    rooms: rooms.map(room => ({
      name: room.name || 'Unknown Room',
      dimensions: room.dimensions || 'N/A',
      sqft: room.sqft || 0,
      material: getMaterialTypes(room.materials)
    })),
    costs: aiResult.costs || null
  };
}

// Helper to get material type string from room materials
function getMaterialTypes(materials) {
  if (!materials) return 'N/A';
  const types = [];
  if (materials.countertops?.sqft > 0) types.push('Countertop');
  if (materials.flooring?.sqft > 0) types.push('Flooring');
  if (materials.tile?.sqft > 0) types.push('Tile');
  if (materials.cabinets) types.push('Cabinets');
  return types.length > 0 ? types.join(' + ') : 'N/A';
}

// Calculate labor estimate based on analysis results
function calculateLaborEstimate(analysis, laborRate) {
  const hourlyRate = parseFloat(laborRate) || 50;
  const estimates = {
    countertops: {
      hoursPerSqft: 0.5,
      sqft: analysis.countertopSqft || 0
    },
    flooring: {
      hoursPerSqft: 0.15,
      sqft: analysis.flooringSqft || 0
    },
    tile: {
      hoursPerSqft: 0.25,
      sqft: analysis.tileSqft || 0
    }
  };

  let totalHours = 0;
  const breakdown = {};

  for (const [trade, data] of Object.entries(estimates)) {
    const hours = data.sqft * data.hoursPerSqft;
    totalHours += hours;
    breakdown[trade] = {
      sqft: data.sqft,
      hours: Math.round(hours * 10) / 10,
      cost: Math.round(hours * hourlyRate)
    };
  }

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    totalLaborCost: Math.round(totalHours * hourlyRate),
    hourlyRate: hourlyRate,
    breakdown
  };
}

// Generate takeoff analysis (demo mode - replace with actual AI in production)
function generateTakeoffAnalysis(projectType) {
  const analyses = {
    'kitchen-remodel': {
      totalArea: 180,
      countertopSqft: 45,
      flooringSqft: 120,
      tileSqft: 35,
      rooms: [
        { name: 'Kitchen', dimensions: "12' x 15'", sqft: 180, material: 'Flooring + Countertop' },
        { name: 'Kitchen Island', dimensions: "4' x 8'", sqft: 32, material: 'Countertop' },
        { name: 'Backsplash', dimensions: "18\" x 12'", sqft: 18, material: 'Tile' }
      ]
    },
    'bathroom-remodel': {
      totalArea: 85,
      countertopSqft: 12,
      flooringSqft: 0,
      tileSqft: 120,
      rooms: [
        { name: 'Master Bath Floor', dimensions: "8' x 10'", sqft: 80, material: 'Tile' },
        { name: 'Shower Walls', dimensions: "3' x 8' x 3 walls", sqft: 72, material: 'Tile' },
        { name: 'Vanity Top', dimensions: "5' x 2'", sqft: 10, material: 'Countertop' }
      ]
    },
    'full-home': {
      totalArea: 2200,
      countertopSqft: 65,
      flooringSqft: 1800,
      tileSqft: 280,
      rooms: [
        { name: 'Living Room', dimensions: "20' x 18'", sqft: 360, material: 'Flooring' },
        { name: 'Kitchen', dimensions: "14' x 16'", sqft: 224, material: 'Flooring + Countertop' },
        { name: 'Master Bedroom', dimensions: "16' x 14'", sqft: 224, material: 'Flooring' },
        { name: 'Bedroom 2', dimensions: "12' x 12'", sqft: 144, material: 'Flooring' },
        { name: 'Bedroom 3', dimensions: "11' x 12'", sqft: 132, material: 'Flooring' },
        { name: 'Master Bath', dimensions: "10' x 12'", sqft: 120, material: 'Tile' },
        { name: 'Guest Bath', dimensions: "8' x 8'", sqft: 64, material: 'Tile' }
      ]
    },
    'flooring-only': {
      totalArea: 1500,
      countertopSqft: 0,
      flooringSqft: 1500,
      tileSqft: 0,
      rooms: [
        { name: 'Living Area', dimensions: "25' x 20'", sqft: 500, material: 'LVP Flooring' },
        { name: 'Kitchen/Dining', dimensions: "20' x 18'", sqft: 360, material: 'LVP Flooring' },
        { name: 'Master Suite', dimensions: "18' x 16'", sqft: 288, material: 'LVP Flooring' },
        { name: 'Bedrooms (3)', dimensions: "Various", sqft: 352, material: 'LVP Flooring' }
      ]
    },
    'commercial': {
      totalArea: 5000,
      countertopSqft: 120,
      flooringSqft: 4500,
      tileSqft: 400,
      rooms: [
        { name: 'Main Floor', dimensions: "100' x 45'", sqft: 4500, material: 'Commercial LVT' },
        { name: 'Reception Counter', dimensions: "12' x 3'", sqft: 36, material: 'Quartz' },
        { name: 'Break Room', dimensions: "15' x 12'", sqft: 180, material: 'Tile' },
        { name: 'Restrooms (4)', dimensions: "8' x 10' each", sqft: 320, material: 'Tile' }
      ]
    }
  };

  return analyses[projectType] || analyses['kitchen-remodel'];
}

// Helper function for demo images
function getDemoImage(style) {
  const demoImages = {
    modern: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
    traditional: 'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80',
    farmhouse: 'https://images.unsplash.com/photo-1556909172-8c2f041fca1e?w=800&q=80',
    industrial: 'https://images.unsplash.com/photo-1556909114-4d02e86f5c5a?w=800&q=80',
    minimalist: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
    luxury: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80'
  };
  return demoImages[style] || demoImages.modern;
}

// ============ LEAD ASSIGNMENT & IMAGE MANAGEMENT ============

// Submit lead with images (enhanced version)
app.post('/api/leads/with-images', async (req, res) => {
  try {
    const {
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      project_type,
      project_budget,
      project_timeline,
      project_zip,
      project_city,
      project_state,
      project_details,
      source = 'website',
      image_urls = [],
      contact_method,
      auto_assign = true
    } = req.body;

    if (!homeowner_name || !homeowner_email || !project_zip) {
      return res.status(400).json({
        error: 'Name, email, and ZIP code are required'
      });
    }

    // Calculate lead price based on project type and images
    let lead_price = 15;
    if (project_type === 'kitchen' || project_type === 'countertops' || project_type === 'full-remodel') {
      lead_price = 25;
    } else if (project_type === 'bathroom') {
      lead_price = 20;
    } else if (project_type === 'commercial') {
      lead_price = 35;
    }
    // Premium for leads with images (more qualified)
    if (image_urls.length > 0) {
      lead_price += 5;
    }

    const leadData = {
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      project_type,
      project_budget,
      project_timeline,
      project_zip,
      project_city: project_city || null,
      project_state: project_state || 'AZ',
      project_details,
      source,
      image_urls: image_urls,
      images: image_urls.map((url, index) => ({
        url,
        order: index,
        uploaded_at: new Date().toISOString()
      })),
      lead_price,
      contact_method: contact_method || 'phone',
      status: 'new',
      quality_score: image_urls.length > 0 ? 75 : 50,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    };

    console.log('New lead with images received:', {
      name: leadData.homeowner_name,
      project: leadData.project_type,
      zip: leadData.project_zip,
      images: image_urls.length
    });

    // Send notification to admin with images
    const imageGalleryHTML = image_urls.length > 0 ? `
      <div style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;">
        <p style="margin: 0 0 12px; color: #0369a1; font-weight: 600;">Project Photos (${image_urls.length})</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${image_urls.map((url, i) => `
            <a href="${url}" target="_blank" style="display: block; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid #0ea5e9;">
              <img src="${url}" alt="Project photo ${i + 1}" style="width: 100%; height: 100%; object-fit: cover;">
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    const adminEmail = {
      subject: `New Lead with ${image_urls.length} Photo${image_urls.length !== 1 ? 's' : ''} - ${project_type} in ${project_zip}`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px; text-align: center;">
      <h1 style="color: #f9cb00; margin: 0; font-size: 20px;">New Lead with Project Photos!</h1>
    </div>
    <div style="padding: 25px;">
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32; font-weight: 600;">Lead Value: $${lead_price} | Quality Score: ${leadData.quality_score}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Name:</td>
          <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">${homeowner_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Email:</td>
          <td style="padding: 8px 0; color: #1a1a2e;"><a href="mailto:${homeowner_email}">${homeowner_email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Phone:</td>
          <td style="padding: 8px 0; color: #1a1a2e;"><a href="tel:${homeowner_phone}">${homeowner_phone || 'Not provided'}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Project:</td>
          <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">${project_type}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Location:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_city || ''} ${project_state || 'AZ'} ${project_zip}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Budget:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_budget || 'Not specified'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Timeline:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_timeline || 'Not specified'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Photos:</td>
          <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">${image_urls.length} uploaded</td>
        </tr>
      </table>
      ${project_details ? `
      <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
        <p style="margin: 0 0 8px; color: #666; font-size: 12px; text-transform: uppercase;">Project Details:</p>
        <p style="margin: 0; color: #1a1a2e; font-size: 14px; white-space: pre-wrap;">${project_details}</p>
      </div>
      ` : ''}
      ${imageGalleryHTML}
      <div style="margin-top: 25px; text-align: center;">
        <a href="https://www.surprisegranite.com/account/admin/" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: 600; margin-right: 10px;">View in Dashboard</a>
        <a href="mailto:${homeowner_email}" style="display: inline-block; background: #1a1a2e; color: #fff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: 600;">Reply to Lead</a>
      </div>
    </div>
  </div>
</body>
</html>`
    };
    await sendNotification(ADMIN_EMAIL, adminEmail.subject, adminEmail.html);

    res.json({
      success: true,
      message: 'Lead submitted successfully with images',
      lead_id: `lead_${Date.now()}`,
      images_count: image_urls.length,
      lead_price
    });

  } catch (error) {
    console.error('Lead with images submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assign lead to vendor (admin only)
app.post('/api/leads/assign', async (req, res) => {
  try {
    const {
      lead_id,
      lead_table = 'leads',
      vendor_id,
      user_id,
      assignment_type = 'manual',
      notes,
      notify_vendor = true
    } = req.body;

    if (!lead_id) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    if (!vendor_id && !user_id) {
      return res.status(400).json({ error: 'Vendor ID or User ID is required' });
    }

    const assignment = {
      lead_id,
      lead_table,
      vendor_id,
      user_id,
      assignment_type,
      notes,
      assigned_at: new Date().toISOString(),
      status: 'assigned'
    };

    console.log('Lead assignment:', assignment);

    // Send notification to assigned vendor/user if requested
    if (notify_vendor && (vendor_id || user_id)) {
      const vendorEmail = {
        subject: 'New Lead Assigned to You!',
        html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px; text-align: center;">
      <h1 style="color: #f9cb00; margin: 0; font-size: 20px;">New Lead Available!</h1>
    </div>
    <div style="padding: 25px;">
      <p style="color: #333; font-size: 15px;">A new lead has been assigned to you. Log in to your dashboard to view the details and contact the customer.</p>
      <div style="margin-top: 20px; text-align: center;">
        <a href="https://www.surprisegranite.com/vendor/dashboard/" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: 600;">View Lead Details</a>
      </div>
      <p style="margin-top: 20px; color: #666; font-size: 13px; text-align: center;">This lead expires in 72 hours. Act fast!</p>
    </div>
  </div>
</body>
</html>`
      };
      // Would need to fetch vendor email from database
      // await sendNotification(vendorEmail, vendorEmail.subject, vendorEmail.html);
    }

    res.json({
      success: true,
      message: 'Lead assigned successfully',
      assignment
    });

  } catch (error) {
    console.error('Lead assignment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-assign lead based on ZIP code and rules
app.post('/api/leads/auto-assign', async (req, res) => {
  try {
    const { lead_id, project_zip, project_type } = req.body;

    if (!lead_id || !project_zip) {
      return res.status(400).json({ error: 'Lead ID and ZIP code are required' });
    }

    // In production, this would query Supabase for matching vendors
    // For now, return a demo response
    const matchedVendors = [
      {
        vendor_id: 'demo_vendor_1',
        business_name: 'Phoenix Granite Pros',
        priority: 1,
        subscription_plan: 'pro',
        leads_remaining: 45
      },
      {
        vendor_id: 'demo_vendor_2',
        business_name: 'AZ Stone Works',
        priority: 2,
        subscription_plan: 'plus',
        leads_remaining: 8
      }
    ];

    console.log(`Auto-assignment for lead ${lead_id} in ZIP ${project_zip}:`, matchedVendors);

    res.json({
      success: true,
      lead_id,
      matched_vendors: matchedVendors,
      assigned_to: matchedVendors[0] || null,
      message: matchedVendors.length > 0
        ? `Lead assigned to ${matchedVendors[0].business_name}`
        : 'No matching vendors found for this area'
    });

  } catch (error) {
    console.error('Auto-assignment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get leads with images for admin dashboard
app.get('/api/leads/with-images', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // In production, this would query Supabase
    // For now, return structure that admin dashboard expects
    res.json({
      success: true,
      leads: [],
      total: 0,
      message: 'Connect to Supabase to fetch leads with images'
    });

  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get auto-assignment rules
app.get('/api/leads/assignment-rules', async (req, res) => {
  try {
    // In production, fetch from Supabase
    res.json({
      success: true,
      rules: [
        {
          id: 'rule_demo_1',
          zip_codes: ['85374', '85375', '85379', '85381', '85383'],
          project_types: ['countertops', 'kitchen'],
          vendor_id: null,
          user_id: null,
          priority: 1,
          max_leads_per_day: 10,
          is_active: true
        }
      ]
    });
  } catch (error) {
    console.error('Get assignment rules error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create/update auto-assignment rule
app.post('/api/leads/assignment-rules', async (req, res) => {
  try {
    const {
      id,
      zip_codes = [],
      project_types = [],
      vendor_id,
      user_id,
      priority = 10,
      max_leads_per_day = 10,
      is_active = true
    } = req.body;

    const rule = {
      id: id || `rule_${Date.now()}`,
      zip_codes,
      project_types,
      vendor_id,
      user_id,
      priority,
      max_leads_per_day,
      is_active,
      updated_at: new Date().toISOString()
    };

    console.log('Assignment rule saved:', rule);

    res.json({
      success: true,
      rule,
      message: id ? 'Rule updated' : 'Rule created'
    });

  } catch (error) {
    console.error('Save assignment rule error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ PRICE SHEET PARSING ============

// Parse PDF price sheet using AI
app.post('/api/price-sheets/parse', async (req, res) => {
  try {
    const { file_url, file_base64, vendor_name } = req.body;

    if (!file_url && !file_base64) {
      return res.status(400).json({ error: 'File URL or base64 data required' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Prepare the image/PDF content
    let imageContent;
    if (file_base64) {
      imageContent = {
        type: 'image_url',
        image_url: { url: `data:application/pdf;base64,${file_base64}` }
      };
    } else {
      imageContent = {
        type: 'image_url',
        image_url: { url: file_url }
      };
    }

    // Call OpenAI GPT-4 Vision to extract price data
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a price sheet data extraction expert. Extract product/service pricing data from the provided document.

Return a JSON array of products with this structure:
{
  "products": [
    {
      "sku": "product SKU or code if visible",
      "name": "product name",
      "description": "brief description",
      "category": "one of: countertops, tile, flooring, cabinets, sinks, faucets, labor, fabrication, edges, backsplash, demolition, plumbing, misc",
      "unit_type": "one of: sqft, lnft, each, hour, job, slab, piece, box, pallet",
      "cost_price": null,
      "our_price": 0.00,
      "vendor_name": "${vendor_name || 'Unknown'}",
      "attributes": {
        "color": "",
        "material": "",
        "thickness": "",
        "finish": ""
      }
    }
  ],
  "vendor_detected": "detected vendor name if visible",
  "date_detected": "price list date if visible",
  "notes": "any important notes about the price sheet"
}

Extract ALL products visible. Use 0.00 for prices if not clearly visible. Be thorough.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all products and pricing from this price sheet:' },
              imageContent
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI error:', error);
      return res.status(500).json({ error: 'Failed to parse price sheet' });
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content || '';

    // Parse JSON from response
    let parsedData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      parsedData = JSON.parse(jsonMatch[1] || content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      parsedData = { products: [], error: 'Could not parse response' };
    }

    res.json({
      success: true,
      data: parsedData,
      raw_response: content
    });

  } catch (error) {
    console.error('Price sheet parse error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Parse CSV price sheet
app.post('/api/price-sheets/parse-csv', async (req, res) => {
  try {
    const { csv_data, column_mapping, vendor_name } = req.body;

    if (!csv_data) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    // Parse CSV
    const lines = csv_data.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Default column mapping
    const mapping = column_mapping || {
      sku: headers.findIndex(h => h.includes('sku') || h.includes('code') || h.includes('item')),
      name: headers.findIndex(h => h.includes('name') || h.includes('description') || h.includes('product')),
      price: headers.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('rate')),
      unit: headers.findIndex(h => h.includes('unit') || h.includes('uom')),
      category: headers.findIndex(h => h.includes('category') || h.includes('type'))
    };

    const products = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));

      if (values.length < 2) continue;

      products.push({
        sku: mapping.sku >= 0 ? values[mapping.sku] : null,
        name: mapping.name >= 0 ? values[mapping.name] : values[0],
        our_price: mapping.price >= 0 ? parseFloat(values[mapping.price]) || 0 : 0,
        unit_type: mapping.unit >= 0 ? values[mapping.unit]?.toLowerCase() || 'each' : 'each',
        category: mapping.category >= 0 ? values[mapping.category] : 'misc',
        vendor_name: vendor_name || 'CSV Import'
      });
    }

    res.json({
      success: true,
      data: {
        products,
        headers,
        mapping_used: mapping
      }
    });

  } catch (error) {
    console.error('CSV parse error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PROFESSIONAL ESTIMATES ====================

// Send professional estimate email to customer
app.post('/api/send-estimate', async (req, res) => {
  try {
    const {
      // Support both field naming conventions
      customer_name, customerName,
      customer_email, to,
      estimate_number, estimateNumber,
      estimate_id,
      items,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      notes,
      view_url, approvalUrl,
      business_name,
      business_email,
      business_phone,
      business_address,
      business_logo,
      project_type, projectName,
      estimated_timeline,
      inclusions,
      exclusions,
      terms_conditions,
      payment_schedule,
      depositAmount,
      validUntil
    } = req.body;

    // Normalize field names (accept both formats)
    const custName = customer_name || customerName || 'Valued Customer';
    const custEmail = customer_email || to;
    const estNumber = estimate_number || estimateNumber;
    const viewUrl = view_url || approvalUrl;
    const projType = project_type || projectName;

    if (!custEmail) {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    if (!estNumber && !estimate_id) {
      return res.status(400).json({ error: 'Estimate number or ID is required' });
    }

    // Use business info or defaults
    const companyName = business_name || COMPANY.name;
    const companyEmail = business_email || COMPANY.email;
    const companyPhone = business_phone || COMPANY.phone;
    const companyAddress = business_address || COMPANY.address;
    const companyLogo = business_logo || COMPANY.logo;

    // Format currency
    const formatCurrency = (amount) => {
      const num = parseFloat(amount) || 0;
      return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Generate line items HTML
    let itemsHtml = '';
    if (items && items.length > 0) {
      itemsHtml = items.map(item => `
        <tr>
          <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #333;">${item.description || item.name || 'Item'}</td>
          <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: center; color: #666;">${item.quantity || 1}</td>
          <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatCurrency(item.unit_price || item.price)}</td>
          <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: 500;">${formatCurrency(item.total || (item.quantity * item.unit_price))}</td>
        </tr>
      `).join('');
    }

    // Generate payment schedule HTML if provided
    let paymentScheduleHtml = '';
    if (payment_schedule && payment_schedule.length > 0) {
      paymentScheduleHtml = `
        <tr>
          <td style="padding: 30px 40px;">
            <h3 style="margin: 0 0 15px; color: #1a1a2e; font-size: 16px;">Payment Schedule</h3>
            <table width="100%" cellspacing="0" cellpadding="0" style="background: #f8f9fa; border-radius: 6px;">
              ${payment_schedule.map(p => `
                <tr>
                  <td style="padding: 10px 15px; color: #333;">${p.name}</td>
                  <td style="padding: 10px 15px; text-align: right; color: #333; font-weight: 500;">${formatCurrency(p.amount)} (${p.percentage}%)</td>
                </tr>
              `).join('')}
            </table>
          </td>
        </tr>
      `;
    }

    // Generate inclusions/exclusions HTML
    let scopeHtml = '';
    if (inclusions || exclusions) {
      scopeHtml = `
        <tr>
          <td style="padding: 20px 40px;">
            ${inclusions ? `
              <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 8px; color: #1a1a2e; font-size: 14px;">What's Included:</h4>
                <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.5;">${inclusions}</p>
              </div>
            ` : ''}
            ${exclusions ? `
              <div>
                <h4 style="margin: 0 0 8px; color: #1a1a2e; font-size: 14px;">What's Not Included:</h4>
                <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.5;">${exclusions}</p>
              </div>
            ` : ''}
          </td>
        </tr>
      `;
    }

    // Professional estimate email template
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">

          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 35px 40px; text-align: center;">
              ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" style="max-height: 50px; width: auto; margin-bottom: 10px;">` : `<h1 style="color: #f9cb00; margin: 0; font-size: 24px;">${companyName}</h1>`}
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0; font-size: 13px;">Professional Estimate</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 35px 40px 20px;">
              <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">Hello ${custName},</h2>
              <p style="margin: 0; color: #666; font-size: 15px; line-height: 1.6;">
                Thank you for your interest in our services. Please find your detailed estimate below.
              </p>
            </td>
          </tr>

          <!-- Estimate Info Box -->
          <tr>
            <td style="padding: 0 40px;">
              <table width="100%" cellspacing="0" cellpadding="0" style="background: #f8f9fa; border-radius: 8px; border-left: 4px solid #f9cb00;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #666; font-size: 13px;">Estimate Number</td>
                        <td style="text-align: right; color: #1a1a2e; font-weight: 600; font-size: 15px;">#${estNumber || estimate_id?.slice(-8) || 'N/A'}</td>
                      </tr>
                      ${projType ? `
                      <tr>
                        <td style="color: #666; font-size: 13px; padding-top: 8px;">Project Type</td>
                        <td style="text-align: right; color: #1a1a2e; font-size: 14px; padding-top: 8px;">${projType}</td>
                      </tr>
                      ` : ''}
                      ${estimated_timeline ? `
                      <tr>
                        <td style="color: #666; font-size: 13px; padding-top: 8px;">Estimated Timeline</td>
                        <td style="text-align: right; color: #1a1a2e; font-size: 14px; padding-top: 8px;">${estimated_timeline}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line Items -->
          <tr>
            <td style="padding: 30px 40px;">
              <table width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
                <tr style="background: #f8f9fa;">
                  <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #1a1a2e; font-size: 13px; border-bottom: 2px solid #eee;">Description</th>
                  <th style="padding: 12px 15px; text-align: center; font-weight: 600; color: #1a1a2e; font-size: 13px; border-bottom: 2px solid #eee;">Qty</th>
                  <th style="padding: 12px 15px; text-align: right; font-weight: 600; color: #1a1a2e; font-size: 13px; border-bottom: 2px solid #eee;">Unit Price</th>
                  <th style="padding: 12px 15px; text-align: right; font-weight: 600; color: #1a1a2e; font-size: 13px; border-bottom: 2px solid #eee;">Total</th>
                </tr>
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table width="250" cellspacing="0" cellpadding="0" align="right">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Subtotal:</td>
                  <td style="padding: 8px 0; text-align: right; color: #333;">${formatCurrency(subtotal)}</td>
                </tr>
                ${tax_amount && tax_amount > 0 ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Tax (${tax_rate || 0}%):</td>
                  <td style="padding: 8px 0; text-align: right; color: #333;">${formatCurrency(tax_amount)}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; color: #1a1a2e; font-weight: 700; font-size: 18px; border-top: 2px solid #eee;">Total:</td>
                  <td style="padding: 12px 0; text-align: right; color: #f9cb00; font-weight: 700; font-size: 18px; border-top: 2px solid #eee;">${formatCurrency(total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${paymentScheduleHtml}
          ${scopeHtml}

          <!-- Notes -->
          ${notes ? `
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background: #fffbeb; border-radius: 6px; padding: 15px; border-left: 4px solid #f9cb00;">
                <h4 style="margin: 0 0 8px; color: #1a1a2e; font-size: 14px;">Notes:</h4>
                <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.5;">${notes}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- CTA Button -->
          ${viewUrl ? `
          <tr>
            <td style="padding: 10px 40px 30px; text-align: center;">
              <a href="${viewUrl}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #f0b800 100%); color: #1a1a2e; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 8px rgba(249, 203, 0, 0.4);">View & Approve Estimate</a>
              <p style="margin: 15px 0 0; color: #999; font-size: 12px;">Click the button above to view details and respond</p>
            </td>
          </tr>
          ` : ''}

          <!-- Terms & Conditions -->
          ${terms_conditions ? `
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background: #f8f9fa; border-radius: 6px; padding: 15px;">
                <h4 style="margin: 0 0 8px; color: #1a1a2e; font-size: 13px;">Terms & Conditions:</h4>
                <p style="margin: 0; color: #888; font-size: 11px; line-height: 1.5;">${terms_conditions}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 5px; color: #1a1a2e; font-weight: 600;">${companyName}</p>
              <p style="margin: 0 0 5px; color: #666; font-size: 13px;">${companyAddress}</p>
              <p style="margin: 0; color: #666; font-size: 13px;">
                <a href="tel:${companyPhone.replace(/[^0-9]/g, '')}" style="color: #f9cb00; text-decoration: none;">${companyPhone}</a> |
                <a href="mailto:${companyEmail}" style="color: #f9cb00; text-decoration: none;">${companyEmail}</a>
              </p>
            </td>
          </tr>

        </table>

        <!-- Unsubscribe -->
        <p style="margin: 20px 0 0; color: #999; font-size: 11px; text-align: center;">
          This estimate was sent from ${companyName}. If you have questions, please reply to this email or call us.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // Generate PDF attachment
    let pdfBuffer = null;
    try {
      pdfBuffer = await generateEstimatePDF({
        customer_name: custName,
        customer_email: custEmail,
        customer_phone: req.body.customer_phone,
        customer_address: req.body.customer_address,
        estimate_number: estNumber,
        items: items || [],
        subtotal,
        tax_rate,
        tax_amount,
        total,
        notes,
        company_name: companyName,
        company_email: companyEmail,
        company_phone: companyPhone,
        company_address: companyAddress,
        company_logo: companyLogo,
        project_type: projType,
        estimated_timeline,
        inclusions,
        exclusions,
        terms_conditions,
        payment_schedule,
        valid_until: validUntil,
        created_at: req.body.created_at || new Date().toISOString()
      });
      console.log('PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    } catch (pdfErr) {
      console.error('PDF generation error:', pdfErr.message);
      // Continue without PDF if generation fails
    }

    // Check if SMTP is configured
    if (!SMTP_USER) {
      console.log('Email notification (SMTP not configured):', { to: custEmail });
      return res.status(500).json({
        success: false,
        error: 'SMTP not configured',
        smtp_configured: false
      });
    }

    // Send email with PDF attachment
    const emailOptions = {
      from: `"${companyName}" <${SMTP_USER}>`,
      to: custEmail,
      subject: `Your Estimate #${estNumber || estimate_id?.slice(-8) || 'N/A'} from ${companyName}`,
      html: emailHtml,
      attachments: []
    };

    // Add PDF attachment if generated
    if (pdfBuffer) {
      emailOptions.attachments.push({
        filename: `Estimate-${estNumber || estimate_id?.slice(-8) || 'estimate'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    try {
      await transporter.sendMail(emailOptions);
      console.log(`Estimate email sent to ${custEmail}${pdfBuffer ? ' with PDF attachment' : ''}`);
      res.json({
        success: true,
        message: 'Estimate email sent successfully',
        pdf_attached: !!pdfBuffer
      });
    } catch (emailErr) {
      console.error('Failed to send estimate email:', emailErr.message);
      res.status(500).json({
        success: false,
        error: emailErr.message || 'Failed to send email',
        smtp_configured: !!SMTP_USER
      });
    }

  } catch (error) {
    console.error('Send estimate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ JOBS MANAGEMENT API ============

// Get all jobs
app.get('/api/jobs', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { status, limit = 50 } = req.query;

    let query = supabase
      .from('jobs')
      .select('*, customer:customers(name, email, phone), job_contractors(contractor:contractors(name, company_name, phone))')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: jobs, error } = await query;

    if (error) throw error;

    res.json({ jobs: jobs || [] });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single job
app.get('/api/jobs/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(*),
        job_contractors(*, contractor:contractors(*)),
        job_files(*),
        material_orders(*),
        status_history:job_status_history(*)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ job });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update job
app.patch('/api/jobs/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ job });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload file to job
app.post('/api/jobs/:id/files', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { file_name, file_url, file_type, category, description, visible_to_customer, visible_to_contractor } = req.body;

    // Get job to get user_id
    const { data: job } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', req.params.id)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { data: file, error } = await supabase
      .from('job_files')
      .insert({
        job_id: req.params.id,
        user_id: job.user_id,
        file_name,
        file_url,
        file_type: file_type || 'document',
        category: category || 'general',
        description,
        visible_to_customer: visible_to_customer || false,
        visible_to_contractor: visible_to_contractor || false
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ file });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CONTRACTORS MANAGEMENT API ============

// Get all contractors
app.get('/api/contractors', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { status = 'active' } = req.query;

    let query = supabase
      .from('contractors')
      .select('*')
      .order('name');

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: contractors, error } = await query;

    if (error) throw error;

    res.json({ contractors: contractors || [] });
  } catch (error) {
    console.error('Get contractors error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create contractor
app.post('/api/contractors', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { name, company_name, email, phone, address, city, state, zip, specialty, license_number, hourly_rate, day_rate, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Contractor name is required' });
    }

    // Get admin user ID
    const { data: adminUser } = await supabase
      .from('sg_users')
      .select('id')
      .eq('account_type', 'admin')
      .limit(1)
      .single();

    const { data: contractor, error } = await supabase
      .from('contractors')
      .insert({
        user_id: adminUser?.id,
        name,
        company_name,
        email,
        phone,
        address,
        city,
        state,
        zip,
        specialty: specialty || [],
        license_number,
        hourly_rate,
        day_rate,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ contractor });
  } catch (error) {
    console.error('Create contractor error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assign contractor to job
app.post('/api/jobs/:jobId/assign-contractor', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { contractor_id, role = 'installer', agreed_rate, rate_type = 'flat', send_invite = true } = req.body;

    if (!contractor_id) {
      return res.status(400).json({ error: 'Contractor ID is required' });
    }

    // Get job and contractor details
    const [{ data: job }, { data: contractor }] = await Promise.all([
      supabase.from('jobs').select('*, user_id').eq('id', req.params.jobId).single(),
      supabase.from('contractors').select('*').eq('id', contractor_id).single()
    ]);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

    // Generate invite token
    const inviteToken = require('crypto').randomUUID();
    const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

    // Create assignment
    const { data: assignment, error } = await supabase
      .from('job_contractors')
      .insert({
        job_id: req.params.jobId,
        contractor_id,
        user_id: job.user_id,
        role,
        agreed_rate,
        rate_type,
        invite_token: inviteToken,
        invite_expires_at: inviteExpiry,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Update job status
    await supabase
      .from('jobs')
      .update({ status: 'assigned', updated_at: new Date().toISOString() })
      .eq('id', req.params.jobId);

    // Send invite email if requested
    if (send_invite && contractor.email) {
      const inviteEmail = generateContractorInviteEmail(contractor, job, inviteToken);
      await sendNotification(contractor.email, inviteEmail.subject, inviteEmail.html);

      await supabase
        .from('job_contractors')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('id', assignment.id);
    }

    res.json({
      assignment,
      invite_sent: send_invite && !!contractor.email
    });
  } catch (error) {
    console.error('Assign contractor error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Contractor responds to invite
app.post('/api/contractor/respond', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { token, action, decline_reason } = req.body;

    if (!token || !action) {
      return res.status(400).json({ error: 'Token and action are required' });
    }

    // Find assignment by token
    const { data: assignment, error: findErr } = await supabase
      .from('job_contractors')
      .select('*, job:jobs(*), contractor:contractors(*)')
      .eq('invite_token', token)
      .single();

    if (findErr || !assignment) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    // Check expiry
    if (new Date(assignment.invite_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite has expired' });
    }

    // Update assignment status
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    const { error: updateErr } = await supabase
      .from('job_contractors')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        decline_reason: action === 'decline' ? decline_reason : null
      })
      .eq('id', assignment.id);

    if (updateErr) throw updateErr;

    // Notify admin
    const statusText = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
    await sendNotification(ADMIN_EMAIL, `Contractor ${statusText} Job #${assignment.job.job_number}`, `
      <h2>Contractor Response</h2>
      <p><strong>${assignment.contractor.name}</strong> has <strong>${statusText}</strong> Job #${assignment.job.job_number}</p>
      ${decline_reason ? `<p>Reason: ${decline_reason}</p>` : ''}
      <p>Customer: ${assignment.job.customer_name}</p>
    `);

    res.json({
      success: true,
      status: newStatus,
      job: assignment.job
    });
  } catch (error) {
    console.error('Contractor respond error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ MATERIAL ORDERS API ============

// Create material order and send email
app.post('/api/jobs/:jobId/material-order', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { material_name, material_color, material_thickness, quantity, unit = 'slab', supplier, unit_cost, notes, send_email = true, order_email } = req.body;

    if (!material_name || !supplier) {
      return res.status(400).json({ error: 'Material name and supplier are required' });
    }

    // Get job details
    const { data: job } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', req.params.jobId)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Calculate total cost
    const totalCost = unit_cost ? quantity * unit_cost : null;

    // Create order record
    const { data: order, error } = await supabase
      .from('material_orders')
      .insert({
        job_id: req.params.jobId,
        user_id: job.user_id,
        supplier,
        material_name,
        material_color,
        material_thickness,
        quantity,
        unit,
        unit_cost,
        total_cost: totalCost,
        notes,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Update job material info
    await supabase
      .from('jobs')
      .update({
        material_name,
        material_supplier: supplier,
        material_color,
        material_thickness,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.jobId);

    // Send order email if requested
    let emailSent = false;
    if (send_email) {
      const recipientEmail = order_email || `order@${supplier.toLowerCase().replace(/\s+/g, '')}.com`;
      const orderEmail = generateMaterialOrderEmail(order, job);

      // Also CC admin
      const result = await sendNotification(recipientEmail, orderEmail.subject, orderEmail.html);
      emailSent = result.success;

      // Send copy to admin
      await sendNotification(ADMIN_EMAIL, `[Copy] ${orderEmail.subject}`, orderEmail.html);

      if (emailSent) {
        await supabase
          .from('material_orders')
          .update({
            order_email_sent: true,
            order_email_sent_at: new Date().toISOString(),
            status: 'ordered',
            ordered_at: new Date().toISOString()
          })
          .eq('id', order.id);
      }
    }

    res.json({
      order,
      email_sent: emailSent
    });
  } catch (error) {
    console.error('Material order error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update material order status
app.patch('/api/material-orders/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // Auto-set timestamps based on status
    if (updates.status === 'ordered' && !updates.ordered_at) {
      updates.ordered_at = new Date().toISOString();
    }
    if (updates.status === 'received' && !updates.received_at) {
      updates.received_at = new Date().toISOString();

      // Update job material_received status
      const { data: order } = await supabase
        .from('material_orders')
        .select('job_id')
        .eq('id', req.params.id)
        .single();

      if (order?.job_id) {
        await supabase
          .from('jobs')
          .update({
            material_received: true,
            material_received_at: new Date().toISOString(),
            status: 'material_received'
          })
          .eq('id', order.job_id);
      }
    }

    const { data: orderUpdate, error } = await supabase
      .from('material_orders')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ order: orderUpdate });
  } catch (error) {
    console.error('Update material order error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CUSTOMERS API ============

// Get all customers
app.get('/api/customers-list', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*, jobs(id, job_number, status)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ customers: customers || [] });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Surprise Granite API running on port ${PORT}`);
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`Supabase configured: ${!!supabase}`);
  console.log(`Replicate configured: ${!!process.env.REPLICATE_API_TOKEN}`);
  console.log(`OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`SMTP configured: ${!!SMTP_USER} (${SMTP_USER ? 'User: ' + SMTP_USER.substring(0, 3) + '***' : 'Not set'})`);
});
