const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
require('dotenv').config();

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
  phone: '(623) 466-2424',
  address: '15464 W Aster Dr, Surprise, AZ 85379',
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
    subject: `Payment Received - Invoice #${invoice.number} | Surprise Granite`,
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
                    <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 12px;">Payment Receipt</p>
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
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 25px; line-height: 80px;">
                <span style="font-size: 40px; color: #fff;">✓</span>
              </div>
              <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 24px;">Order Confirmed!</h2>
              <p style="margin: 0 0 5px; color: #666; font-size: 15px;">Order #SG-${session.id.slice(-8).toUpperCase()}</p>
              <p style="margin: 0 0 30px; color: #666; font-size: 15px;">Thank you for your purchase!</p>
              <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
                <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase;">Order Total</p>
                <p style="margin: 0; color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(session.amount_total / 100).toFixed(2)}</p>
              </div>
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">We're preparing your order and will send you shipping information once it's on its way.</p>
              <a href="https://www.surprisegranite.com/shop" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 15px 35px; border-radius: 8px; font-weight: 600;">Continue Shopping</a>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fa; padding: 25px; text-align: center;">
              <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Questions about your order?</p>
              <p style="margin: 0; color: #888; font-size: 13px;"><a href="mailto:${COMPANY.email}" style="color: #f9cb00; text-decoration: none;">${COMPANY.email}</a> • <a href="tel:${COMPANY.phone}" style="color: #f9cb00; text-decoration: none;">${COMPANY.phone}</a></p>
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
        const paidEmail = emailTemplates.paymentReceived(invoice);
        await sendNotification(ADMIN_EMAIL, paidEmail.subject, paidEmail.html);
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

// Submit a new lead (from estimate form)
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
      source = 'website'
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

    // Send notification to admin
    const adminEmail = {
      subject: `New Lead - ${project_type} in ${project_zip}`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px; text-align: center;">
      <h1 style="color: #f9cb00; margin: 0; font-size: 20px;">New Lead Received!</h1>
    </div>
    <div style="padding: 25px;">
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32; font-weight: 600;">Lead Value: $${lead_price}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Name:</td>
          <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">${homeowner_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Email:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${homeowner_email}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Phone:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${homeowner_phone || 'Not provided'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 13px;">Project:</td>
          <td style="padding: 8px 0; color: #1a1a2e;">${project_type}</td>
        </tr>
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
      </table>
      ${project_details ? `
      <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
        <p style="margin: 0 0 8px; color: #666; font-size: 12px; text-transform: uppercase;">Project Details:</p>
        <p style="margin: 0; color: #1a1a2e; font-size: 14px;">${project_details}</p>
      </div>
      ` : ''}
      <div style="margin-top: 20px; text-align: center;">
        <a href="https://www.surprisegranite.com/vendor/dashboard/" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600;">View in Dashboard</a>
      </div>
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

// Start server
app.listen(PORT, () => {
  console.log(`Surprise Granite API running on port ${PORT}`);
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`Replicate configured: ${!!process.env.REPLICATE_API_TOKEN}`);
});
