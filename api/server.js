const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
require('dotenv').config();

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
  phone: '(623) 466-2424',
  address: '14155 W. Bell Road, Suite 100, Surprise, AZ 85374',
  website: 'https://www.surprisegranite.com',
  logo: 'https://cdn.prod.website-files.com/63d50be6d353ffb720a1aa80/63d552f97cd3ad628e716590_Group%20179.jpg',
  tagline: 'Premium Countertops & Expert Installation'
};

// Professional Invoice Templates
const invoiceTemplates = {
  // TEMPLATE 1: Classic Professional
  classic: (invoice, items, customerName) => `
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
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">${COMPANY.shortName}</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${COMPANY.tagline}</p>
            </td>
          </tr>

          <!-- Invoice Title -->
          <tr>
            <td style="padding: 40px 40px 20px; border-bottom: 2px solid #f9cb00;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h2 style="margin: 0; color: #1a1a2e; font-size: 32px; font-weight: 300;">INVOICE</h2>
                    <p style="margin: 5px 0 0; color: #666; font-size: 14px;">#${invoice.number || invoice.id?.slice(-8)}</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; color: #1a1a2e; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    <p style="margin: 5px 0 0; color: #1a1a2e; font-size: 14px;"><strong>Due:</strong> ${invoice.due_date ? new Date(invoice.due_date * 1000).toLocaleDateString() : 'Upon Receipt'}</p>
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
                <tr style="background-color: #1a1a2e;">
                  <td style="padding: 15px; color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Description</td>
                  <td style="padding: 15px; color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Qty</td>
                  <td style="padding: 15px; color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Amount</td>
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
                  <td width="200" style="background-color: #1a1a2e; padding: 20px; border-radius: 8px;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: rgba(255,255,255,0.7); font-size: 14px;">Subtotal</td>
                        <td style="color: #fff; font-size: 14px; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 10px 0;"><hr style="border: none; border-top: 1px solid rgba(255,255,255,0.2); margin: 0;"></td>
                      </tr>
                      <tr>
                        <td style="color: #f9cb00; font-size: 18px; font-weight: 700;">TOTAL</td>
                        <td style="color: #f9cb00; font-size: 18px; font-weight: 700; text-align: right;">$${(invoice.amount_due / 100).toFixed(2)}</td>
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

  // TEMPLATE 2: Modern Minimal
  modern: (invoice, items, customerName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 60px 20px;">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0">
          <!-- Logo & Invoice Number -->
          <tr>
            <td style="padding-bottom: 40px; border-bottom: 1px solid #eee;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #000; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">SURPRISE<span style="color: #f9cb00;">GRANITE</span></h1>
                    <p style="margin: 4px 0 0; color: #888; font-size: 12px; letter-spacing: 2px;">MARBLE & QUARTZ</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; color: #000; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Invoice</p>
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

  // TEMPLATE 3: Premium Luxury
  premium: (invoice, items, customerName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a12; font-family: 'Georgia', 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a12;">
    <tr>
      <td align="center" style="padding: 50px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0">
          <!-- Gold Accent Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, transparent, #f9cb00, transparent);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background-color: #12121a; padding: 50px; text-align: center;">
              <p style="margin: 0; color: #f9cb00; font-size: 12px; letter-spacing: 4px; text-transform: uppercase;">Premium Quality</p>
              <h1 style="margin: 15px 0 0; color: #ffffff; font-size: 36px; font-weight: 400; letter-spacing: 3px;">SURPRISE GRANITE</h1>
              <p style="margin: 10px 0 0; color: #888; font-size: 14px; letter-spacing: 2px;">MARBLE & QUARTZ</p>
            </td>
          </tr>

          <!-- Invoice Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 40px 50px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin: 0; color: #f9cb00; font-size: 11px; letter-spacing: 3px; text-transform: uppercase;">Invoice Number</p>
                    <p style="margin: 8px 0 0; color: #ffffff; font-size: 24px; font-weight: 300;">#${invoice.number || invoice.id?.slice(-8)}</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; color: #888; font-size: 13px;">Issue Date: ${new Date().toLocaleDateString()}</p>
                    <p style="margin: 5px 0 0; color: #888; font-size: 13px;">Due: ${invoice.due_date ? new Date(invoice.due_date * 1000).toLocaleDateString() : 'Upon Receipt'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bill To Section -->
          <tr>
            <td style="background-color: #12121a; padding: 40px 50px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="50%" valign="top">
                    <p style="margin: 0; color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase;">Bill To</p>
                    <p style="margin: 15px 0 0; color: #ffffff; font-size: 20px; font-weight: 400;">${customerName || 'Valued Client'}</p>
                    <p style="margin: 8px 0 0; color: #888; font-size: 14px;">${invoice.customer_email}</p>
                  </td>
                  <td width="50%" valign="top" align="right">
                    <p style="margin: 0; color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase;">From</p>
                    <p style="margin: 15px 0 0; color: #ffffff; font-size: 14px;">${COMPANY.name}</p>
                    <p style="margin: 5px 0 0; color: #888; font-size: 13px;">${COMPANY.phone}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 0;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 20px 50px; border-bottom: 1px solid rgba(249, 203, 0, 0.2);">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase;">Description</td>
                        <td style="color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; text-align: center;" width="80">Qty</td>
                        <td style="color: #f9cb00; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; text-align: right;" width="120">Amount</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${items.map(item => `
                <tr>
                  <td style="padding: 25px 50px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #ffffff; font-size: 16px;">${item.description}</td>
                        <td style="color: #888; font-size: 14px; text-align: center;" width="80">${item.quantity || 1}</td>
                        <td style="color: #ffffff; font-size: 16px; text-align: right;" width="120">$${(item.amount).toFixed(2)}</td>
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
            <td style="background: linear-gradient(135deg, #f9cb00 0%, #d4a800 100%); padding: 30px 50px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="color: #1a1a2e; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Total Amount</td>
                  <td align="right" style="color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(invoice.amount_due / 100).toFixed(2)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pay Button -->
          <tr>
            <td style="background-color: #12121a; padding: 50px; text-align: center;">
              <a href="${invoice.hosted_invoice_url}" style="display: inline-block; border: 2px solid #f9cb00; color: #f9cb00; text-decoration: none; padding: 18px 60px; font-size: 13px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; transition: all 0.3s;">PAY INVOICE</a>
              <p style="margin: 30px 0 0; color: #666; font-size: 13px;">Secure payment powered by Stripe</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0a0a12; padding: 40px 50px; text-align: center;">
              <p style="margin: 0; color: #f9cb00; font-size: 11px; letter-spacing: 2px;">${COMPANY.name}</p>
              <p style="margin: 15px 0 0; color: #666; font-size: 12px;">${COMPANY.address}</p>
              <p style="margin: 10px 0 0; color: #666; font-size: 12px;">${COMPANY.email} • ${COMPANY.phone}</p>
              <p style="margin: 20px 0 0; color: #444; font-size: 11px;">Thank you for choosing Surprise Granite for your project.</p>
            </td>
          </tr>

          <!-- Gold Accent Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, transparent, #f9cb00, transparent);"></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
};

// Admin notification templates
const emailTemplates = {
  invoiceSent: (invoice, template = 'classic') => ({
    subject: `Invoice #${invoice.number} Sent - ${COMPANY.shortName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 22px; font-weight: 700;">${COMPANY.shortName}</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 5px 0 0; font-size: 12px;">MARBLE & QUARTZ</p>
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
    subject: `💰 Payment Received - Invoice #${invoice.number}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 22px; font-weight: 700;">${COMPANY.shortName}</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 5px 0 0; font-size: 12px;">MARBLE & QUARTZ</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; text-align: center;">
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 25px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px;">✓</span>
              </div>
              <h2 style="margin: 0 0 10px; color: #2e7d32; font-size: 24px;">Payment Received!</h2>
              <p style="margin: 0 0 30px; color: #666; font-size: 15px;">Invoice #${invoice.number} has been paid</p>
              <div style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); padding: 30px; border-radius: 12px; margin-bottom: 25px;">
                <p style="margin: 0 0 5px; color: #388e3c; font-size: 12px; text-transform: uppercase;">Amount Received</p>
                <p style="margin: 0; color: #1b5e20; font-size: 36px; font-weight: 700;">$${(invoice.amount_paid / 100).toFixed(2)}</p>
              </div>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px; text-align: left;">
                <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Customer</p>
                <p style="margin: 0; color: #1a1a2e; font-size: 15px; font-weight: 600;">${invoice.customer_email}</p>
              </div>
              <a href="${invoice.hosted_invoice_url}" style="display: inline-block; background: #1a1a2e; color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-size: 14px;">View Receipt</a>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">${COMPANY.name} • ${COMPANY.phone}</p>
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
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 22px; font-weight: 700;">${COMPANY.shortName}</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 5px 0 0; font-size: 12px;">MARBLE & QUARTZ</p>
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

// Middleware
app.use(cors({
  origin: [
    'https://www.surprisegranite.com',
    'https://surprisegranite.com',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Surprise Granite API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
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

    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: due_days,
      description,
      footer: notes || 'Thank you for your business! - Surprise Granite',
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

// ============ WEBHOOK HANDLER ============

// Stripe webhooks (raw body needed)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  const invoice = event.data.object;

  switch (event.type) {
    case 'invoice.paid':
      console.log('Invoice paid:', invoice.id);
      // Send payment received notification to admin
      const paidEmail = emailTemplates.paymentReceived(invoice);
      await sendNotification(ADMIN_EMAIL, paidEmail.subject, paidEmail.html);
      break;

    case 'invoice.payment_failed':
      console.log('Invoice payment failed:', invoice.id);
      // Send payment failed notification to admin
      const failedEmail = emailTemplates.paymentFailed(invoice);
      await sendNotification(ADMIN_EMAIL, failedEmail.subject, failedEmail.html);
      break;

    case 'invoice.sent':
      console.log('Invoice sent:', invoice.id);
      break;

    case 'invoice.finalized':
      console.log('Invoice finalized:', invoice.id);
      break;

    case 'account.updated':
      console.log('Connect account updated:', event.data.object.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Surprise Granite API running on port ${PORT}`);
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
});
