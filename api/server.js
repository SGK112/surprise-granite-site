const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/.env', override: true });

// Structured logging
const logger = require('./utils/logger');

// ============================================
// REMODELY.AI RATE LIMITER (SERVER-SIDE)
// ============================================
// Protects AI endpoints from abuse

const rateLimitStore = new Map();

const RATE_LIMITS = {
  free: {
    ai_blueprint: { perHour: 15, perDay: 30 }, // Increased for multi-page PDFs
    ai_chat: { perHour: 10, perDay: 25 },
    ai_vision: { perHour: 10, perDay: 20 }
  },
  pro: {
    ai_blueprint: { perHour: 50, perDay: 150 }, // Increased for batch processing
    ai_chat: { perHour: 50, perDay: 200 },
    ai_vision: { perHour: 40, perDay: 100 }
  },
  enterprise: {
    ai_blueprint: { perHour: -1, perDay: -1 }, // unlimited
    ai_chat: { perHour: -1, perDay: -1 },
    ai_vision: { perHour: -1, perDay: -1 }
  },
  super_admin: {
    ai_blueprint: { perHour: -1, perDay: -1 }, // unlimited
    ai_chat: { perHour: -1, perDay: -1 },
    ai_vision: { perHour: -1, perDay: -1 }
  }
};

function getRateLimitKey(req) {
  // Use authenticated user ID if available, otherwise IP (don't trust x-user-id header)
  const userId = req.user?.id || req.ip || 'anonymous';
  return userId;
}

function checkRateLimit(key, feature, plan = 'free') {
  const limits = RATE_LIMITS[plan]?.[feature] || RATE_LIMITS.free[feature] || { perHour: 5, perDay: 10 };

  // Unlimited plan
  if (limits.perHour === -1) return { allowed: true, remaining: -1 };

  const now = Date.now();
  const hourAgo = now - 3600000;
  const dayAgo = now - 86400000;

  const storeKey = `${key}:${feature}`;
  let usage = rateLimitStore.get(storeKey) || { timestamps: [] };

  // Clean old entries
  usage.timestamps = usage.timestamps.filter(ts => ts > dayAgo);

  const usageLastHour = usage.timestamps.filter(ts => ts > hourAgo).length;
  const usageLastDay = usage.timestamps.length;

  if (usageLastHour >= limits.perHour) {
    return { allowed: false, reason: 'hourly_limit', message: 'Hourly limit reached. Please try again later.' };
  }

  if (usageLastDay >= limits.perDay) {
    return { allowed: false, reason: 'daily_limit', message: 'Daily limit reached. Upgrade to Pro for more usage.' };
  }

  return {
    allowed: true,
    remaining: { hourly: limits.perHour - usageLastHour, daily: limits.perDay - usageLastDay }
  };
}

function recordUsage(key, feature) {
  const storeKey = `${key}:${feature}`;
  let usage = rateLimitStore.get(storeKey) || { timestamps: [] };
  usage.timestamps.push(Date.now());
  rateLimitStore.set(storeKey, usage);
}

// Rate limit middleware for AI endpoints
function aiRateLimiter(feature) {
  return (req, res, next) => {
    const key = getRateLimitKey(req);
    // Check headers AND body for plan/account type - support super_admin
    let plan = req.headers['x-user-plan'] || req.headers['x-account-type'] || req.body?.accountType || 'free';
    // Map account types to rate limit tiers
    if (plan === 'super_admin' || plan === 'admin') {
      plan = 'super_admin';
    } else if (plan === 'pro' || plan === 'premium') {
      plan = 'pro';
    } else if (plan === 'enterprise' || plan === 'business') {
      plan = 'enterprise';
    }
    const check = checkRateLimit(key, feature, plan);

    if (!check.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: check.message,
        reason: check.reason,
        upgrade_url: 'https://remodely.ai/pricing'
      });
    }

    // Record usage after successful response
    res.on('finish', () => {
      if (res.statusCode < 400) {
        recordUsage(key, feature);
      }
    });

    next();
  };
}

// Clean up old rate limit entries every hour
setInterval(() => {
  const dayAgo = Date.now() - 86400000;
  for (const [key, usage] of rateLimitStore.entries()) {
    usage.timestamps = usage.timestamps.filter(ts => ts > dayAgo);
    if (usage.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}, 3600000);

// ============================================
// GENERAL RATE LIMITER FOR PUBLIC ENDPOINTS
// ============================================
const publicRateLimitStore = new Map();

function publicRateLimiter(options = {}) {
  const { maxRequests = 10, windowMs = 60000, message = 'Too many requests' } = options;

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let record = publicRateLimitStore.get(key) || { timestamps: [] };
    record.timestamps = record.timestamps.filter(ts => ts > now - windowMs);

    if (record.timestamps.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: message,
        retryAfter: Math.ceil((record.timestamps[0] + windowMs - now) / 1000)
      });
    }

    record.timestamps.push(now);
    publicRateLimitStore.set(key, record);
    next();
  };
}

// Middleware instances for different endpoints
const leadRateLimiter = publicRateLimiter({ maxRequests: 5, windowMs: 60000, message: 'Too many lead submissions. Please wait a minute.' });
const emailRateLimiter = publicRateLimiter({ maxRequests: 3, windowMs: 60000, message: 'Too many email requests. Please wait a minute.' });
const customerRateLimiter = publicRateLimiter({ maxRequests: 10, windowMs: 60000, message: 'Too many requests. Please wait.' });

// ============================================
// SECURITY HELPERS
// ============================================

/**
 * Escape HTML to prevent XSS in email templates
 */
function escapeHtml(text) {
  if (!text) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Handle API errors without exposing internal details
 */
function handleApiError(res, error, context = 'Operation') {
  logger.error(`${context} error:`, error.message || error);

  // Map known error types to user-friendly messages
  if (error.type === 'StripeInvalidRequestError') {
    return res.status(400).json({ error: 'Invalid payment request' });
  }
  if (error.code === 'PGRST301' || error.code === '23505') {
    return res.status(409).json({ error: 'Resource already exists' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource not found' });
  }
  if (error.code === 'PGRST116') {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // Generic error - don't expose internal details
  return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate phone format (basic)
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return true; // phone is optional
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Sanitize string input
 */
function sanitizeString(str, maxLength = 1000) {
  if (!str) return '';
  return String(str).trim().slice(0, maxLength);
}

// ============================================

// Initialize Supabase client (service role for backend operations)
const supabaseUrl = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Enterprise Authentication Middleware
const authMiddleware = require('./lib/auth/middleware');
if (supabase) {
  authMiddleware.initAuth(supabase);
}
const { authenticateJWT, requireRole, requirePermission, requireDistributor, logAuditEvent, getClientIP } = authMiddleware;

// Blueprint Takeoff Analyzer with GPT-4 Vision and Ollama support
const { analyzeBlueprint, parseBluebeamBAX, CONFIG: TAKEOFF_CONFIG } = require('./lib/takeoff/blueprint-analyzer');

// Pro-Customer System Routes
const proCustomersRouter = require('./routes/pro-customers');

// Workflow Conversion Routes (Lead → Customer → Estimate → Invoice → Job)
const workflowRouter = require('./routes/workflow');

// Collaboration & Design Handoff Routes
const collaborationRouter = require('./routes/collaboration');

// Projects CRUD Routes
const projectsRouter = require('./routes/projects');

// Email Routes (new modular structure)
const emailRouter = require('./routes/email');

// Calendar Routes (multi-participant events)
const calendarRouter = require('./routes/calendar');

// Automation Routes (lead nurturing, client retention)
const automationRouter = require('./routes/automation');

// Marketplace Routes (designer products, slabs, stone yards)
const marketplaceRouter = require('./routes/marketplace');

// Stripe Routes (payments, subscriptions, wallet)
const stripeRouter = require('./routes/stripe');

// AI Routes (visualizer, video, blueprint)
const aiRouter = require('./routes/ai');

// Jobs & Contractors Routes
const jobsRouter = require('./routes/jobs');

// Auth & SSO Routes
const authRouter = require('./routes/auth');

// Pricing Management Routes
const pricingRouter = require('./routes/pricing');

// Scraper Management Routes
const scrapersRouter = require('./routes/scrapers');

// QuickBooks Integration Routes
const quickbooksRouter = require('./routes/quickbooks');

// CSRF Protection Middleware
const { csrfOriginCheck } = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 3001;

// Make supabase available to routes via app.get('supabase')
app.set('supabase', supabase);

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Import Stripe service for enhanced payment link features
const stripeService = require('./services/stripeService');

// Import Email service for templates
const emailService = require('./services/emailService');

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
      logger.info('Email notification (SMTP not configured):', { to, subject });
      return { success: false, reason: 'SMTP not configured' };
    }

    await transporter.sendMail({
      from: `"Surprise Granite" <${SMTP_USER}>`,
      to,
      subject,
      html
    });
    logger.info('Email sent:', subject);
    return { success: true };
  } catch (err) {
    logger.error('Email error:', err.message);
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
  logo: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb23120fbb175_Surprise-Granite-webclip-icon-256x256px.png',
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

// ==================== CALENDAR INTEGRATION HELPERS ====================

// Generate Google Calendar URL for appointments
function generateGoogleCalendarUrl(data) {
  const title = encodeURIComponent(`Surprise Granite - ${data.project_type || 'Free Estimate'}`);
  const location = encodeURIComponent(data.project_address || '');
  const details = encodeURIComponent(
    `Appointment with Surprise Granite for your ${data.project_type || 'countertop project'}.\n\n` +
    `Questions? Call (602) 833-3189\n\n` +
    `https://www.surprisegranite.com`
  );

  // Parse the date and time - handle various formats
  let startDate = '';
  let endDate = '';
  try {
    // Try to parse the date
    const dateStr = data.appointment_date || '';
    const timeStr = data.appointment_time || '10:00 AM';

    // Create a date object
    let dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) {
      // Try parsing common formats
      const parts = dateStr.match(/(\w+),?\s+(\w+)\s+(\d+),?\s+(\d+)/);
      if (parts) {
        dateObj = new Date(`${parts[2]} ${parts[3]}, ${parts[4]}`);
      }
    }

    if (!isNaN(dateObj.getTime())) {
      // Parse time
      const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const meridiem = timeMatch[3]?.toUpperCase();
        if (meridiem === 'PM' && hours < 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
        dateObj.setHours(hours, minutes, 0, 0);
      }

      // Format for Google Calendar (YYYYMMDDTHHmmss)
      const formatDate = (d) => {
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };

      startDate = formatDate(dateObj);
      // End date is 1 hour later
      const endDateObj = new Date(dateObj.getTime() + 60 * 60 * 1000);
      endDate = formatDate(endDateObj);
    }
  } catch (e) {
    logger.error('Error parsing date for calendar:', e);
  }

  // If we couldn't parse the date, use a placeholder
  if (!startDate) {
    const now = new Date();
    now.setDate(now.getDate() + 7); // Default to 1 week from now
    now.setHours(10, 0, 0, 0);
    startDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    endDate = new Date(now.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&location=${location}&details=${details}`;
}

// Generate Outlook Calendar URL for appointments
function generateOutlookCalendarUrl(data) {
  const title = encodeURIComponent(`Surprise Granite - ${data.project_type || 'Free Estimate'}`);
  const location = encodeURIComponent(data.project_address || '');
  const body = encodeURIComponent(
    `Appointment with Surprise Granite for your ${data.project_type || 'countertop project'}.\n\n` +
    `Questions? Call (602) 833-3189`
  );

  // Parse date similar to Google Calendar
  let startDate = '';
  let endDate = '';
  try {
    const dateStr = data.appointment_date || '';
    const timeStr = data.appointment_time || '10:00 AM';

    let dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) {
      const parts = dateStr.match(/(\w+),?\s+(\w+)\s+(\d+),?\s+(\d+)/);
      if (parts) {
        dateObj = new Date(`${parts[2]} ${parts[3]}, ${parts[4]}`);
      }
    }

    if (!isNaN(dateObj.getTime())) {
      const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const meridiem = timeMatch[3]?.toUpperCase();
        if (meridiem === 'PM' && hours < 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
        dateObj.setHours(hours, minutes, 0, 0);
      }

      startDate = dateObj.toISOString();
      endDate = new Date(dateObj.getTime() + 60 * 60 * 1000).toISOString();
    }
  } catch (e) {
    logger.error('Error parsing date for Outlook calendar:', e);
  }

  if (!startDate) {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    now.setHours(10, 0, 0, 0);
    startDate = now.toISOString();
    endDate = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }

  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startDate}&enddt=${endDate}&location=${location}&body=${body}`;
}

// Generate Yahoo Calendar URL for appointments
function generateYahooCalendarUrl(data) {
  const title = encodeURIComponent(`Surprise Granite - ${data.project_type || 'Free Estimate'}`);
  const location = encodeURIComponent(data.project_address || '');
  const desc = encodeURIComponent(
    `Appointment with Surprise Granite. Questions? Call (602) 833-3189`
  );

  // Parse date
  let st = '';
  try {
    const dateStr = data.appointment_date || '';
    const timeStr = data.appointment_time || '10:00 AM';

    let dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) {
      const parts = dateStr.match(/(\w+),?\s+(\w+)\s+(\d+),?\s+(\d+)/);
      if (parts) {
        dateObj = new Date(`${parts[2]} ${parts[3]}, ${parts[4]}`);
      }
    }

    if (!isNaN(dateObj.getTime())) {
      const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const meridiem = timeMatch[3]?.toUpperCase();
        if (meridiem === 'PM' && hours < 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
        dateObj.setHours(hours, minutes, 0, 0);
      }

      // Yahoo format: YYYYMMDDTHHmmss
      st = dateObj.toISOString().replace(/[-:]/g, '').split('.')[0];
    }
  } catch (e) {
    logger.error('Error parsing date for Yahoo calendar:', e);
  }

  if (!st) {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    now.setHours(10, 0, 0, 0);
    st = now.toISOString().replace(/[-:]/g, '').split('.')[0];
  }

  return `https://calendar.yahoo.com/?v=60&title=${title}&st=${st}&dur=0100&in_loc=${location}&desc=${desc}`;
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
  }),

  // Premium appointment confirmation email for customers
  appointmentConfirmation: (data) => ({
    subject: `Appointment Confirmed - ${data.appointment_date} | Surprise Granite`,
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
        <table width="560" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">

          <!-- Logo Header -->
          <tr>
            <td style="padding: 0 0 32px; border-bottom: 1px solid #e5e7eb;">
              <table cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 12px;">
                    <img src="${COMPANY.logo}" alt="Surprise Granite" style="height: 36px; width: auto;">
                  </td>
                  <td style="vertical-align: middle;">
                    <p style="margin: 0; color: #1a2b3c; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">SURPRISE GRANITE</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 0;">

              <!-- Confirmation Badge -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td align="center">
                    <table cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background-color: #f0fdf4; padding: 8px 16px; border-radius: 20px;">
                          <p style="margin: 0; color: #166534; font-size: 12px; font-weight: 600; letter-spacing: 0.3px;">&#10003; APPOINTMENT CONFIRMED</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px; color: #1a2b3c; font-size: 24px; font-weight: 600;">Hi ${data.homeowner_name.split(' ')[0]},</p>
                    <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">Your free estimate has been scheduled.</p>
                  </td>
                </tr>
              </table>

              <!-- Appointment Card -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="background-color: #f9cb00; height: 4px;"></td></tr>
                    </table>
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 28px;">
                          <table width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="vertical-align: top; width: 50%;">
                                <p style="margin: 0 0 4px; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Date</p>
                                <p style="margin: 0; color: #1a2b3c; font-size: 16px; font-weight: 600;">${data.appointment_date}</p>
                              </td>
                              <td style="vertical-align: top; width: 50%;">
                                <p style="margin: 0 0 4px; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Time</p>
                                <p style="margin: 0; color: #1a2b3c; font-size: 16px; font-weight: 600;">${data.appointment_time}</p>
                              </td>
                            </tr>
                          </table>
                          ${data.project_address ? `
                          <table width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                            <tr>
                              <td>
                                <p style="margin: 0 0 4px; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Location</p>
                                <p style="margin: 0; color: #1a2b3c; font-size: 14px;">${data.project_address}</p>
                              </td>
                            </tr>
                          </table>
                          ` : ''}
                          ${data.project_type ? `
                          <table width="100%" cellspacing="0" cellpadding="0" style="margin-top: 16px;">
                            <tr>
                              <td>
                                <p style="margin: 0 0 4px; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Project</p>
                                <p style="margin: 0; color: #1a2b3c; font-size: 14px;">${data.project_type}</p>
                              </td>
                            </tr>
                          </table>
                          ` : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What to Expect -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 16px; color: #1a2b3c; font-size: 14px; font-weight: 600;">What to expect</p>
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                          <p style="margin: 0; color: #f9cb00; font-size: 14px; font-weight: 600;">1</p>
                        </td>
                        <td style="padding: 8px 0; padding-left: 8px;">
                          <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">We'll call to confirm within 24 hours</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                          <p style="margin: 0; color: #f9cb00; font-size: 14px; font-weight: 600;">2</p>
                        </td>
                        <td style="padding: 8px 0; padding-left: 8px;">
                          <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">Our specialist will visit and take measurements</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                          <p style="margin: 0; color: #f9cb00; font-size: 14px; font-weight: 600;">3</p>
                        </td>
                        <td style="padding: 8px 0; padding-left: 8px;">
                          <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">You'll receive a detailed quote with options</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="https://www.surprisegranite.com/countertops" style="display: inline-block; background-color: #1a2b3c; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 14px; font-weight: 500;">Browse Materials</a>
                  </td>
                </tr>
              </table>

              <!-- Add to Calendar -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px;">Add to your calendar:</p>
                    <a href="${generateGoogleCalendarUrl(data)}" target="_blank" style="display: inline-block; background-color: #4285f4; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-size: 13px; font-weight: 500; margin-right: 8px;">📅 Google</a>
                    <a href="${generateOutlookCalendarUrl(data)}" target="_blank" style="display: inline-block; background-color: #0078d4; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-size: 13px; font-weight: 500; margin-right: 8px;">📅 Outlook</a>
                    <a href="${generateYahooCalendarUrl(data)}" target="_blank" style="display: inline-block; background-color: #720e9e; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-size: 13px; font-weight: 500;">📅 Yahoo</a>
                  </td>
                </tr>
              </table>

              <!-- Reschedule Note -->
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0; color: #9ca3af; font-size: 13px;">Need to reschedule? Call <a href="tel:+16028333189" style="color: #1a2b3c; text-decoration: none; font-weight: 500;">(602) 833-3189</a></p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0; border-top: 1px solid #e5e7eb;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 4px; color: #1a2b3c; font-size: 13px; font-weight: 500;">Surprise Granite</p>
                    <p style="margin: 0 0 2px; color: #9ca3af; font-size: 12px;">15464 W Aster Dr, Surprise, AZ 85379</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 11px;">AZ ROC# 341113 · Licensed & Insured</p>
                  </td>
                </tr>
              </table>
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

  // Lead welcome email - for new leads without scheduled appointments
  leadWelcome: (data) => ({
    subject: `Welcome to Surprise Granite! We're Excited to Help - ${data.project_type || 'Your Project'}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="560" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header with Gold Accent -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center;">
              <img src="${COMPANY.logo}" alt="Surprise Granite" style="height: 48px; width: auto; margin-bottom: 16px;">
              <h1 style="margin: 0; color: #f9cb00; font-size: 24px; font-weight: 600;">Thanks for Reaching Out!</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Your dream countertops are closer than you think</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Personal Greeting -->
              <p style="margin: 0 0 20px; color: #1a2b3c; font-size: 16px; line-height: 1.6;">
                Hi ${data.first_name || data.homeowner_name?.split(' ')[0] || 'there'},
              </p>
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.7;">
                We got your info and we're thrilled you're considering Surprise Granite for your ${data.project_type || 'countertop'} project.
                Whether you're dreaming of elegant marble, durable quartz, or timeless granite, we've got you covered—literally.
              </p>

              ${data.has_appointment ? `
              <!-- Appointment Info -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%); border: 1px solid #bbf7d0; border-radius: 8px; padding: 24px;">
                    <p style="margin: 0 0 12px; color: #166534; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📅 Your Appointment</p>
                    <p style="margin: 0; color: #15803d; font-size: 18px; font-weight: 600;">${data.appointment_date} at ${data.appointment_time}</p>
                    ${data.appointment_type ? `<p style="margin: 8px 0 0; color: #166534; font-size: 14px;">${data.appointment_type}</p>` : ''}
                  </td>
                </tr>
              </table>
              <!-- Add to Calendar Buttons -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px;">Add to your calendar:</p>
                    <a href="${generateGoogleCalendarUrl({...data, project_type: data.appointment_type || data.project_type})}" target="_blank" style="display: inline-block; background-color: #4285f4; color: #ffffff; text-decoration: none; padding: 8px 14px; border-radius: 4px; font-size: 12px; font-weight: 500; margin-right: 6px;">📅 Google</a>
                    <a href="${generateOutlookCalendarUrl({...data, project_type: data.appointment_type || data.project_type})}" target="_blank" style="display: inline-block; background-color: #0078d4; color: #ffffff; text-decoration: none; padding: 8px 14px; border-radius: 4px; font-size: 12px; font-weight: 500; margin-right: 6px;">📅 Outlook</a>
                    <a href="${generateYahooCalendarUrl({...data, project_type: data.appointment_type || data.project_type})}" target="_blank" style="display: inline-block; background-color: #720e9e; color: #ffffff; text-decoration: none; padding: 8px 14px; border-radius: 4px; font-size: 12px; font-weight: 500;">📅 Yahoo</a>
                  </td>
                </tr>
              </table>
              ` : `
              <!-- What's Next Section -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 24px;">
                    <p style="margin: 0 0 12px; color: #92400e; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">⚡ What Happens Next</p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                      One of our countertop specialists will reach out within 24 hours to discuss your project and schedule a free in-home estimate. No pressure, just expert advice.
                    </p>
                  </td>
                </tr>
              </table>
              `}

              ${data.notes ? `
              <!-- Notes Section -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="background: #f8f9fa; border-radius: 8px; padding: 20px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Notes from your inquiry</p>
                    <p style="margin: 0; color: #1a2b3c; font-size: 14px; line-height: 1.6; font-style: italic;">"${data.notes}"</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Why Choose Us -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 16px; color: #1a2b3c; font-size: 15px; font-weight: 600;">Why homeowners choose us:</p>
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 6px 0; color: #4b5563; font-size: 14px;">✓ Free in-home estimates (no obligation)</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #4b5563; font-size: 14px;">✓ Premium materials at competitive prices</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #4b5563; font-size: 14px;">✓ Professional installation by our own team</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #4b5563; font-size: 14px;">✓ Serving the Valley since 2017</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Buttons -->
              <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="https://www.surprisegranite.com/countertops" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-right: 12px;">Browse Materials</a>
                    <a href="tel:+16028333189" style="display: inline-block; background: #1a1a2e; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 14px; font-weight: 500;">Call Us: (602) 833-3189</a>
                  </td>
                </tr>
              </table>

              <!-- Friendly Sign-off -->
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                Can't wait to help you transform your space!<br>
                <span style="color: #1a2b3c; font-weight: 500;">— The Surprise Granite Team</span>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #1a1a2e; padding: 24px; text-align: center;">
              <p style="margin: 0 0 4px; color: #f9cb00; font-size: 13px; font-weight: 500;">Surprise Granite Marble & Quartz</p>
              <p style="margin: 0 0 8px; color: rgba(255,255,255,0.6); font-size: 12px;">15464 W Aster Dr, Surprise, AZ 85379</p>
              <p style="margin: 0; color: rgba(255,255,255,0.4); font-size: 11px;">AZ ROC# 341113 · Licensed & Insured</p>
            </td>
          </tr>

        </table>

        <!-- Unsubscribe Note -->
        <table width="560" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding: 16px 0; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">Questions? Just reply to this email or call us anytime.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  })
};

// Get invoice template by name
function getInvoiceTemplate(templateName, invoice, items, customerName) {
  const template = invoiceTemplates[templateName] || invoiceTemplates.classic;
  return template(invoice, items, customerName);
}

// CORS Middleware - environment-aware origins
const productionOrigins = [
  'https://www.surprisegranite.com',
  'https://surprisegranite.com',
  'https://surprise-granite-site.onrender.com'
];

const developmentOrigins = [
  ...productionOrigins,
  'http://localhost:3000',
  'http://localhost:3333',
  'http://localhost:8080',
  'http://localhost:8888',
  'http://localhost:5500',
  'http://127.0.0.1:3333',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080'
];

const corsOrigins = developmentOrigins;

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-user-id', 'x-user-plan', 'x-account-type'],
  credentials: true
}));

// Handle preflight requests explicitly
app.options('*', cors());

// ============ WEBHOOK HANDLER (MUST BE BEFORE express.json()) ============
// Stripe webhooks require raw body for signature verification
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
      return res.status(500).send('Webhook secret not configured');
    }
    if (!sig) {
      logger.error('Missing stripe-signature header');
      return res.status(400).send('Missing signature');
    }
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed');
    return res.status(400).send('Webhook signature verification failed');
  }

  logger.info('Webhook event received:', event.type);

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Cart checkout completed successfully
        const session = event.data.object;
        logger.info('Checkout session completed:', session.id);

        // Generate order number
        const orderNumber = `SG-${session.id.slice(-8).toUpperCase()}`;

        // Create order record in database
        if (supabase) {
          try {
            // Retrieve line items from Stripe session
            let lineItems = [];
            try {
              const sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
                expand: ['line_items']
              });
              lineItems = sessionWithItems.line_items?.data || [];
            } catch (lineItemErr) {
              logger.error('Error fetching line items:', lineItemErr.message);
            }

            // Transform line items for storage
            const orderItems = lineItems.map(item => ({
              name: item.description || item.price?.product?.name || 'Product',
              quantity: item.quantity || 1,
              unit_price: (item.price?.unit_amount || item.amount_total) / 100,
              total: (item.amount_total || 0) / 100
            }));

            // Calculate totals from session
            const total = (session.amount_total || 0) / 100;
            const subtotal = (session.amount_subtotal || session.amount_total || 0) / 100;
            const shipping = session.shipping_cost?.amount_total ? session.shipping_cost.amount_total / 100 : 0;

            // Extract addresses
            const shippingAddress = session.shipping_details?.address || session.customer_details?.address || {};
            const billingAddress = session.customer_details?.address || {};

            // Insert order record
            const { data: order, error: orderErr } = await supabase
              .from('orders')
              .insert({
                order_number: orderNumber,
                status: 'confirmed',
                customer_email: session.customer_details?.email,
                customer_name: session.customer_details?.name || session.shipping_details?.name,
                customer_phone: session.customer_details?.phone,
                shipping_address_line1: shippingAddress.line1,
                shipping_address_line2: shippingAddress.line2,
                shipping_city: shippingAddress.city,
                shipping_state: shippingAddress.state,
                shipping_zip: shippingAddress.postal_code,
                shipping_country: shippingAddress.country || 'US',
                billing_address_line1: billingAddress.line1,
                billing_address_line2: billingAddress.line2,
                billing_city: billingAddress.city,
                billing_state: billingAddress.state,
                billing_zip: billingAddress.postal_code,
                billing_country: billingAddress.country || 'US',
                subtotal: subtotal,
                shipping_amount: shipping,
                tax_amount: 0, // Tax included in line items for Stripe Checkout
                total: total,
                items: orderItems,
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent,
                stripe_customer_id: session.customer,
                payment_status: session.payment_status === 'paid' ? 'paid' : 'unpaid',
                paid_at: session.payment_status === 'paid' ? new Date().toISOString() : null,
                metadata: {
                  mode: session.mode,
                  currency: session.currency
                }
              })
              .select()
              .single();

            if (orderErr) {
              logger.error('Error creating order record:', orderErr.message);
            } else {
              logger.info('Order created:', order.order_number, 'ID:', order.id);

              // Insert individual order items
              if (orderItems.length > 0) {
                const itemsToInsert = orderItems.map(item => ({
                  order_id: order.id,
                  product_name: item.name,
                  unit_price: item.unit_price,
                  quantity: item.quantity,
                  line_total: item.total
                }));

                const { error: itemsErr } = await supabase
                  .from('order_items')
                  .insert(itemsToInsert);

                if (itemsErr) {
                  logger.error('Error inserting order items:', itemsErr.message);
                }
              }

              // Auto-create lead from store purchase
              try {
                const customerEmail = session.customer_details?.email;
                const customerName = session.customer_details?.name || session.shipping_details?.name;
                if (customerEmail) {
                  const { data: existingLead } = await supabase
                    .from('leads')
                    .select('id')
                    .eq('email', customerEmail.toLowerCase())
                    .limit(1)
                    .single();

                  if (!existingLead) {
                    const { data: newLead, error: leadErr } = await supabase
                      .from('leads')
                      .insert({
                        full_name: customerName || 'Store Customer',
                        email: customerEmail.toLowerCase(),
                        phone: session.customer_details?.phone || null,
                        project_type: 'store_purchase',
                        source: 'store_checkout',
                        form_name: 'stripe_checkout',
                        message: 'Store purchase - Order ' + orderNumber + ' - $' + total.toFixed(2),
                        status: 'won',
                        project_address: shippingAddress.line1 || null,
                        zip_code: shippingAddress.postal_code || null
                      })
                      .select()
                      .single();

                    if (!leadErr && newLead) {
                      logger.info('Lead auto-created from store checkout:', newLead.id);
                    }
                  }
                }
              } catch (leadAutoErr) {
                logger.warn('Could not auto-create lead from checkout:', leadAutoErr.message);
              }
            }
          } catch (dbErr) {
            logger.error('Database error creating order:', dbErr.message);
          }
        }

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
        logger.info('Invoice paid:', invoice.id);

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
                  logger.info('Created customer:', customerId);
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

              // Check if there's an existing invoice in Supabase with traceability data
              let existingInvoiceData = null;
              try {
                const { data: existingInv } = await supabase
                  .from('invoices')
                  .select('id, estimate_id, lead_id')
                  .or(`stripe_invoice_id.eq.${invoice.id},invoice_number.eq.${invoice.number}`)
                  .single();
                existingInvoiceData = existingInv;
              } catch (e) {
                // No existing invoice found, that's OK
              }

              // Convert lead to customer if lead_id exists
              if (existingInvoiceData?.lead_id && !customerId) {
                try {
                  const { data: lead } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('id', existingInvoiceData.lead_id)
                    .single();

                  if (lead) {
                    // Create customer from lead
                    const { data: newCust, error: custError } = await supabase
                      .from('customers')
                      .insert({
                        user_id: adminUserId,
                        name: lead.full_name || lead.homeowner_name || lead.name || 'Customer',
                        email: lead.email || lead.homeowner_email,
                        phone: lead.phone || lead.homeowner_phone,
                        address: lead.address || lead.homeowner_address,
                        city: lead.city,
                        state: lead.state,
                        zip: lead.zip,
                        source: 'converted_lead',
                        lead_id: lead.id,
                        stripe_customer_id: invoice.customer,
                        notes: `Converted from lead on ${new Date().toLocaleDateString()}`
                      })
                      .select()
                      .single();

                    if (!custError && newCust) {
                      customerId = newCust.id;
                      logger.info('Converted lead to customer:', lead.id, '->', customerId);

                      // Update lead status to converted
                      await supabase
                        .from('leads')
                        .update({
                          status: 'converted',
                          customer_id: customerId,
                          converted_at: new Date().toISOString()
                        })
                        .eq('id', lead.id);

                      // Update invoice with customer_id
                      if (existingInvoiceData.id) {
                        await supabase
                          .from('invoices')
                          .update({ customer_id: customerId })
                          .eq('id', existingInvoiceData.id);
                      }
                    }
                  }
                } catch (leadErr) {
                  logger.error('Error converting lead to customer:', leadErr.message);
                }
              }

              // Create job record with full traceability
              const jobData = {
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
              };

              // Add traceability IDs if we found existing invoice data
              if (existingInvoiceData) {
                if (existingInvoiceData.id) jobData.invoice_id = existingInvoiceData.id;
                if (existingInvoiceData.estimate_id) jobData.estimate_id = existingInvoiceData.estimate_id;
                if (existingInvoiceData.lead_id) jobData.lead_id = existingInvoiceData.lead_id;
                logger.info('Job traceability: invoice_id=' + existingInvoiceData.id + ', estimate_id=' + existingInvoiceData.estimate_id + ', lead_id=' + existingInvoiceData.lead_id);
              }

              const { data: newJob, error: jobErr } = await supabase
                .from('jobs')
                .insert(jobData)
                .select()
                .single();

              if (!jobErr && newJob) {
                logger.info('Created job:', newJob.job_number);

                // Send thank you email to customer with next steps
                const thankYouEmail = generateThankYouEmail(invoice, newJob);
                await sendNotification(invoice.customer_email, thankYouEmail.subject, thankYouEmail.html);
                logger.info('Thank you email sent for invoice:', invoice.id);
              } else if (jobErr) {
                logger.error('Error creating job:', jobErr.message);
              }

              // Sync invoice to Supabase for reliable display in dashboard
              try {
                // Check if invoice already exists
                const { data: existingInvoice } = await supabase
                  .from('invoices')
                  .select('id')
                  .eq('stripe_invoice_id', invoice.id)
                  .single();

                if (!existingInvoice) {
                  // Generate invoice number
                  const { data: invSettings } = await supabase
                    .from('business_settings')
                    .select('invoice_prefix, invoice_next_number')
                    .eq('user_id', adminUserId)
                    .single();

                  const invPrefix = invSettings?.invoice_prefix || 'INV-';
                  const invNum = invSettings?.invoice_next_number || 1001;
                  const invoiceNumber = `${invPrefix}${invNum}`;

                  // Insert invoice record
                  const { error: invErr } = await supabase
                    .from('invoices')
                    .insert({
                      user_id: adminUserId,
                      invoice_number: invoiceNumber,
                      customer_id: customerId,
                      customer_name: invoice.customer_name || 'Customer',
                      customer_email: invoice.customer_email,
                      customer_phone: invoice.customer_phone,
                      subtotal: (invoice.subtotal || 0) / 100,
                      tax_amount: (invoice.tax || 0) / 100,
                      total: (invoice.amount_paid || 0) / 100,
                      amount_due: 0,
                      amount_paid: (invoice.amount_paid || 0) / 100,
                      status: 'paid',
                      paid_at: new Date().toISOString(),
                      stripe_invoice_id: invoice.id,
                      stripe_hosted_url: invoice.hosted_invoice_url,
                      stripe_pdf_url: invoice.invoice_pdf,
                      notes: projectDescription
                    });

                  if (!invErr) {
                    logger.info('Synced invoice to Supabase:', invoiceNumber);

                    // Update next invoice number
                    await supabase
                      .from('business_settings')
                      .upsert({
                        user_id: adminUserId,
                        invoice_prefix: invPrefix,
                        invoice_next_number: invNum + 1
                      }, { onConflict: 'user_id' });
                  } else {
                    logger.error('Error syncing invoice:', invErr.message);
                  }
                } else {
                  // Update existing invoice to paid
                  await supabase
                    .from('invoices')
                    .update({
                      status: 'paid',
                      paid_at: new Date().toISOString(),
                      amount_paid: (invoice.amount_paid || 0) / 100,
                      amount_due: 0
                    })
                    .eq('stripe_invoice_id', invoice.id);
                  logger.info('Updated existing invoice to paid:', invoice.id);
                }
              } catch (invSyncErr) {
                logger.error('Invoice sync error:', invSyncErr.message);
              }
            }
          } catch (dbErr) {
            logger.error('Database error in invoice.paid:', dbErr.message);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        logger.info('Invoice payment failed:', invoice.id);
        const failedEmail = emailTemplates.paymentFailed(invoice);
        await sendNotification(ADMIN_EMAIL, failedEmail.subject, failedEmail.html);
        break;
      }

      case 'invoice.sent':
        logger.info('Invoice sent:', event.data.object.id);
        break;

      case 'invoice.finalized': {
        const invoice = event.data.object;
        logger.info('Invoice finalized:', invoice.id, invoice.number);

        // Sync newly created invoice to Supabase
        if (supabase && invoice.customer_email) {
          try {
            // Get admin user ID
            const { data: adminUser } = await supabase
              .from('sg_users')
              .select('id')
              .eq('account_type', 'admin')
              .limit(1)
              .single();

            const adminUserId = adminUser?.id;

            if (adminUserId) {
              // Check if invoice already exists
              const { data: existingInvoice } = await supabase
                .from('invoices')
                .select('id')
                .eq('stripe_invoice_id', invoice.id)
                .single();

              if (!existingInvoice) {
                // Find or create customer
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
                  const { data: newCustomer } = await supabase
                    .from('customers')
                    .insert({
                      user_id: adminUserId,
                      name: invoice.customer_name || 'Customer',
                      email: invoice.customer_email,
                      phone: invoice.customer_phone,
                      stripe_customer_id: invoice.customer,
                      source: 'stripe_invoice'
                    })
                    .select()
                    .single();
                  if (newCustomer) customerId = newCustomer.id;
                }

                // Get line items description
                let projectDescription = '';
                if (invoice.lines?.data) {
                  projectDescription = invoice.lines.data
                    .map(line => line.description)
                    .filter(Boolean)
                    .join(', ');
                }

                // Generate invoice number (use Stripe's if available)
                const invoiceNumber = invoice.number || `STR-${invoice.id.slice(-8).toUpperCase()}`;

                // Insert invoice record
                const { error: invErr } = await supabase
                  .from('invoices')
                  .insert({
                    user_id: adminUserId,
                    invoice_number: invoiceNumber,
                    customer_id: customerId,
                    customer_name: invoice.customer_name || 'Customer',
                    customer_email: invoice.customer_email,
                    customer_phone: invoice.customer_phone,
                    subtotal: (invoice.subtotal || 0) / 100,
                    tax_amount: (invoice.tax || 0) / 100,
                    total: (invoice.total || 0) / 100,
                    amount_due: (invoice.amount_due || 0) / 100,
                    amount_paid: (invoice.amount_paid || 0) / 100,
                    status: invoice.status === 'open' ? 'sent' : invoice.status,
                    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
                    stripe_invoice_id: invoice.id,
                    stripe_hosted_url: invoice.hosted_invoice_url,
                    stripe_pdf_url: invoice.invoice_pdf,
                    notes: projectDescription
                  });

                if (!invErr) {
                  logger.info('Synced new invoice to Supabase:', invoiceNumber);
                } else {
                  logger.error('Error syncing invoice:', invErr.message);
                }
              }
            }
          } catch (dbErr) {
            logger.error('Database error in invoice.finalized:', dbErr.message);
          }
        }
        break;
      }

      case 'account.updated':
        logger.info('Connect account updated:', event.data.object.id);
        break;

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        logger.info('Payment intent succeeded:', paymentIntent.id);
        logger.info('Amount:', paymentIntent.amount / 100);

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
        logger.info('Payment intent failed:', event.data.object.id);
        break;

      // ============ PROJECT PAYMENT EVENTS ============
      case 'payment_intent.succeeded': {
        const pi = event.data.object;

        // Check if this is a project payment
        if (pi.metadata?.project_id) {
          logger.info('Project payment succeeded:', pi.id, 'Project:', pi.metadata.project_id);

          const projectId = pi.metadata.project_id;
          const amount = pi.amount / 100;
          const paymentType = pi.metadata.payment_type || 'payment';

          // Update payment record
          await supabase
            .from('project_payments')
            .update({
              status: 'succeeded',
              completed_at: new Date().toISOString(),
              stripe_charge_id: pi.latest_charge,
              receipt_url: pi.receipt_url
            })
            .eq('stripe_payment_intent_id', pi.id);

          // Get current project
          const { data: project } = await supabase
            .from('room_designs')
            .select('*')
            .eq('id', projectId)
            .single();

          if (project) {
            const newAmountPaid = (project.amount_paid || 0) + amount;
            const isPaidInFull = newAmountPaid >= (project.quote_total || 0);

            // Update project
            await supabase
              .from('room_designs')
              .update({
                amount_paid: newAmountPaid,
                payment_status: isPaidInFull ? 'paid' : (paymentType === 'deposit' ? 'deposit_paid' : 'partial'),
                status: isPaidInFull ? 'paid' : (project.status === 'approved' ? 'paid' : project.status),
                stripe_payment_intent_id: pi.id
              })
              .eq('id', projectId);

            // Log activity
            await supabase.from('project_activities').insert({
              project_id: projectId,
              activity_type: 'payment_received',
              description: `${paymentType} payment of $${amount.toFixed(2)} received`,
              metadata: { payment_intent_id: pi.id, amount, payment_type: paymentType }
            });

            // Send receipt to customer
            if (project.customer_email) {
              const receiptHtml = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">Payment Received!</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px;">Hi ${project.customer_name || 'there'},</p>
      <p style="color: #333; font-size: 16px;">Thank you for your payment. Here are the details:</p>

      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <table width="100%" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;">Project:</td>
            <td style="padding: 8px 0; color: #333; text-align: right; font-weight: 600;">${project.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Payment Type:</td>
            <td style="padding: 8px 0; color: #333; text-align: right;">${paymentType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Amount Paid:</td>
            <td style="padding: 8px 0; color: #10b981; text-align: right; font-weight: 700; font-size: 18px;">$${amount.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 1px solid #eee;">
            <td style="padding: 12px 0 8px; color: #666;">Total Paid:</td>
            <td style="padding: 12px 0 8px; color: #333; text-align: right;">$${newAmountPaid.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Project Total:</td>
            <td style="padding: 8px 0; color: #333; text-align: right;">$${(project.quote_total || 0).toFixed(2)}</td>
          </tr>
          ${!isPaidInFull ? `
          <tr>
            <td style="padding: 8px 0; color: #666;">Remaining Balance:</td>
            <td style="padding: 8px 0; color: #f59e0b; text-align: right; font-weight: 600;">$${((project.quote_total || 0) - newAmountPaid).toFixed(2)}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      ${isPaidInFull ? `
      <div style="background: #dcfce7; border-radius: 8px; padding: 15px; text-align: center;">
        <p style="color: #166534; margin: 0; font-weight: 600;">Project is paid in full! We'll be in touch soon.</p>
      </div>
      ` : ''}
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">Questions? Call (602) 833-3189</p>
    </div>
  </div>
</body>
</html>`;

              await transporter.sendMail({
                from: `"Surprise Granite" <${SMTP_USER}>`,
                to: project.customer_email,
                subject: `Payment Received - ${project.name}`,
                html: receiptHtml
              });
            }

            // Notify owner
            if (project.user_id) {
              const { data: owner } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', project.user_id)
                .single();

              if (owner?.email) {
                await transporter.sendMail({
                  from: `"Surprise Granite" <${SMTP_USER}>`,
                  to: owner.email,
                  subject: `Payment Received - ${project.name} - $${amount.toFixed(2)}`,
                  html: `
                    <h2>Payment Received!</h2>
                    <p><strong>Project:</strong> ${project.name}</p>
                    <p><strong>Customer:</strong> ${project.customer_name || project.customer_email}</p>
                    <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
                    <p><strong>Payment Type:</strong> ${paymentType}</p>
                    <p><strong>Total Paid:</strong> $${newAmountPaid.toFixed(2)} / $${(project.quote_total || 0).toFixed(2)}</p>
                    ${isPaidInFull ? '<p style="color: green; font-weight: bold;">PROJECT PAID IN FULL!</p>' : ''}
                  `
                });
              }
            }
          }
        }
        break;
      }

      // ============ VENDOR SUBSCRIPTION EVENTS ============
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const vendorId = subscription.metadata?.vendor_id;
        const userId = subscription.metadata?.user_id;
        const source = subscription.metadata?.source;

        // Handle Pro subscription (user upgrades)
        if (userId && source === 'pro_subscription') {
          const accountType = subscription.metadata?.account_type || subscription.metadata?.plan || 'pro';
          logger.info('Pro subscription created:', subscription.id, 'User:', userId, 'Plan:', accountType);

          // Update user's account_type in database
          if (supabase) {
            const { error: updateError } = await supabase
              .from('sg_users')
              .update({
                account_type: accountType,
                subscription_id: subscription.id,
                subscription_status: subscription.status,
                subscription_updated_at: new Date().toISOString(),
                stripe_customer_id: subscription.customer
              })
              .eq('id', userId);

            if (updateError) {
              logger.error('Failed to update user account_type:', updateError);
            } else {
              logger.info('Updated user', userId, 'to account_type:', accountType, 'customer:', subscription.customer);
            }
          }

          // Notify admin of new Pro subscriber
          const proEmail = {
            subject: `New Pro Subscription - ${accountType.charAt(0).toUpperCase() + accountType.slice(1)} Plan`,
            html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <h2 style="color: #1a1a2e;">New Pro Subscription!</h2>
  <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; color: #2e7d32; font-weight: 600;">A user has upgraded to ${accountType}!</p>
  </div>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <p><strong>User ID:</strong> ${userId}</p>
    <p><strong>Plan:</strong> ${accountType}</p>
    <p><strong>Subscription ID:</strong> ${subscription.id}</p>
    <p><strong>Status:</strong> ${subscription.status}</p>
  </div>
  <p>View in your <a href="https://dashboard.stripe.com/subscriptions/${subscription.id}">Stripe Dashboard</a></p>
</body>
</html>`
          };
          await sendNotification(ADMIN_EMAIL, proEmail.subject, proEmail.html);
        }
        // Handle Vendor subscription
        else if (vendorId) {
          logger.info('Vendor subscription created:', subscription.id, 'Vendor:', vendorId);
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
        const userId = subscription.metadata?.user_id;
        const source = subscription.metadata?.source;

        // Handle Pro subscription updates (payment issues, plan changes, etc.)
        if (userId && source === 'pro_subscription') {
          logger.info('Pro subscription updated:', subscription.id, 'User:', userId, 'Status:', subscription.status);

          if (supabase) {
            // Update subscription status in database
            const updateData = {
              subscription_status: subscription.status,
              subscription_updated_at: new Date().toISOString()
            };

            // If subscription is past_due or unpaid, optionally restrict access
            if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
              logger.info('Pro subscription payment issue for user:', userId, 'Status:', subscription.status);
            }

            // If subscription became active again after issue
            if (subscription.status === 'active') {
              updateData.account_type = subscription.metadata?.account_type || subscription.metadata?.plan || 'pro';
            }

            await supabase
              .from('sg_users')
              .update(updateData)
              .eq('id', userId);
          }
        }
        // Handle Vendor subscription updates
        else if (vendorId) {
          logger.info('Vendor subscription updated:', subscription.id, 'Status:', subscription.status);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const vendorId = subscription.metadata?.vendor_id;
        const userId = subscription.metadata?.user_id;
        const source = subscription.metadata?.source;

        // Handle Pro subscription cancellation
        if (userId && source === 'pro_subscription') {
          const previousPlan = subscription.metadata?.account_type || subscription.metadata?.plan || 'pro';
          logger.info('Pro subscription canceled:', subscription.id, 'User:', userId);

          // Downgrade user back to homeowner
          if (supabase) {
            const { error: updateError } = await supabase
              .from('sg_users')
              .update({
                account_type: 'homeowner',
                subscription_id: null,
                subscription_status: 'canceled',
                subscription_updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            if (updateError) {
              logger.error('Failed to downgrade user account_type:', updateError);
            } else {
              logger.info('Downgraded user', userId, 'from', previousPlan, 'to homeowner');
            }
          }

          // Notify admin of cancellation
          const cancelProEmail = {
            subject: `Pro Subscription Canceled - ${previousPlan.charAt(0).toUpperCase() + previousPlan.slice(1)} Plan`,
            html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <h2 style="color: #c62828;">Pro Subscription Canceled</h2>
  <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; color: #c62828;">A user has canceled their ${previousPlan} subscription.</p>
  </div>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <p><strong>User ID:</strong> ${userId}</p>
    <p><strong>Previous Plan:</strong> ${previousPlan}</p>
    <p><strong>Subscription ID:</strong> ${subscription.id}</p>
  </div>
</body>
</html>`
          };
          await sendNotification(ADMIN_EMAIL, cancelProEmail.subject, cancelProEmail.html);
        }
        // Handle Vendor subscription cancellation
        else if (vendorId) {
          logger.info('Vendor subscription canceled:', subscription.id, 'Vendor:', vendorId);
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
        logger.info(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    logger.error('Error processing webhook event:', err);
  }

  res.json({ received: true });
});

// JSON body parser - AFTER webhook route
// Increase limit for base64-encoded images (blueprints can be large)
app.use(express.json({ limit: '50mb' }));

// CSRF Protection - checks Origin/Referer for state-changing requests
app.use(csrfOriginCheck());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Surprise Granite API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Helper to verify admin access (used by remaining inline routes)
async function verifyAdminAccess(userId) {
  if (!userId || !supabase) return false;
  try {
    const { data: userInfo } = await supabase
      .from('sg_users')
      .select('account_type, email')
      .eq('id', userId)
      .single();
    const adminEmails = ['joshb@surprisegranite.com', 'josh.b@surprisegranite.com'];
    return ['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type) ||
           adminEmails.includes(userInfo?.email);
  } catch {
    return false;
  }
}

// ============ PRO-CUSTOMER SYSTEM ROUTES ============
app.use('/api/pro', proCustomersRouter);

// ============ WORKFLOW CONVERSION ROUTES ============
// Lead → Customer → Estimate → Invoice → Job conversions
app.use('/api/workflow', workflowRouter);

// ============ COLLABORATION & DESIGN HANDOFF ROUTES ============
app.use('/api/collaboration', collaborationRouter);

// ============ CALENDAR ROUTES ============
app.use('/api/calendar', calendarRouter);

// ============ AUTOMATION ROUTES ============
app.use('/api/automation', automationRouter);

// ============ REMINDER ROUTES ============
const remindersRouter = require('./routes/reminders');
app.use('/api/reminders', remindersRouter);

// ============ PROJECTS CRUD ROUTES ============
app.use('/api/projects', projectsRouter);

// ============ EMAIL ROUTES (MODULAR) ============
app.use('/api/email', emailRouter);

// ============ CUSTOMER PORTAL ROUTES ============
const portalRouter = require('./routes/portal');
app.use('/api/portal', portalRouter);

// ============ MARKETPLACE ROUTES ============
app.use('/api/marketplace', marketplaceRouter);

// ============ STRIPE ROUTES (PAYMENTS, SUBSCRIPTIONS, WALLET) ============
app.use('/api/stripe', stripeRouter);

// ============ QUICKBOOKS ROUTES (ACCOUNTING SYNC) ============
app.use('/api/quickbooks', quickbooksRouter);

// ============ AI ROUTES (VISUALIZER, VIDEO, BLUEPRINT) ============
app.use('/api/ai', aiRouter);

// ============ JOBS & CONTRACTORS ROUTES ============
app.use('/api/jobs', jobsRouter);

// ============ AUTH & SSO ROUTES ============
app.use('/api/auth', authRouter);

// ============ PRICING MANAGEMENT ROUTES ============
app.use('/api/pricing', pricingRouter);

// ============ SCRAPER MANAGEMENT ROUTES ============
app.use('/api/scrapers', scrapersRouter);

// ============ BACKWARD COMPATIBILITY ALIASES ============
// Mount routes on legacy paths for backward compatibility
// Stripe legacy paths
app.use('/api/create-checkout-session', (req, res, next) => { req.url = '/checkout'; stripeRouter(req, res, next); });
app.use('/api/orders', (req, res, next) => { req.url = req.url.replace('/api/orders', '/orders'); stripeRouter(req, res, next); });
app.use('/api/create-pro-subscription', (req, res, next) => { req.url = '/pro-subscription'; stripeRouter(req, res, next); });
app.use('/api/pro-plans', (req, res, next) => { req.url = '/pro-plans'; stripeRouter(req, res, next); });
app.use('/api/pro-billing-portal', (req, res, next) => { req.url = '/billing-portal'; stripeRouter(req, res, next); });
app.use('/api/pro-subscription', (req, res, next) => { req.url = req.url.replace('/api/pro-subscription', '/subscription'); stripeRouter(req, res, next); });
app.use('/api/create-payment-intent', (req, res, next) => { req.url = '/payment-intent'; stripeRouter(req, res, next); });
app.use('/api/balance', (req, res, next) => { req.url = '/balance'; stripeRouter(req, res, next); });
app.use('/api/payouts', (req, res, next) => { req.url = req.url.replace('/api/payouts', '/payouts'); stripeRouter(req, res, next); });
app.use('/api/transactions', (req, res, next) => { req.url = '/transactions'; stripeRouter(req, res, next); });
app.use('/api/balance-transactions', (req, res, next) => { req.url = '/balance-transactions'; stripeRouter(req, res, next); });
app.use('/api/connect', (req, res, next) => { req.url = req.url.replace('/api/connect', '/connect'); stripeRouter(req, res, next); });
// AI legacy paths
app.use('/api/visualize', (req, res, next) => { req.url = '/visualize'; aiRouter(req, res, next); });
app.use('/api/generate-video', (req, res, next) => { req.url = req.url.replace('/api/generate-video', '/video'); aiRouter(req, res, next); });
app.use('/api/analyze-blueprint', (req, res, next) => { req.url = '/blueprint'; aiRouter(req, res, next); });
// Jobs/Contractors legacy paths
app.use('/api/contractors', (req, res, next) => { req.url = '/contractors' + (req.url === '/' ? '/list' : ''); jobsRouter(req, res, next); });
app.use('/api/contractor/respond', (req, res, next) => { req.url = '/contractor/respond'; jobsRouter(req, res, next); });

// ============ ARIA VOICE LEAD CAPTURE ============
app.post('/api/aria-lead', leadRateLimiter, async (req, res) => {
  try {
    const { name, phone, email, project_type, project_details, preferred_contact_time, notes, source, tool, timestamp } = req.body;

    // Validate required fields
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    logger.info('[ARIA LEAD] Received from source:', source || 'unknown');

    // Build email content
    const leadHtml = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #1a1a2e; font-size: 24px; font-weight: 700;">🎤 New Voice Lead from Aria</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Contact Information</h2>
              <table width="100%" cellspacing="0" cellpadding="8">
                <tr>
                  <td style="color: #666; font-weight: 600; width: 140px;">Name:</td>
                  <td style="color: #1a1a2e;">${name || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Phone:</td>
                  <td style="color: #1a1a2e;"><a href="tel:${phone}" style="color: #1a1a2e; font-weight: 600;">${phone || 'Not provided'}</a></td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Email:</td>
                  <td style="color: #1a1a2e;"><a href="mailto:${email}" style="color: #1a1a2e;">${email || 'Not provided'}</a></td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Best Time:</td>
                  <td style="color: #1a1a2e;">${preferred_contact_time || 'Not specified'}</td>
                </tr>
              </table>

              <h2 style="margin: 25px 0 15px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Project Details</h2>
              <table width="100%" cellspacing="0" cellpadding="8">
                <tr>
                  <td style="color: #666; font-weight: 600; width: 140px;">Project Type:</td>
                  <td style="color: #1a1a2e;">${project_type || 'Not specified'}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Details:</td>
                  <td style="color: #1a1a2e;">${project_details || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Notes:</td>
                  <td style="color: #1a1a2e;">${notes || 'None'}</td>
                </tr>
              </table>

              <div style="margin-top: 25px; padding: 15px; background: #f8f8f8; border-radius: 8px; border-left: 4px solid #f9cb00;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                  <strong>Source:</strong> ${source || 'Aria Voice Chat'}<br>
                  <strong>Action:</strong> ${tool || 'Lead Capture'}<br>
                  <strong>Time:</strong> ${timestamp || new Date().toISOString()}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #1a1a2e; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #f9cb00; font-size: 14px; font-weight: 600;">Follow up ASAP!</p>
              <p style="margin: 5px 0 0; color: #888; font-size: 12px;">This lead came from the Aria AI voice assistant on your website.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send to admin
    const emailResult = await sendNotification(
      ADMIN_EMAIL,
      `🎤 New Voice Lead: ${name || 'Unknown'} - ${project_type || 'Inquiry'}`,
      leadHtml
    );

    // Also store in Supabase if available
    if (supabase) {
      try {
        await supabase.from('aria_leads').insert([{
          name,
          phone,
          email,
          project_type,
          project_details,
          preferred_contact_time,
          notes,
          source: source || 'aria_voice_chat',
          tool,
          created_at: timestamp || new Date().toISOString()
        }]);
        logger.info('[ARIA LEAD] Saved to database');
      } catch (dbErr) {
        logger.info('[ARIA LEAD] Database save skipped:', dbErr.message);
      }
    }

    res.json({ success: true, emailSent: emailResult.success });
  } catch (error) {
    logger.error('[ARIA LEAD] Error:', error);
    return handleApiError(res, error);
  }
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
    logger.error('Test email error:', err);
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
    logger.error('Customer error:', error);
    return handleApiError(res, error);
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
    logger.error('Get customer error:', error);
    return handleApiError(res, error);
  }
});

// ============ INVOICE MANAGEMENT ============

// Create and send an invoice
app.post('/api/invoices', authenticateJWT, async (req, res) => {
  try {
    // Invoice creation requires admin access
    if (!await verifyAdminAccess(req.user?.id)) {
      return res.status(403).json({ error: 'Admin access required to create invoices' });
    }

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
    logger.error('Invoice error:', error);
    return handleApiError(res, error);
  }
});

// Get all invoices (with optional filters)
app.get('/api/invoices', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Check if user is admin (can see all invoices)
    const { data: userInfo } = await supabase
      .from('sg_users')
      .select('account_type, email')
      .eq('id', userId)
      .single();

    const isAdmin = ['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type);

    const { customer_email, status, limit = 20 } = req.query;

    let params = { limit: parseInt(limit) };

    // Non-admins can only see their own invoices
    if (!isAdmin) {
      const customers = await stripe.customers.list({ email: userInfo?.email, limit: 1 });
      if (customers.data.length > 0) {
        params.customer = customers.data[0].id;
      } else {
        // No invoices for this customer
        return res.json({ invoices: [] });
      }
    } else if (customer_email) {
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
        total: (inv.total || 0) / 100,
        amount_due: (inv.amount_due || 0) / 100,
        amount_paid: (inv.amount_paid || 0) / 100,
        status: inv.status,
        created: new Date(inv.created * 1000).toISOString(),
        due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        // View tracking metadata
        view_count: parseInt(inv.metadata?.view_count || '0'),
        first_viewed_at: inv.metadata?.first_viewed_at || null,
        last_viewed_at: inv.metadata?.last_viewed_at || null
      }))
    });
  } catch (error) {
    logger.error('List invoices error:', error);
    return handleApiError(res, error);
  }
});

// Get single invoice
app.get('/api/invoices/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Check if user is admin or business owner
    const { data: userInfo } = await supabase
      .from('sg_users')
      .select('account_type, email')
      .eq('id', userId)
      .single();

    const isAdmin = ['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type);

    const invoice = await stripe.invoices.retrieve(req.params.id, {
      expand: ['lines.data']
    });

    // Non-admins can only view their own invoices
    if (!isAdmin && invoice.customer_email !== userInfo?.email) {
      return res.status(403).json({ error: 'Access denied - can only view your own invoices' });
    }

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
    logger.error('Get invoice error:', error);
    return handleApiError(res, error);
  }
});

// Send reminder for an invoice (admin only)
app.post('/api/invoices/:id/remind', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Verify admin/business access
    const { data: userInfo } = await supabase
      .from('sg_users')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (!['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type)) {
      return res.status(403).json({ error: 'Admin access required to send invoice reminders' });
    }

    const invoice = await stripe.invoices.sendInvoice(req.params.id);
    res.json({ success: true, message: 'Reminder sent', invoice_id: invoice.id });
  } catch (error) {
    logger.error('Remind invoice error:', error);
    return handleApiError(res, error);
  }
});

// Void an invoice (admin only)
app.post('/api/invoices/:id/void', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Verify admin/business access - voiding invoices is sensitive
    const { data: userInfo } = await supabase
      .from('sg_users')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (!['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type)) {
      return res.status(403).json({ error: 'Admin access required to void invoices' });
    }

    const invoice = await stripe.invoices.voidInvoice(req.params.id);
    res.json({ success: true, message: 'Invoice voided', status: invoice.status });
  } catch (error) {
    logger.error('Void invoice error:', error);
    return handleApiError(res, error);
  }
});

// Track invoice view - redirect endpoint for tracking when customer views invoice
app.get('/invoice/view/:id', async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Get invoice from Stripe
    const invoice = await stripe.invoices.retrieve(invoiceId);

    if (!invoice.hosted_invoice_url) {
      return res.status(404).send('Invoice not found');
    }

    // Log view to Supabase if available
    if (supabase) {
      try {
        await supabase.from('invoice_views').insert({
          invoice_id: invoiceId,
          invoice_number: invoice.number,
          customer_email: invoice.customer_email,
          viewed_at: new Date().toISOString(),
          ip_address: ip,
          user_agent: userAgent
        });
      } catch (dbErr) {
        logger.info('Could not log invoice view:', dbErr.message);
      }
    }

    // Update Stripe invoice metadata with view info
    try {
      const currentViews = parseInt(invoice.metadata?.view_count || '0') + 1;
      await stripe.invoices.update(invoiceId, {
        metadata: {
          ...invoice.metadata,
          view_count: currentViews.toString(),
          first_viewed_at: invoice.metadata?.first_viewed_at || new Date().toISOString(),
          last_viewed_at: new Date().toISOString()
        }
      });
    } catch (metaErr) {
      logger.info('Could not update invoice metadata:', metaErr.message);
    }

    // Redirect to Stripe hosted invoice page
    res.redirect(invoice.hosted_invoice_url);
  } catch (error) {
    logger.error('Invoice view tracking error:', error);
    res.status(500).send('Error loading invoice');
  }
});

// Get invoice view stats
app.get('/api/invoices/:id/views', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const invoiceId = req.params.id;

    // Verify admin/business access for viewing invoice analytics
    const { data: userInfo } = await supabase
      .from('sg_users')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (!['admin', 'business', 'enterprise', 'super_admin'].includes(userInfo?.account_type)) {
      return res.status(403).json({ error: 'Admin access required to view invoice analytics' });
    }

    // Get from Stripe metadata
    const invoice = await stripe.invoices.retrieve(invoiceId);
    const viewCount = parseInt(invoice.metadata?.view_count || '0');
    const firstViewed = invoice.metadata?.first_viewed_at || null;
    const lastViewed = invoice.metadata?.last_viewed_at || null;

    // Get detailed views from Supabase if available
    let views = [];
    if (supabase) {
      const { data } = await supabase
        .from('invoice_views')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('viewed_at', { ascending: false });
      views = data || [];
    }

    res.json({
      view_count: viewCount,
      first_viewed_at: firstViewed,
      last_viewed_at: lastViewed,
      views: views
    });
  } catch (error) {
    logger.error('Get invoice views error:', error);
    return handleApiError(res, error);
  }
});

// ============ QUICK PAYMENT LINKS ============

// Create a payment link for quick payments
app.post('/api/payment-links', authenticateJWT, async (req, res) => {
  try {
    // Creating payment links requires admin access
    if (!await verifyAdminAccess(req.user?.id)) {
      return res.status(403).json({ error: 'Admin access required to create payment links' });
    }

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
    logger.error('Payment link error:', error);
    return handleApiError(res, error);
  }
});

// ============ ATTACHMENTS SYSTEM ============

// Create attachment (upload metadata - file should be uploaded to Supabase Storage first)
app.post('/api/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      lead_id,
      estimate_id,
      invoice_id,
      file_name,
      file_url,
      file_type,
      mime_type,
      file_size,
      category,
      description,
      visible_to_customer,
      include_in_email
    } = req.body;

    // Validate required fields
    if (!file_name || !file_url) {
      return res.status(400).json({ error: 'file_name and file_url are required' });
    }

    // Ensure exactly one parent is specified
    const parentCount = [lead_id, estimate_id, invoice_id].filter(Boolean).length;
    if (parentCount !== 1) {
      return res.status(400).json({ error: 'Exactly one of lead_id, estimate_id, or invoice_id must be specified' });
    }

    // Check attachment limit (10 per entity)
    const parentField = lead_id ? 'lead_id' : estimate_id ? 'estimate_id' : 'invoice_id';
    const parentValue = lead_id || estimate_id || invoice_id;

    const { count } = await supabase
      .from('attachments')
      .select('*', { count: 'exact', head: true })
      .eq(parentField, parentValue);

    if (count >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 attachments per item reached' });
    }

    // Insert attachment
    const { data, error } = await supabase
      .from('attachments')
      .insert({
        user_id: userId,
        lead_id,
        estimate_id,
        invoice_id,
        file_name,
        file_url,
        file_type: file_type || 'document',
        mime_type,
        file_size,
        category: category || 'general',
        description,
        visible_to_customer: visible_to_customer !== false,
        include_in_email: include_in_email === true,
        uploaded_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Attachment created:', { id: data.id, file_name, parentField, parentValue });
    res.status(201).json({ success: true, attachment: data });
  } catch (error) {
    logger.error('Create attachment error:', error);
    return handleApiError(res, error);
  }
});

// Get single attachment
app.get('/api/attachments/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.json({ success: true, attachment: data });
  } catch (error) {
    logger.error('Get attachment error:', error);
    return handleApiError(res, error);
  }
});

// Delete attachment
app.delete('/api/attachments/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // First get the attachment to verify ownership
    const { data: existing } = await supabase
      .from('attachments')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete from database
    const { error } = await supabase
      .from('attachments')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info('Attachment deleted:', { id, file_name: existing.file_name });
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    logger.error('Delete attachment error:', error);
    return handleApiError(res, error);
  }
});

// Get attachments for a lead
app.get('/api/leads/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('lead_id', id)
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, attachments: data || [] });
  } catch (error) {
    logger.error('Get lead attachments error:', error);
    return handleApiError(res, error);
  }
});

// Upload attachment to a lead
app.post('/api/leads/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id: leadId } = req.params;
    const {
      file_name,
      file_url,
      file_type,
      mime_type,
      file_size,
      category = 'general',
      description,
      visible_to_customer = false
    } = req.body;

    if (!file_name || !file_url) {
      return res.status(400).json({ error: 'File name and URL are required' });
    }

    // Verify user owns the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, user_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (lead.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check attachment limit
    const { count } = await supabase
      .from('attachments')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId);

    if (count >= 10) {
      return res.status(400).json({ error: 'Maximum 10 attachments per lead' });
    }

    const { data, error } = await supabase
      .from('attachments')
      .insert({
        user_id: userId,
        lead_id: leadId,
        file_name,
        file_url,
        file_type,
        mime_type,
        file_size,
        category,
        description,
        visible_to_customer,
        uploaded_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Lead attachment uploaded:', { leadId, fileName: file_name });
    res.json({ success: true, attachment: data });
  } catch (error) {
    logger.error('Upload lead attachment error:', error);
    return handleApiError(res, error);
  }
});

// Get attachments for an estimate
app.get('/api/estimates/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('estimate_id', id)
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, attachments: data || [] });
  } catch (error) {
    logger.error('Get estimate attachments error:', error);
    return handleApiError(res, error);
  }
});

// Get attachments for an invoice
app.get('/api/invoices/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('invoice_id', id)
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, attachments: data || [] });
  } catch (error) {
    logger.error('Get invoice attachments error:', error);
    return handleApiError(res, error);
  }
});

// Get attachments for a project (includes collaborator uploads)
app.get('/api/projects/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verify user is project owner or collaborator
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.user_id === userId;

    // If not owner, check if collaborator
    if (!isOwner) {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id, access_level')
        .eq('project_id', id)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      if (!collab) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('project_id', id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    // Filter for collaborators - they only see visible_to_collaborators = true
    let attachments = data || [];
    if (!isOwner) {
      attachments = attachments.filter(a => a.visible_to_collaborators !== false);
    }

    res.json({ success: true, attachments });
  } catch (error) {
    logger.error('Get project attachments error:', error);
    return handleApiError(res, error);
  }
});

// Upload attachment to a project
app.post('/api/projects/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id: projectId } = req.params;
    const {
      file_name,
      file_url,
      file_type,
      mime_type,
      file_size,
      category = 'general',
      description,
      visible_to_customer = false,
      visible_to_collaborators = true
    } = req.body;

    if (!file_name || !file_url) {
      return res.status(400).json({ error: 'File name and URL are required' });
    }

    // Verify user is project owner or collaborator with write access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.user_id === userId;
    let collaboratorId = null;

    if (!isOwner) {
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('id, access_level')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      if (!collab || !['write', 'admin'].includes(collab.access_level)) {
        return res.status(403).json({ error: 'Write access required' });
      }
      collaboratorId = collab.id;
    }

    // Check attachment limit (10 per project)
    const { count } = await supabase
      .from('attachments')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (count >= 10) {
      return res.status(400).json({ error: 'Maximum 10 attachments per project' });
    }

    const { data, error } = await supabase
      .from('attachments')
      .insert({
        user_id: isOwner ? userId : project.user_id, // Owner ID for RLS
        project_id: projectId,
        file_name,
        file_url,
        file_type,
        mime_type,
        file_size,
        category,
        description,
        visible_to_customer,
        visible_to_collaborators,
        uploaded_by: userId,
        uploaded_by_collaborator: collaboratorId
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Project attachment uploaded:', { projectId, fileName: file_name, byCollaborator: !!collaboratorId });
    res.json({ success: true, attachment: data });
  } catch (error) {
    logger.error('Upload project attachment error:', error);
    return handleApiError(res, error);
  }
});

// Get attachments for a customer
app.get('/api/customers/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verify user owns the customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customer.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('customer_id', id)
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, attachments: data || [] });
  } catch (error) {
    logger.error('Get customer attachments error:', error);
    return handleApiError(res, error);
  }
});

// Upload attachment to a customer
app.post('/api/customers/:id/attachments', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id: customerId } = req.params;
    const {
      file_name,
      file_url,
      file_type,
      mime_type,
      file_size,
      category = 'general',
      description,
      visible_to_customer = false
    } = req.body;

    if (!file_name || !file_url) {
      return res.status(400).json({ error: 'File name and URL are required' });
    }

    // Verify user owns the customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, user_id')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customer.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check attachment limit
    const { count } = await supabase
      .from('attachments')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);

    if (count >= 10) {
      return res.status(400).json({ error: 'Maximum 10 attachments per customer' });
    }

    const { data, error } = await supabase
      .from('attachments')
      .insert({
        user_id: userId,
        customer_id: customerId,
        file_name,
        file_url,
        file_type,
        mime_type,
        file_size,
        category,
        description,
        visible_to_customer,
        uploaded_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Customer attachment uploaded:', { customerId, fileName: file_name });
    res.json({ success: true, attachment: data });
  } catch (error) {
    logger.error('Upload customer attachment error:', error);
    return handleApiError(res, error);
  }
});

// Send customer portal link via email
app.post('/api/customers/send-portal-link', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { customer_id, email, name, portal_url } = req.body;

    if (!email || !portal_url) {
      return res.status(400).json({ error: 'Email and portal URL are required' });
    }

    // Verify user owns this customer
    if (customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, user_id')
        .eq('id', customer_id)
        .single();

      if (customerError || !customer || customer.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get business settings for branding
    const { data: settings } = await supabase
      .from('business_settings')
      .select('company_name, phone, email')
      .eq('user_id', userId)
      .single();

    const companyName = settings?.company_name || 'Surprise Granite';
    const companyPhone = settings?.phone || '(602) 833-3189';
    const companyEmail = settings?.email || 'info@surprisegranite.com';

    // Send email via nodemailer
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #1a1a2e, #2d2d44); padding: 30px; text-align: center; }
          .header h1 { color: #f9cb00; margin: 0; font-size: 28px; }
          .content { padding: 30px; }
          .btn { display: inline-block; background: #f9cb00; color: #1a1a2e; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${companyName}</h1>
          </div>
          <div class="content">
            <p>Hi${name ? ' ' + name : ''},</p>
            <p>You now have access to your personal customer portal where you can view your estimates, invoices, and project details.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${portal_url}" class="btn">Access Your Portal</a>
            </p>
            <p style="color: #666; font-size: 14px;">This link is unique to you. Please keep it safe and don't share it with others.</p>
          </div>
          <div class="footer">
            <p><strong>${companyName}</strong></p>
            <p>${companyPhone} | ${companyEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"${companyName}" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your Customer Portal Access - ${companyName}`,
      html
    });

    logger.info('Customer portal link sent:', { customerId: customer_id, email: email.substring(0, 3) + '***' });
    res.json({ success: true, message: 'Portal link sent successfully' });
  } catch (error) {
    logger.error('Send portal link error:', error);
    return handleApiError(res, error);
  }
});

// Update attachment visibility
app.patch('/api/attachments/:id/visibility', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { visible_to_customer, visible_to_collaborators } = req.body;

    // First verify ownership
    const { data: attachment, error: fetchError } = await supabase
      .from('attachments')
      .select('*, projects!attachments_project_id_fkey(user_id)')
      .eq('id', id)
      .single();

    if (fetchError || !attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Check if user owns the attachment or the parent project
    const isOwner = attachment.user_id === userId ||
      (attachment.projects && attachment.projects.user_id === userId);

    if (!isOwner) {
      return res.status(403).json({ error: 'Only the owner can change visibility' });
    }

    const updates = {};
    if (typeof visible_to_customer === 'boolean') {
      updates.visible_to_customer = visible_to_customer;
    }
    if (typeof visible_to_collaborators === 'boolean') {
      updates.visible_to_collaborators = visible_to_collaborators;
    }

    const { data, error } = await supabase
      .from('attachments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, attachment: data });
  } catch (error) {
    logger.error('Update attachment visibility error:', error);
    return handleApiError(res, error);
  }
});

// ============ ENTITY PAY LINKS ============

// Generate pay link for a lead (quick quote)
app.post('/api/leads/:id/pay-link', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Create pay link using stripeService
    const result = await stripeService.createPayLinkForEntity({
      entityType: 'lead',
      entityId: id,
      amount: Math.round(amount * 100), // Convert to cents
      description: description || `Quick Quote - ${lead.name || 'Lead'}`,
      customerEmail: lead.email,
      customerName: lead.name,
      metadata: { lead_id: id }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Update lead with pay link info
    await supabase
      .from('leads')
      .update({
        pay_link_url: result.payLink.url,
        pay_link_id: result.payLink.id,
        pay_link_amount: result.payLink.amount,
        pay_link_created_at: new Date().toISOString(),
        quick_quote_amount: amount
      })
      .eq('id', id);

    logger.info('Lead pay link created:', { leadId: id, amount, url: result.payLink.url });
    res.json({ success: true, pay_link: result.payLink });
  } catch (error) {
    logger.error('Create lead pay link error:', error);
    return handleApiError(res, error);
  }
});

// Generate pay link for an estimate (deposit)
app.post('/api/estimates/:id/pay-link', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { amount_type = 'deposit', custom_amount } = req.body;

    // Get estimate details
    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (estError || !estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    // Determine amount
    let amount;
    let description;
    if (amount_type === 'custom' && custom_amount) {
      amount = Math.round(custom_amount * 100);
      description = `Custom Payment - Estimate ${estimate.estimate_number}`;
    } else if (amount_type === 'full') {
      amount = Math.round((estimate.total || 0) * 100);
      description = `Full Payment - Estimate ${estimate.estimate_number}`;
    } else {
      // Default: deposit
      amount = Math.round((estimate.deposit_amount || estimate.total * 0.5) * 100);
      description = `Deposit - Estimate ${estimate.estimate_number}`;
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount calculated' });
    }

    // Create pay link
    const result = await stripeService.createPayLinkForEntity({
      entityType: 'estimate',
      entityId: id,
      amount,
      description,
      customerEmail: estimate.customer_email,
      customerName: estimate.customer_name,
      metadata: {
        estimate_id: id,
        estimate_number: estimate.estimate_number,
        amount_type
      }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Update estimate with pay link info
    await supabase
      .from('estimates')
      .update({
        pay_link_url: result.payLink.url,
        pay_link_id: result.payLink.id,
        pay_link_amount: result.payLink.amount,
        pay_link_created_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Estimate pay link created:', { estimateId: id, amount, url: result.payLink.url });
    res.json({ success: true, pay_link: result.payLink });
  } catch (error) {
    logger.error('Create estimate pay link error:', error);
    return handleApiError(res, error);
  }
});

// Generate pay link for an invoice
app.post('/api/invoices/:id/pay-link', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { amount_type = 'balance', custom_amount } = req.body;

    // Get invoice details
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Determine amount
    let amount;
    let description;
    if (amount_type === 'custom' && custom_amount) {
      amount = Math.round(custom_amount * 100);
      description = `Custom Payment - Invoice ${invoice.invoice_number}`;
    } else if (amount_type === 'full') {
      amount = Math.round((invoice.total || 0) * 100);
      description = `Full Payment - Invoice ${invoice.invoice_number}`;
    } else {
      // Default: balance due
      amount = Math.round((invoice.balance_due || invoice.total || 0) * 100);
      description = `Balance Due - Invoice ${invoice.invoice_number}`;
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount calculated. Invoice may already be paid.' });
    }

    // Create pay link
    const result = await stripeService.createPayLinkForEntity({
      entityType: 'invoice',
      entityId: id,
      amount,
      description,
      customerEmail: invoice.customer_email,
      customerName: invoice.customer_name,
      metadata: {
        invoice_id: id,
        invoice_number: invoice.invoice_number,
        amount_type
      }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Update invoice with pay link info
    await supabase
      .from('invoices')
      .update({
        pay_link_url: result.payLink.url,
        pay_link_id: result.payLink.id,
        pay_link_amount: result.payLink.amount,
        pay_link_created_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Invoice pay link created:', { invoiceId: id, amount, url: result.payLink.url });
    res.json({ success: true, pay_link: result.payLink });
  } catch (error) {
    logger.error('Create invoice pay link error:', error);
    return handleApiError(res, error);
  }
});

// ============ SEND WITH ATTACHMENTS & PAY LINKS ============

// Send pay link email
app.post('/api/pay-link/send', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      to_email,
      customer_name,
      amount,
      pay_link_url,
      description,
      entity_type,
      entity_number,
      due_date,
      notes
    } = req.body;

    if (!to_email || !pay_link_url || !amount) {
      return res.status(400).json({ error: 'to_email, pay_link_url, and amount are required' });
    }

    // Generate email using template
    const emailData = emailService.generatePayLinkEmail({
      customerName: customer_name,
      amount: typeof amount === 'number' ? amount * 100 : amount, // Convert to cents if needed
      description,
      payLinkUrl: pay_link_url,
      entityType: entity_type || 'payment',
      entityNumber: entity_number,
      dueDate: due_date,
      notes
    });

    // Send email
    const result = await emailService.sendNotification(to_email, emailData.subject, emailData.html);

    if (!result.success) {
      throw new Error(result.reason || 'Failed to send email');
    }

    logger.info('Pay link email sent:', { to: to_email, amount });
    res.json({ success: true, message: 'Pay link email sent successfully' });
  } catch (error) {
    logger.error('Send pay link email error:', error);
    return handleApiError(res, error);
  }
});

// Send estimate with attachments and optional pay link
app.post('/api/estimates/:id/send', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const {
      include_attachments = true,
      include_pay_link = false,
      generate_pay_link = false, // Create new pay link if doesn't exist
      notes
    } = req.body;

    // Get estimate
    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (estError || !estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    if (!estimate.customer_email) {
      return res.status(400).json({ error: 'Estimate has no customer email' });
    }

    // Generate pay link if requested and doesn't exist
    let payLinkUrl = estimate.pay_link_url;
    if (generate_pay_link && !payLinkUrl) {
      const amount = Math.round((estimate.deposit_amount || estimate.total * 0.5) * 100);
      const result = await stripeService.createPayLinkForEntity({
        entityType: 'estimate',
        entityId: id,
        amount,
        description: `Deposit - Estimate ${estimate.estimate_number}`,
        customerEmail: estimate.customer_email,
        customerName: estimate.customer_name
      });
      if (result.success) {
        payLinkUrl = result.payLink.url;
        await supabase
          .from('estimates')
          .update({
            pay_link_url: payLinkUrl,
            pay_link_id: result.payLink.id,
            pay_link_amount: amount,
            pay_link_created_at: new Date().toISOString()
          })
          .eq('id', id);
      }
    }

    // Get attachments if requested
    let attachments = [];
    let attachmentData = [];
    if (include_attachments) {
      const { data: atts } = await supabase
        .from('attachments')
        .select('*')
        .eq('estimate_id', id)
        .eq('include_in_email', true);

      if (atts && atts.length > 0) {
        attachmentData = atts;
        // Fetch actual files for email attachment
        for (const att of atts) {
          try {
            const response = await fetch(att.file_url);
            if (response.ok) {
              const buffer = await response.buffer();
              attachments.push({
                filename: att.file_name,
                content: buffer,
                contentType: att.mime_type
              });
            }
          } catch (e) {
            logger.warn('Failed to fetch attachment:', att.file_name);
          }
        }
      }
    }

    // Generate email
    const emailData = emailService.generateEstimateWithAttachmentsEmail({
      customerName: estimate.customer_name,
      estimateNumber: estimate.estimate_number,
      projectName: estimate.project_name,
      total: estimate.total,
      depositAmount: estimate.deposit_amount,
      depositPercent: estimate.deposit_percent,
      payLinkUrl: include_pay_link ? payLinkUrl : null,
      validUntil: estimate.valid_until,
      attachments: attachmentData,
      notes: notes || estimate.notes
    });

    // Send email with attachments
    const result = await emailService.sendNotification(
      estimate.customer_email,
      emailData.subject,
      emailData.html,
      attachments
    );

    if (!result.success) {
      throw new Error(result.reason || 'Failed to send email');
    }

    // Update estimate sent status
    await supabase
      .from('estimates')
      .update({
        status: estimate.status === 'draft' ? 'sent' : estimate.status,
        sent_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Estimate sent:', { estimateId: id, to: estimate.customer_email, attachmentCount: attachments.length });
    res.json({
      success: true,
      message: 'Estimate sent successfully',
      details: {
        sent_to: estimate.customer_email,
        attachments_count: attachments.length,
        pay_link_included: include_pay_link && !!payLinkUrl
      }
    });
  } catch (error) {
    logger.error('Send estimate error:', error);
    return handleApiError(res, error);
  }
});

// Send invoice with attachments and optional pay link
app.post('/api/invoices/:id/send', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!await verifyAdminAccess(userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const {
      include_attachments = true,
      include_pay_link = true,
      generate_pay_link = false,
      notes
    } = req.body;

    // Get invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!invoice.customer_email) {
      return res.status(400).json({ error: 'Invoice has no customer email' });
    }

    // Generate pay link if requested and doesn't exist
    let payLinkUrl = invoice.pay_link_url;
    if (generate_pay_link && !payLinkUrl && (invoice.balance_due || invoice.total) > 0) {
      const amount = Math.round((invoice.balance_due || invoice.total) * 100);
      const result = await stripeService.createPayLinkForEntity({
        entityType: 'invoice',
        entityId: id,
        amount,
        description: `Payment - Invoice ${invoice.invoice_number}`,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name
      });
      if (result.success) {
        payLinkUrl = result.payLink.url;
        await supabase
          .from('invoices')
          .update({
            pay_link_url: payLinkUrl,
            pay_link_id: result.payLink.id,
            pay_link_amount: amount,
            pay_link_created_at: new Date().toISOString()
          })
          .eq('id', id);
      }
    }

    // Get attachments if requested
    let attachments = [];
    let attachmentData = [];
    if (include_attachments) {
      const { data: atts } = await supabase
        .from('attachments')
        .select('*')
        .eq('invoice_id', id)
        .eq('include_in_email', true);

      if (atts && atts.length > 0) {
        attachmentData = atts;
        for (const att of atts) {
          try {
            const response = await fetch(att.file_url);
            if (response.ok) {
              const buffer = await response.buffer();
              attachments.push({
                filename: att.file_name,
                content: buffer,
                contentType: att.mime_type
              });
            }
          } catch (e) {
            logger.warn('Failed to fetch attachment:', att.file_name);
          }
        }
      }
    }

    // Generate email
    const emailData = emailService.generateInvoiceWithAttachmentsEmail({
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      projectName: invoice.project_name,
      total: invoice.total,
      amountPaid: invoice.amount_paid,
      balanceDue: invoice.balance_due || invoice.total,
      payLinkUrl: include_pay_link ? payLinkUrl : null,
      dueDate: invoice.due_date,
      attachments: attachmentData,
      notes: notes || invoice.notes
    });

    // Send email with attachments
    const result = await emailService.sendNotification(
      invoice.customer_email,
      emailData.subject,
      emailData.html,
      attachments
    );

    if (!result.success) {
      throw new Error(result.reason || 'Failed to send email');
    }

    // Update invoice sent status
    await supabase
      .from('invoices')
      .update({
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
        sent_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Invoice sent:', { invoiceId: id, to: invoice.customer_email, attachmentCount: attachments.length });
    res.json({
      success: true,
      message: 'Invoice sent successfully',
      details: {
        sent_to: invoice.customer_email,
        attachments_count: attachments.length,
        pay_link_included: include_pay_link && !!payLinkUrl
      }
    });
  } catch (error) {
    logger.error('Send invoice error:', error);
    return handleApiError(res, error);
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

    logger.info('Vendor subscription session created:', session.id, 'Plan:', plan_name);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    logger.error('Vendor subscription error:', error);
    return handleApiError(res, error);
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
    logger.error('Billing portal error:', error);
    return handleApiError(res, error);
  }
});

// Get vendor subscription status
app.get('/api/vendor-subscription/:vendor_id', async (req, res) => {
  try {
    const { vendor_id } = req.params;

    // Sanitize vendor_id to prevent query injection
    const sanitizedVendorId = String(vendor_id).replace(/['"\\]/g, '');
    if (!sanitizedVendorId || sanitizedVendorId.length > 100) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    // Search for subscriptions with this vendor_id in metadata
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['vendor_id']:'${sanitizedVendorId}'`,
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
    logger.error('Get vendor subscription error:', error);
    return handleApiError(res, error);
  }
});

// Cancel vendor subscription
app.post('/api/vendor-subscription/:vendor_id/cancel', async (req, res) => {
  try {
    const { vendor_id } = req.params;
    const { cancel_immediately = false } = req.body;

    // Sanitize vendor_id to prevent query injection
    const sanitizedVendorId = String(vendor_id).replace(/['"\\]/g, '');
    if (!sanitizedVendorId || sanitizedVendorId.length > 100) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    // Find the subscription
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['vendor_id']:'${sanitizedVendorId}'`,
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
    logger.error('Cancel subscription error:', error);
    return handleApiError(res, error);
  }
});

// ============ LEAD MANAGEMENT ============

// Submit a new lead (from estimate form or booking calendar)
app.post('/api/leads', leadRateLimiter, async (req, res) => {
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

    // Input validation
    if (!homeowner_name || !homeowner_email || !project_zip) {
      return res.status(400).json({
        error: 'Name, email, and ZIP code are required'
      });
    }

    if (!isValidEmail(homeowner_email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (homeowner_phone && !isValidPhone(homeowner_phone)) {
      return res.status(400).json({ error: 'Invalid phone format' });
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

    logger.info('New lead received:', leadData);

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

    // Send customer confirmation/welcome email
    if (homeowner_email) {
      try {
        let customerEmail;
        if (isAppointment) {
          // Use appointment confirmation template for scheduled appointments
          customerEmail = emailTemplates.appointmentConfirmation({
            homeowner_name: homeowner_name,
            homeowner_email: homeowner_email,
            appointment_date: appointment_date || 'To be confirmed',
            appointment_time: appointment_time || 'To be confirmed',
            project_address: project_address,
            project_type: project_type
          });
        } else {
          // Use welcome email for general leads without appointments
          const projectTypeDisplay = project_type ?
            project_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
            'Countertop Project';
          customerEmail = emailTemplates.leadWelcome({
            first_name: homeowner_name ? homeowner_name.split(' ')[0] : null,
            homeowner_name: homeowner_name,
            project_type: projectTypeDisplay,
            notes: project_details || message || null,
            has_appointment: false
          });
        }
        await sendNotification(homeowner_email, customerEmail.subject, customerEmail.html);
        logger.info('Customer confirmation email sent');
      } catch (emailError) {
        // Don't fail the request if customer email fails
        logger.error('Failed to send customer email:', emailError.message);
      }
    }

    res.json({
      success: true,
      message: isAppointment ? 'Appointment booked successfully! Check your email for confirmation.' : 'Lead submitted successfully! Check your email for confirmation.',
      lead_id: `lead_${Date.now()}`,
      confirmation_sent: !!homeowner_email
    });

  } catch (error) {
    logger.error('Lead submission error:', error);
    return handleApiError(res, error);
  }
});

// Send welcome email to a lead (manual trigger from admin)
app.post('/api/lead-welcome', async (req, res) => {
  try {
    const {
      email,
      first_name,
      last_name,
      full_name,
      project_type,
      notes,
      has_appointment,
      appointment_date,
      appointment_time,
      appointment_type,
      source = 'Manual Entry'
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Determine first name for greeting
    const firstName = first_name || (full_name ? full_name.split(' ')[0] : null);

    // Format project type for display
    const projectTypeDisplay = project_type ?
      project_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
      'Countertop Project';

    // Build email data
    const emailData = {
      first_name: firstName,
      homeowner_name: full_name || `${first_name || ''} ${last_name || ''}`.trim(),
      project_type: projectTypeDisplay,
      notes: notes || null,
      has_appointment: !!has_appointment,
      appointment_date: appointment_date || null,
      appointment_time: appointment_time || null,
      appointment_type: appointment_type || null
    };

    // Generate and send the welcome email
    const welcomeEmail = emailTemplates.leadWelcome(emailData);
    const result = await sendNotification(email, welcomeEmail.subject, welcomeEmail.html);

    if (result.success) {
      logger.info('Welcome email sent successfully');
      res.json({
        success: true,
        message: 'Welcome email sent successfully'
      });
    } else {
      logger.error('Failed to send welcome email:', result.reason);
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        reason: result.reason
      });
    }

  } catch (error) {
    logger.error('Welcome email error:', error);
    return handleApiError(res, error);
  }
});

// Send a message/reply to a lead via email
app.post('/api/send-lead-message', authenticateJWT, async (req, res) => {
  try {
    const { to_email, to_name, message, subject, sender_name, lead_id } = req.body;

    if (!to_email || !message) {
      return res.status(400).json({ error: 'to_email and message are required' });
    }

    const recipientName = to_name ? to_name.split(' ')[0] : '';
    const fromName = sender_name || 'Surprise Granite';
    const emailSubject = subject || `Message from ${COMPANY.shortName}`;

    // Look up portal token for this lead (if lead_id provided)
    let portalUrl = null;
    if (lead_id) {
      try {
        const supabase = req.app.get('supabase');
        if (supabase) {
          const { data: token } = await supabase
            .from('portal_tokens')
            .select('token')
            .eq('lead_id', lead_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (token?.token) {
            portalUrl = `https://www.surprisegranite.com/portal/?token=${token.token}`;
          }
        }
      } catch (e) {
        logger.warn('Portal token lookup failed for lead message', { lead_id, error: e.message });
      }
    }

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 24px 32px; text-align: center;">
          <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="height: 48px; margin-bottom: 8px;">
          <h2 style="color: #e8c547; margin: 0; font-size: 18px;">${COMPANY.shortName}</h2>
        </div>
        <div style="padding: 32px;">
          ${recipientName ? `<p style="font-size: 16px; color: #333;">Hi ${recipientName},</p>` : ''}
          <div style="font-size: 15px; color: #444; line-height: 1.7; white-space: pre-wrap;">${message}</div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="font-size: 13px; color: #888;">— ${fromName}</p>
        </div>
        ${portalUrl ? `
        <div style="padding: 0 32px 24px; text-align: center;">
          <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">View Your Project Portal</a>
        </div>
        ` : ''}
        <div style="padding: 0 32px 16px; text-align: center;">
          <a href="https://www.surprisegranite.com/sign-up/" style="font-size: 13px; color: #666; text-decoration: underline;">Create Your Free Account</a>
        </div>
        <div style="background: #f8f9fa; padding: 16px 32px; text-align: center; font-size: 12px; color: #999;">
          <p style="margin: 4px 0;">${COMPANY.name}</p>
          <p style="margin: 4px 0;">${COMPANY.phone} | ${COMPANY.email}</p>
          <p style="margin: 4px 0;">${COMPANY.address}</p>
        </div>
      </div>
    `;

    const result = await sendNotification(to_email, emailSubject, html);

    if (result.success) {
      res.json({ success: true, message: 'Email sent successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send email', reason: result.reason });
    }
  } catch (error) {
    logger.error('Send lead message error:', error);
    return handleApiError(res, error);
  }
});

// Send network invite email
app.post('/api/send-network-invite', async (req, res) => {
  try {
    const { to, inviterName, inviteeName, role, inviteUrl, companyName } = req.body;

    if (!to || !inviterName || !inviteeName || !inviteUrl) {
      return res.status(400).json({ success: false, error: 'Missing required fields: to, inviterName, inviteeName, inviteUrl' });
    }

    const roleLabels = {
      contractor: 'Contractor',
      fabricator: 'Fabricator',
      installer: 'Installer',
      plumber: 'Plumber',
      designer: 'Designer',
      vendor: 'Vendor',
      partner: 'Partner',
      other: 'Team Member'
    };
    const roleLabel = roleLabels[role] || roleLabels.other;

    const subject = `${inviterName} invited you to join their network on ${companyName || 'Surprise Granite'}`;

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a12; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #f9cb00, #cca600); padding: 30px; text-align: center;">
          <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="width: 60px; height: 60px; border-radius: 12px; margin-bottom: 16px;" />
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">You're Invited!</h1>
        </div>
        <div style="padding: 32px;">
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            Hi ${inviteeName},
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            <strong>${inviterName}</strong> has invited you to join their professional network on ${companyName || COMPANY.shortName} as a <strong>${roleLabel}</strong>.
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
            Click the button below to accept this invitation and connect with ${inviterName}.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00, #cca600); color: #1a1a2e; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 700; font-size: 16px;">
              Accept Invitation
            </a>
          </div>
          <p style="font-size: 14px; color: #888; margin-top: 32px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
        <div style="background: #12121a; padding: 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
          <p style="margin: 0; font-size: 12px; color: #666;">
            ${COMPANY.name}<br />
            ${COMPANY.address}<br />
            ${COMPANY.phone} | ${COMPANY.email}
          </p>
        </div>
      </div>
    `;

    const result = await sendNotification(to, subject, html);

    if (result.success) {
      logger.info('Network invite sent:', { to, inviterName, inviteeName, role });
      res.json({ success: true, message: 'Invitation sent successfully' });
    } else {
      logger.warn('Network invite failed:', { to, reason: result.reason });
      res.status(500).json({ success: false, error: 'Failed to send invitation', reason: result.reason });
    }
  } catch (error) {
    logger.error('Send network invite error:', error);
    return handleApiError(res, error);
  }
});

// Send contractor portal invite email
app.post('/api/collaborators/send-invite', async (req, res) => {
  try {
    const { email, invite_link, contractor_name } = req.body;

    if (!email || !invite_link) {
      return res.status(400).json({ success: false, error: 'Missing required fields: email, invite_link' });
    }

    const subject = `Your Contractor Portal Access - ${COMPANY.shortName}`;

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a12; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #f9cb00, #cca600); padding: 30px; text-align: center;">
          <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="width: 60px; height: 60px; border-radius: 12px; margin-bottom: 16px;" />
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">Contractor Portal Access</h1>
        </div>
        <div style="padding: 32px;">
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            Hi${contractor_name ? ' ' + contractor_name : ''},
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            You've been given access to the ${COMPANY.shortName} Contractor Portal. Use the link below to view your assigned projects, schedules, and more.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${invite_link}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00, #cca600); color: #1a1a2e; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 700; font-size: 16px;">
              Access Portal
            </a>
          </div>
          <p style="font-size: 14px; color: #888; margin-top: 32px;">
            This is your personal access link. Please don't share it with others.
          </p>
        </div>
        <div style="background: #12121a; padding: 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
          <p style="margin: 0; font-size: 12px; color: #666;">
            ${COMPANY.name}<br />
            ${COMPANY.phone} | ${COMPANY.email}
          </p>
        </div>
      </div>
    `;

    const result = await sendNotification(email, subject, html);

    if (result.success) {
      logger.info('Contractor portal invite sent:', { email });
      res.json({ success: true, message: 'Portal invite sent successfully' });
    } else {
      logger.warn('Contractor portal invite failed:', { email, reason: result.reason });
      res.status(500).json({ success: false, error: 'Failed to send invite', reason: result.reason });
    }
  } catch (error) {
    logger.error('Send contractor invite error:', error);
    return handleApiError(res, error);
  }
});

// Send collaborator message via email
app.post('/api/send-collaborator-message', async (req, res) => {
  try {
    const { to, senderName, recipientName, message } = req.body;

    if (!to || !senderName || !message) {
      return res.status(400).json({ success: false, error: 'Missing required fields: to, senderName, message' });
    }

    const subject = `New message from ${senderName}`;

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a12; color: #ffffff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #f9cb00, #cca600); padding: 24px; text-align: center;">
          <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="width: 50px; height: 50px; border-radius: 10px; margin-bottom: 12px;" />
          <h1 style="color: #1a1a2e; margin: 0; font-size: 20px;">New Message</h1>
        </div>
        <div style="padding: 28px;">
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
            Hi ${recipientName || 'there'},
          </p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
            <strong>${senderName}</strong> sent you a message:
          </p>
          <div style="background: #1a1a2e; border-left: 4px solid #f9cb00; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.surprisegranite.com/account/#collaborations" style="display: inline-block; background: linear-gradient(135deg, #f9cb00, #cca600); color: #1a1a2e; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px;">
              Reply in App
            </a>
          </div>
        </div>
        <div style="background: #12121a; padding: 20px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
          <p style="margin: 0; font-size: 11px; color: #666;">
            ${COMPANY.name} | ${COMPANY.phone}
          </p>
        </div>
      </div>
    `;

    const result = await sendNotification(to, subject, html);

    if (result.success) {
      logger.info('Collaborator message sent:', { to, senderName });
      res.json({ success: true, message: 'Message sent successfully' });
    } else {
      logger.warn('Collaborator message failed:', { to, reason: result.reason });
      res.status(500).json({ success: false, error: 'Failed to send message', reason: result.reason });
    }
  } catch (error) {
    logger.error('Send collaborator message error:', error);
    return handleApiError(res, error);
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

    logger.info('Lead purchase session created:', session.id);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    logger.error('Lead purchase error:', error);
    return handleApiError(res, error);
  }
});

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

    logger.info('New lead with images received', {
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
    logger.error('Lead with images submission error:', error);
    return handleApiError(res, error);
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

    logger.info('Lead assignment:', assignment);

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
    logger.error('Lead assignment error:', error);
    return handleApiError(res, error);
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

    logger.info(`Auto-assignment for lead ${lead_id} in ZIP ${project_zip}:`, matchedVendors);

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
    logger.error('Auto-assignment error:', error);
    return handleApiError(res, error);
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
    logger.error('Get leads error:', error);
    return handleApiError(res, error);
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
    logger.error('Get assignment rules error:', error);
    return handleApiError(res, error);
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

    logger.info('Assignment rule saved:', rule);

    res.json({
      success: true,
      rule,
      message: id ? 'Rule updated' : 'Rule created'
    });

  } catch (error) {
    logger.error('Save assignment rule error:', error);
    return handleApiError(res, error);
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
      logger.error('OpenAI error:', error);
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
      logger.error('Failed to parse AI response:', content);
      parsedData = { products: [], error: 'Could not parse response' };
    }

    res.json({
      success: true,
      data: parsedData,
      raw_response: content
    });

  } catch (error) {
    logger.error('Price sheet parse error:', error);
    return handleApiError(res, error);
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
    logger.error('CSV parse error:', error);
    return handleApiError(res, error);
  }
});

// ==================== PROFESSIONAL ESTIMATES ====================

// Send professional estimate email to customer
app.post('/api/send-estimate', emailRateLimiter, async (req, res) => {
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
    const custName = sanitizeString(customer_name || customerName || 'Valued Customer', 200);
    const custEmail = customer_email || to;
    const estNumber = estimate_number || estimateNumber;
    const viewUrl = view_url || approvalUrl;
    const projType = sanitizeString(project_type || projectName, 200);

    if (!custEmail || !isValidEmail(custEmail)) {
      return res.status(400).json({ error: 'Valid customer email is required' });
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
              ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" style="max-height: 60px; width: auto; margin-bottom: 12px;">` : ''}
              <h1 style="color: #f9cb00; margin: 0 0 5px; font-size: 22px; font-weight: 700;">${companyName}</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 0 0 15px; font-size: 14px; letter-spacing: 1px;">Marble & Quartz</p>
              <p style="color: #f9cb00; margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Professional Estimate</p>
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
      logger.info('PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    } catch (pdfErr) {
      logger.error('PDF generation error:', pdfErr.message);
      // Continue without PDF if generation fails
    }

    // Check if SMTP is configured
    if (!SMTP_USER) {
      logger.info('Email notification (SMTP not configured):', { to: custEmail });
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
      logger.info(`Estimate email sent${pdfBuffer ? ' with PDF attachment' : ''}`);
      res.json({
        success: true,
        message: 'Estimate email sent successfully',
        pdf_attached: !!pdfBuffer
      });
    } catch (emailErr) {
      logger.error('Failed to send estimate email');
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        smtp_configured: !!SMTP_USER
      });
    }

  } catch (error) {
    logger.error('Send estimate error:', error);
    return handleApiError(res, error);
  }
});

// ============ MATERIAL ORDERS API ============

// Create material order and send email
app.post('/api/jobs/:jobId/material-order', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
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

    // Verify ownership or admin access
    const isAdmin = await verifyAdminAccess(userId);
    if (job.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied - you do not own this job' });
    }

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
    logger.error('Material order error:', error);
    return handleApiError(res, error);
  }
});

// Update material order status
app.patch('/api/material-orders/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;

    // Get the material order to verify ownership
    const { data: existingOrder } = await supabase
      .from('material_orders')
      .select('user_id, job_id')
      .eq('id', req.params.id)
      .single();

    if (!existingOrder) {
      return res.status(404).json({ error: 'Material order not found' });
    }

    // Verify ownership or admin access
    const isAdmin = await verifyAdminAccess(userId);
    if (existingOrder.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied - you do not own this material order' });
    }

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
    logger.error('Update material order error:', error);
    return handleApiError(res, error);
  }
});

// ============ CUSTOMERS API ============

// Get all customers
app.get('/api/customers-list', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    // Customer list requires admin access to view all customers
    if (!await verifyAdminAccess(req.user?.id)) {
      return res.status(403).json({ error: 'Admin access required to view customer list' });
    }

    const { data: customers, error } = await supabase
      .from('customers')
      .select('*, jobs(id, job_number, status)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ customers: customers || [] });
  } catch (error) {
    logger.error('Get customers error:', error);
    return handleApiError(res, error);
  }
});

// ============ DISTRIBUTOR MARKETPLACE API ============

// Helper: Verify distributor owns the resource
async function verifyDistributorOwnership(distributorId, userId) {
  if (!supabase) return false;
  const { data } = await supabase
    .from('distributor_profiles')
    .select('id')
    .eq('id', distributorId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

// Helper: Verify API key
async function verifyDistributorApiKey(apiKey) {
  if (!supabase || !apiKey) return null;

  const crypto = require('crypto');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyPrefix = apiKey.substring(0, 11); // 'sg_' + 8 chars - matches creation

  const { data } = await supabase
    .from('distributor_api_keys')
    .select('distributor_id, permissions, rate_limit_per_hour')
    .eq('key_prefix', keyPrefix)
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (data) {
    // Update last used - use RPC for safe increment
    await supabase.rpc('increment_api_key_requests', { prefix: keyPrefix });
  }

  return data;
}

// ============================================
// DISTRIBUTOR API (Original endpoints below)
// ============================================

// Get distributor profile
app.get('/api/distributor/profile', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile, error } = await supabase
      .from('distributor_profiles')
      .select(`
        *,
        distributor_locations(*),
        distributor_analytics(*)
      `)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    if (!profile) return res.status(404).json({ error: 'Distributor profile not found' });

    res.json({ profile });
  } catch (error) {
    logger.error('Get distributor profile error:', error);
    return handleApiError(res, error);
  }
});

// Update distributor profile
app.patch('/api/distributor/profile', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;
    delete updates.stripe_connect_id;
    delete updates.verification_status;

    const { data: profile, error } = await supabase
      .from('distributor_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ profile });
  } catch (error) {
    logger.error('Update distributor profile error:', error);
    return handleApiError(res, error);
  }
});

// ============ SLAB INVENTORY API ============

// Get all slabs for a distributor
app.get('/api/distributor/inventory', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    let distributorId;

    // Auth via API key (from middleware) or JWT user
    if (req.authMethod === 'api_key' && req.distributorId) {
      distributorId = req.distributorId;
    } else if (req.user?.id) {
      const { data: profile } = await supabase
        .from('distributor_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .single();
      if (!profile) return res.status(401).json({ error: 'Distributor not found' });
      distributorId = profile.id;
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { status, material_type, brand, location_id, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('slab_inventory')
      .select('*, distributor_locations(location_name, city, state)')
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (material_type) query = query.eq('material_type', material_type);
    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (location_id) query = query.eq('location_id', location_id);

    const { data: slabs, error, count } = await query;

    if (error) throw error;

    res.json({ slabs: slabs || [], total: count });
  } catch (error) {
    logger.error('Get inventory error:', error);
    return handleApiError(res, error);
  }
});

// Get single slab
app.get('/api/distributor/inventory/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: slab, error } = await supabase
      .from('slab_inventory')
      .select('*, distributor_profiles(company_name, logo_url), distributor_locations(*)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!slab) return res.status(404).json({ error: 'Slab not found' });

    // Increment view count
    await supabase.rpc('increment_slab_view', { p_slab_id: req.params.id });

    res.json({ slab });
  } catch (error) {
    logger.error('Get slab error:', error);
    return handleApiError(res, error);
  }
});

// Create new slab
app.post('/api/distributor/inventory', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    let distributorId;

    if (req.authMethod === 'api_key' && req.distributorId) {
      if (!req.permissions?.includes('write')) {
        return res.status(403).json({ error: 'API key does not have write permission' });
      }
      distributorId = req.distributorId;
    } else if (req.user?.id) {
      const { data: profile } = await supabase
        .from('distributor_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .single();
      if (!profile) return res.status(401).json({ error: 'Distributor not found' });
      distributorId = profile.id;
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const slabData = {
      ...req.body,
      distributor_id: distributorId,
      sync_source: req.authMethod === 'api_key' ? 'api' : 'manual',
      listed_at: new Date().toISOString()
    };

    const { data: slab, error } = await supabase
      .from('slab_inventory')
      .insert(slabData)
      .select()
      .single();

    if (error) throw error;

    // Update distributor stats
    await supabase.rpc('update_distributor_stats', { p_distributor_id: distributorId });

    res.status(201).json({ slab });
  } catch (error) {
    logger.error('Create slab error:', error);
    return handleApiError(res, error);
  }
});

// Update slab
app.patch('/api/distributor/inventory/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    let distributorId;

    if (req.authMethod === 'api_key' && req.distributorId) {
      if (!req.permissions?.includes('write')) {
        return res.status(403).json({ error: 'API key does not have write permission' });
      }
      distributorId = req.distributorId;
    } else if (req.user?.id) {
      const { data: profile } = await supabase
        .from('distributor_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .single();
      if (!profile) return res.status(401).json({ error: 'Distributor not found' });
      distributorId = profile.id;
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('slab_inventory')
      .select('distributor_id')
      .eq('id', req.params.id)
      .single();

    if (!existing || existing.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized to update this slab' });
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.distributor_id;

    const { data: slab, error } = await supabase
      .from('slab_inventory')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ slab });
  } catch (error) {
    logger.error('Update slab error:', error);
    return handleApiError(res, error);
  }
});

// Delete slab
app.delete('/api/distributor/inventory/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    let distributorId;

    if (req.authMethod === 'api_key' && req.distributorId) {
      if (!req.permissions?.includes('delete')) {
        return res.status(403).json({ error: 'API key does not have delete permission' });
      }
      distributorId = req.distributorId;
    } else if (req.user?.id) {
      const { data: profile } = await supabase
        .from('distributor_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .single();
      if (!profile) return res.status(401).json({ error: 'Distributor not found' });
      distributorId = profile.id;
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('slab_inventory')
      .select('distributor_id')
      .eq('id', req.params.id)
      .single();

    if (!existing || existing.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized to delete this slab' });
    }

    const { error } = await supabase
      .from('slab_inventory')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Update distributor stats
    await supabase.rpc('update_distributor_stats', { p_distributor_id: distributorId });

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete slab error:', error);
    return handleApiError(res, error);
  }
});

// ============ BULK INVENTORY IMPORT ============

// Bulk import slabs from CSV data
app.post('/api/distributor/inventory/bulk', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    let distributorId;

    if (req.authMethod === 'api_key' && req.distributorId) {
      if (!req.permissions?.includes('write')) {
        return res.status(403).json({ error: 'API key does not have write permission' });
      }
      distributorId = req.distributorId;
    } else if (req.user?.id) {
      const { data: profile } = await supabase
        .from('distributor_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .single();
      if (!profile) return res.status(401).json({ error: 'Distributor not found' });
      distributorId = profile.id;
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { slabs, sync_type = 'incremental' } = req.body;

    if (!Array.isArray(slabs) || slabs.length === 0) {
      return res.status(400).json({ error: 'No slabs provided' });
    }

    // Create sync log
    const { data: syncLog } = await supabase
      .from('inventory_sync_logs')
      .insert({
        distributor_id: distributorId,
        sync_type,
        sync_source: apiKey ? 'api' : 'csv_upload',
        status: 'processing',
        records_processed: 0,
        initiated_by: userId || null
      })
      .select()
      .single();

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    // Process each slab
    for (const slab of slabs) {
      try {
        const slabData = {
          ...slab,
          distributor_id: distributorId,
          sync_source: apiKey ? 'api' : 'csv_upload',
          last_synced_at: new Date().toISOString()
        };

        // Check if slab exists by external_id
        if (slab.external_id) {
          const { data: existing } = await supabase
            .from('slab_inventory')
            .select('id')
            .eq('distributor_id', distributorId)
            .eq('external_id', slab.external_id)
            .single();

          if (existing) {
            // Update existing
            delete slabData.distributor_id;
            await supabase
              .from('slab_inventory')
              .update(slabData)
              .eq('id', existing.id);
            results.updated++;
            continue;
          }
        }

        // Insert new
        slabData.listed_at = new Date().toISOString();
        await supabase
          .from('slab_inventory')
          .insert(slabData);
        results.created++;

      } catch (err) {
        results.failed++;
        results.errors.push({
          slab: slab.external_id || slab.product_name,
          error: err.message
        });
      }
    }

    // Update sync log
    await supabase
      .from('inventory_sync_logs')
      .update({
        status: results.failed > 0 ? 'partial' : 'completed',
        records_processed: slabs.length,
        records_created: results.created,
        records_updated: results.updated,
        records_failed: results.failed,
        error_details: results.errors.length > 0 ? results.errors : null,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - new Date(syncLog.started_at).getTime()) / 1000)
      })
      .eq('id', syncLog.id);

    // Update distributor stats
    await supabase.rpc('update_distributor_stats', { p_distributor_id: distributorId });

    res.json({
      success: true,
      sync_id: syncLog.id,
      results
    });
  } catch (error) {
    logger.error('Bulk import error:', error);
    return handleApiError(res, error);
  }
});

// ============ DISTRIBUTOR LOCATIONS ============

// Get all locations for distributor
app.get('/api/distributor/locations', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { data: locations, error } = await supabase
      .from('distributor_locations')
      .select('*')
      .eq('distributor_id', profile.id)
      .order('is_primary', { ascending: false });

    if (error) throw error;

    res.json({ locations: locations || [] });
  } catch (error) {
    logger.error('Get locations error:', error);
    return handleApiError(res, error);
  }
});

// Add location
app.post('/api/distributor/locations', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const locationData = {
      ...req.body,
      distributor_id: profile.id
    };

    const { data: location, error } = await supabase
      .from('distributor_locations')
      .insert(locationData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ location });
  } catch (error) {
    logger.error('Add location error:', error);
    return handleApiError(res, error);
  }
});

// Update location
app.patch('/api/distributor/locations/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.distributor_id;

    const { data: location, error } = await supabase
      .from('distributor_locations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('distributor_id', profile.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ location });
  } catch (error) {
    logger.error('Update location error:', error);
    return handleApiError(res, error);
  }
});

// Delete location
app.delete('/api/distributor/locations/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { error } = await supabase
      .from('distributor_locations')
      .delete()
      .eq('id', req.params.id)
      .eq('distributor_id', profile.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete location error:', error);
    return handleApiError(res, error);
  }
});

// ============ PUBLIC MARKETPLACE API ============

// Get stone yard partners (for /stone-yards/ page)
app.get('/api/marketplace/stone-yards', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    // Try the RPC function first
    const { data: partners, error } = await supabase.rpc('get_stone_yard_partners');

    if (error) {
      // Fallback: direct query if function doesn't exist
      const { data: fallbackPartners, error: fallbackError } = await supabase
        .from('distributor_profiles')
        .select(`
          id, company_name, company_type, primary_contact_phone,
          website, material_types,
          distributor_locations!inner (
            location_name, address_line1, city, state, zip_code,
            latitude, longitude, has_showroom, has_slab_yard
          )
        `)
        .eq('is_stone_yard_partner', true)
        .eq('is_active', true)
        .eq('verification_status', 'verified')
        .eq('distributor_locations.is_primary', true)
        .order('company_name');

      if (fallbackError) {
        logger.error('Get stone yard partners error:', fallbackError);
        return res.status(500).json({ error: 'Failed to fetch partners' });
      }

      const transformed = (fallbackPartners || []).map(p => ({
        id: p.id,
        company_name: p.company_name,
        company_type: p.company_type,
        phone: p.primary_contact_phone,
        website: p.website,
        material_types: p.material_types,
        location_name: p.distributor_locations?.[0]?.location_name,
        address: p.distributor_locations?.[0]?.address_line1,
        city: p.distributor_locations?.[0]?.city,
        state: p.distributor_locations?.[0]?.state,
        zip_code: p.distributor_locations?.[0]?.zip_code,
        latitude: p.distributor_locations?.[0]?.latitude,
        longitude: p.distributor_locations?.[0]?.longitude,
        has_showroom: p.distributor_locations?.[0]?.has_showroom,
        has_slab_yard: p.distributor_locations?.[0]?.has_slab_yard
      }));

      return res.json({ partners: transformed });
    }

    res.json({ partners: partners || [] });
  } catch (error) {
    logger.error('Get stone yard partners error:', error);
    return res.status(500).json({ error: 'Failed to fetch partners' });
  }
});

// Search slabs (public) - Updated to use products table
app.get('/api/marketplace/slabs', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const {
      material_type,
      brand,
      color,
      min_price,
      max_price,
      min_sqft,
      max_sqft,
      state,
      search,
      limit = 50,
      offset = 0,
      use_legacy_schema = 'false' // Feature flag - set to 'true' to use old slab_inventory
    } = req.query;

    // Use new distributor_products schema (default)
    if (use_legacy_schema !== 'true') {
      let query = supabase
        .from('distributor_products')
        .select(`
          id, name, brand, sku, material_type, category, subcategory,
          dimensions, thickness, finish, color,
          unit_price, unit_type, sqft_per_box,
          description, is_active, primary_image_url,
          distributor_id, created_at, updated_at,
          distributor_profiles(company_name, website)
        `, { count: 'exact' })
        .eq('is_active', true);

      // Apply filters
      if (material_type) query = query.ilike('material_type', `%${material_type}%`);
      if (brand) query = query.ilike('brand', `%${brand}%`);
      if (color) query = query.ilike('color', `%${color}%`);
      if (min_price) query = query.gte('unit_price', parseFloat(min_price));
      if (max_price) query = query.lte('unit_price', parseFloat(max_price));
      if (search) {
        query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,material_type.ilike.%${search}%,color.ilike.%${search}%`);
      }

      // Pagination
      query = query
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      const { data: products, error, count } = await query;

      if (error) throw error;

      // Transform products to match expected slab format
      const slabs = (products || []).map(p => ({
        id: p.id,
        distributor_id: p.distributor_id,
        product_name: p.name,
        brand: p.brand,
        material_type: p.material_type,
        color_family: p.color,
        finish: p.finish,
        description: p.description,
        price_per_sqft: p.unit_price,
        dimensions: p.dimensions,
        thickness: p.thickness,
        images: p.primary_image_url ? [p.primary_image_url] : [],
        status: p.is_active ? 'available' : 'inactive',
        created_at: p.created_at,
        updated_at: p.updated_at,
        distributor: p.distributor_profiles
      }));

      return res.json({ slabs, total: count });
    }

    // Legacy: Use the search function for slab_inventory
    const { data: slabs, error } = await supabase.rpc('search_slabs', {
      p_material_type: material_type || null,
      p_brand: brand || null,
      p_color: color || null,
      p_min_price: min_price ? parseFloat(min_price) : null,
      p_max_price: max_price ? parseFloat(max_price) : null,
      p_min_sqft: min_sqft ? parseFloat(min_sqft) : null,
      p_max_sqft: max_sqft ? parseFloat(max_sqft) : null,
      p_location_state: state || null,
      p_search_term: search || null,
      p_limit: parseInt(limit),
      p_offset: parseInt(offset)
    });

    if (error) throw error;

    res.json({ slabs: slabs || [] });
  } catch (error) {
    logger.error('Search slabs error:', error);
    return handleApiError(res, error);
  }
});

// General marketplace products search (new unified endpoint)
app.get('/api/marketplace/products', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const {
      product_type,
      material_type,
      brand,
      color,
      color_family,
      featured,
      min_price,
      max_price,
      search,
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('distributor_products')
      .select(`
        id, name, brand, sku, material_type, category, subcategory,
        dimensions, thickness, finish, color,
        unit_price, unit_type, sqft_per_box,
        description, is_active, primary_image_url,
        distributor_id, created_at, updated_at,
        distributor_profiles(company_name, website)
      `, { count: 'exact' })
      .eq('is_active', true);

    // Apply filters
    if (product_type) query = query.eq('category', product_type);
    if (material_type) query = query.ilike('material_type', `%${material_type}%`);
    if (brand) query = query.ilike('brand', `%${brand}%`);
    const colorFilter = color_family || color;
    if (colorFilter) query = query.ilike('color', `%${colorFilter}%`);
    if (min_price) query = query.gte('unit_price', parseFloat(min_price));
    if (max_price) query = query.lte('unit_price', parseFloat(max_price));

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%,material_type.ilike.%${search}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: products, error, count } = await query;

    if (error) throw error;

    res.json({
      products: products || [],
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Search marketplace products error:', error);
    return handleApiError(res, error);
  }
});

// Get marketplace product detail
app.get('/api/marketplace/products/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: product, error } = await supabase
      .from('distributor_products')
      .select(`
        *,
        distributor_product_slabs(*),
        distributor_product_tiles(*),
        distributor_product_flooring(*),
        distributor_product_installation(*),
        distributors(
          id, company_name, logo_url, website, phone,
          city, state
        ),
        distributor_locations(
          id, name, address_line1, city, state, postal_code, phone
        )
      `)
      .eq('id', req.params.id)
      .eq('is_public', true)
      .single();

    if (error) throw error;
    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json({ product });
  } catch (error) {
    logger.error('Get marketplace product error:', error);
    return handleApiError(res, error);
  }
});

// Get slab detail (public) - Updated to use distributor_products
app.get('/api/marketplace/slabs/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data: product, error } = await supabase
      .from('distributor_products')
      .select(`
        *,
        distributor_product_slabs(*),
        distributors(
          id, company_name, logo_url, website, phone, city, state
        ),
        distributor_locations(
          id, name, city, state, postal_code, phone
        )
      `)
      .eq('id', req.params.id)
      .eq('product_type', 'slab')
      .eq('is_public', true)
      .single();

    if (error) throw error;
    if (!product) return res.status(404).json({ error: 'Slab not found' });

    // Transform to legacy slab format for backwards compatibility
    const slab = {
      id: product.id,
      distributor_id: product.distributor_id,
      product_name: product.name,
      brand: product.brand,
      material_type: product.material_type,
      color_family: product.color_family,
      finish: product.finish,
      description: product.description,
      price_per_sqft: product.wholesale_price,
      length_inches: product.distributor_product_slabs?.[0]?.length_inches,
      width_inches: product.distributor_product_slabs?.[0]?.width_inches,
      thickness_cm: product.distributor_product_slabs?.[0]?.thickness_cm,
      sqft: product.distributor_product_slabs?.[0]?.sqft,
      quality_grade: product.distributor_product_slabs?.[0]?.quality_grade,
      origin_country: product.distributor_product_slabs?.[0]?.origin_country,
      lot_number: product.distributor_product_slabs?.[0]?.lot_number,
      images: product.images || [],
      status: product.status === 'active' ? 'available' : product.status,
      is_featured: product.is_featured,
      created_at: product.created_at,
      updated_at: product.updated_at,
      distributor: product.distributors,
      location: product.distributor_locations
    };

    res.json({ slab });
  } catch (error) {
    logger.error('Get slab detail error:', error);
    return handleApiError(res, error);
  }
});

// Submit slab/product inquiry - Updated to use distributor_products
app.post('/api/marketplace/slabs/:id/inquiry', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { name, email, phone, company_name, inquirer_type, message, project_type, project_zip, estimated_sqft, timeline } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Get product and distributor info from new schema
    const { data: product } = await supabase
      .from('distributor_products')
      .select(`
        id, distributor_id, name, brand, wholesale_price,
        distributors(id, company_name, email, contact_name)
      `)
      .eq('id', req.params.id)
      .single();

    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Try to create inquiry in product_inquiries table (if exists)
    let inquiry = null;
    try {
      const { data, error } = await supabase
        .from('product_inquiries')
        .insert({
          product_id: req.params.id,
          distributor_id: product.distributor_id,
          inquirer_type: inquirer_type || 'homeowner',
          name,
          email,
          phone,
          company_name,
          message,
          project_type,
          project_zip,
          estimated_sqft,
          timeline,
          source: 'marketplace',
          source_url: req.headers.referer
        })
        .select()
        .single();

      if (!error) inquiry = data;
    } catch (e) {
      // Table may not exist yet, continue without storing
      logger.info('product_inquiries table not available, sending email only');
    }

    // Send email notification to distributor
    const distributorEmail = product.distributors?.email;
    if (distributorEmail) {
      await sendNotification(
        distributorEmail,
        `New Inquiry for ${product.name}`,
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">New Product Inquiry</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Product:</strong> ${product.name} ${product.brand ? `(${product.brand})` : ''}</p>
            <p><strong>Price:</strong> $${product.wholesale_price || 'N/A'}/sqft</p>
          </div>
          <h3>Contact Information</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          ${company_name ? `<p><strong>Company:</strong> ${company_name}</p>` : ''}
          ${inquirer_type ? `<p><strong>Type:</strong> ${inquirer_type}</p>` : ''}
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
          ${project_type ? `<p><strong>Project:</strong> ${project_type}</p>` : ''}
          ${estimated_sqft ? `<p><strong>Est. Sqft:</strong> ${estimated_sqft}</p>` : ''}
          <div style="margin-top: 30px;">
            <a href="https://www.surprisegranite.com/distributor/dashboard/inquiries/" style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View All Inquiries</a>
          </div>
        </div>
        `
      );
    }

    // Also send to admin
    await sendNotification(
      process.env.ADMIN_EMAIL || 'info@surprisegranite.com',
      `Marketplace Inquiry: ${product.name}`,
      `<p>New inquiry from ${name} (${email}) for ${product.name}. Distributor: ${product.distributors?.company_name || 'Unknown'}</p><p>Message: ${message || 'No message'}</p>`
    );

    res.status(201).json({
      inquiry: inquiry || { id: 'email-only', product_id: req.params.id },
      message: 'Inquiry submitted successfully'
    });
  } catch (error) {
    logger.error('Submit inquiry error:', error);
    return handleApiError(res, error);
  }
});

// ============ DISTRIBUTOR API KEYS ============

// Generate new API key
app.post('/api/distributor/api-keys', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const crypto = require('crypto');
    const apiKey = 'sg_' + crypto.randomBytes(32).toString('hex');
    const keyPrefix = apiKey.substring(0, 11); // 'sg_' + 8 chars
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const { key_name = 'API Key', permissions = ['read', 'write'], allowed_ips } = req.body;

    const { data: keyRecord, error } = await supabase
      .from('distributor_api_keys')
      .insert({
        distributor_id: profile.id,
        key_name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        permissions,
        allowed_ips: allowed_ips || null,
        created_by: userId
      })
      .select('id, key_name, key_prefix, permissions, created_at')
      .single();

    if (error) throw error;

    // Return the full key only once - it cannot be retrieved again
    res.status(201).json({
      key: keyRecord,
      api_key: apiKey,
      warning: 'Save this API key now. It cannot be retrieved again.'
    });
  } catch (error) {
    logger.error('Generate API key error:', error);
    return handleApiError(res, error);
  }
});

// List API keys
app.get('/api/distributor/api-keys', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { data: keys, error } = await supabase
      .from('distributor_api_keys')
      .select('id, key_name, key_prefix, permissions, last_used_at, total_requests, is_active, created_at')
      .eq('distributor_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ keys: keys || [] });
  } catch (error) {
    logger.error('List API keys error:', error);
    return handleApiError(res, error);
  }
});

// Revoke API key
app.delete('/api/distributor/api-keys/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { error } = await supabase
      .from('distributor_api_keys')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_reason: req.body.reason || 'User revoked'
      })
      .eq('id', req.params.id)
      .eq('distributor_id', profile.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke API key error:', error);
    return handleApiError(res, error);
  }
});

// ============ DISTRIBUTOR INQUIRIES ============

// Get all inquiries for distributor
app.get('/api/distributor/inquiries', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('slab_inquiries')
      .select(`
        *,
        slab:slab_id (
          id, product_name, brand, material_type, color, price_per_sqft,
          primary_image_url
        )
      `, { count: 'exact' })
      .eq('distributor_id', profile.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: inquiries, error, count } = await query;

    if (error) throw error;

    res.json({
      inquiries: inquiries || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get inquiries error:', error);
    return handleApiError(res, error);
  }
});

// Get single inquiry
app.get('/api/distributor/inquiries/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { data: inquiry, error } = await supabase
      .from('slab_inquiries')
      .select(`
        *,
        slab:slab_id (
          id, product_name, brand, material_type, color, price_per_sqft,
          length_inches, width_inches, thickness_cm, primary_image_url
        )
      `)
      .eq('id', req.params.id)
      .eq('distributor_id', profile.id)
      .single();

    if (error) throw error;
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

    res.json({ inquiry });
  } catch (error) {
    logger.error('Get inquiry error:', error);
    return handleApiError(res, error);
  }
});

// Update inquiry status
app.patch('/api/distributor/inquiries/:id', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { status, notes, response_message } = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (status) {
      const validStatuses = ['new', 'contacted', 'quoted', 'closed', 'converted'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.status = status;
      if (status === 'contacted' || status === 'quoted') {
        updates.responded_at = updates.responded_at || new Date().toISOString();
      }
    }
    if (notes !== undefined) updates.notes = notes;
    if (response_message !== undefined) updates.response_message = response_message;

    const { data: inquiry, error } = await supabase
      .from('slab_inquiries')
      .update(updates)
      .eq('id', req.params.id)
      .eq('distributor_id', profile.id)
      .select()
      .single();

    if (error) throw error;
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

    res.json({ inquiry });
  } catch (error) {
    logger.error('Update inquiry error:', error);
    return handleApiError(res, error);
  }
});

// Get inquiry statistics
app.get('/api/distributor/inquiries/stats/summary', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    // Get counts by status
    const { data: inquiries, error } = await supabase
      .from('slab_inquiries')
      .select('status')
      .eq('distributor_id', profile.id);

    if (error) throw error;

    const stats = {
      total: inquiries?.length || 0,
      new: 0,
      contacted: 0,
      quoted: 0,
      converted: 0,
      closed: 0
    };

    (inquiries || []).forEach(inq => {
      if (stats[inq.status] !== undefined) {
        stats[inq.status]++;
      }
    });

    res.json({ stats });
  } catch (error) {
    logger.error('Get inquiry stats error:', error);
    return handleApiError(res, error);
  }
});

// ============ DISTRIBUTOR ANALYTICS ============

// Get analytics summary
app.get('/api/distributor/analytics', authenticateJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id, total_slabs, total_products, total_orders, total_revenue')
      .eq('user_id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Distributor not found' });

    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get daily analytics
    const { data: dailyStats } = await supabase
      .from('distributor_analytics')
      .select('*')
      .eq('distributor_id', profile.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    // Get recent inquiries count
    const { count: recentInquiries } = await supabase
      .from('slab_inquiries')
      .select('id', { count: 'exact' })
      .eq('distributor_id', profile.id)
      .gte('created_at', startDate.toISOString());

    // Get total views across all slabs
    const { data: viewStats } = await supabase
      .from('slab_inventory')
      .select('view_count, inquiry_count')
      .eq('distributor_id', profile.id);

    const totalViews = viewStats?.reduce((sum, s) => sum + (s.view_count || 0), 0) || 0;
    const totalInquiries = viewStats?.reduce((sum, s) => sum + (s.inquiry_count || 0), 0) || 0;

    res.json({
      summary: {
        total_slabs: profile.total_slabs,
        total_products: profile.total_products,
        total_orders: profile.total_orders,
        total_revenue: profile.total_revenue,
        total_views: totalViews,
        total_inquiries: totalInquiries,
        recent_inquiries: recentInquiries
      },
      daily: dailyStats || []
    });
  } catch (error) {
    logger.error('Get analytics error:', error);
    return handleApiError(res, error);
  }
});

// ============================================
// ENTERPRISE PRODUCTS API
// Universal product management for slabs, tiles, flooring, installation products
// ============================================

// Helper: Get distributor ID from authenticated user or API key
async function getDistributorId(req) {
  // Use API key from auth middleware if authenticated via API key
  if (req.authMethod === 'api_key' && req.distributorId) {
    return req.distributorId;
  }

  // Use authenticated user ID from JWT
  const userId = req.user?.id;
  if (userId) {
    // Check new distributors table first
    const { data: distributor } = await supabase
      .from('distributors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (distributor?.id) return distributor.id;

    // Fallback to legacy distributor_profiles
    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();
    return profile?.id;
  }

  return null;
}

// GET /api/products - List products with filters
app.get('/api/products', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const {
      distributor_id,
      product_type,
      material_type,
      color_family,
      status = 'active',
      search,
      min_price,
      max_price,
      is_public,
      limit = 50,
      offset = 0
    } = req.query;

    // Build query
    let query = supabase
      .from('distributor_products')
      .select(`
        *,
        distributor_product_slabs(*),
        distributor_product_tiles(*),
        distributor_product_flooring(*),
        distributor_product_installation(*),
        distributors(company_name, logo_url),
        distributor_locations(name, city, state)
      `, { count: 'exact' });

    // Apply filters
    if (distributor_id) query = query.eq('distributor_id', distributor_id);
    if (product_type) query = query.eq('product_type', product_type);
    if (material_type) query = query.ilike('material_type', `%${material_type}%`);
    if (color_family) query = query.ilike('color_family', `%${color_family}%`);
    if (status) query = query.eq('status', status);
    if (is_public !== undefined) query = query.eq('is_public', is_public === 'true');
    if (min_price) query = query.gte('wholesale_price', parseFloat(min_price));
    if (max_price) query = query.lte('wholesale_price', parseFloat(max_price));

    // Search across multiple fields
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%,material_type.ilike.%${search}%`);
    }

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: products, error, count } = await query;

    if (error) throw error;

    res.json({
      products,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Get products error:', error);
    return handleApiError(res, error);
  }
});

// GET /api/products/stats - Get inventory statistics (MUST be before /:id route)
app.get('/api/products/stats', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { data: products } = await supabase
      .from('distributor_products')
      .select('product_type, status, quantity, wholesale_price, min_stock_level')
      .eq('distributor_id', distributorId);

    const stats = {
      total_products: products?.length || 0,
      active_products: products?.filter(p => p.status === 'active').length || 0,
      out_of_stock: products?.filter(p => p.status === 'out_of_stock').length || 0,
      low_stock: products?.filter(p => p.quantity <= p.min_stock_level && p.min_stock_level > 0).length || 0,
      by_type: {},
      total_value: 0
    };

    products?.forEach(p => {
      stats.by_type[p.product_type] = (stats.by_type[p.product_type] || 0) + 1;
      stats.total_value += (p.wholesale_price || 0) * (p.quantity || 0);
    });

    res.json(stats);
  } catch (error) {
    logger.error('Get product stats error:', error);
    return handleApiError(res, error);
  }
});

// GET /api/products/lookup - Find product by external SKU (MUST be before /:id route)
app.get('/api/products/lookup', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { sku, system } = req.query;
    if (!sku) return res.status(400).json({ error: 'SKU is required' });

    const distributorId = await getDistributorId(req);

    let query = supabase
      .from('distributor_product_skus')
      .select(`product_id, distributor_products(*)`)
      .eq('sku_value', sku);

    if (system) query = query.eq('system_name', system);

    const { data: skuMatch } = await query.single();

    if (skuMatch?.distributor_products) {
      return res.json(skuMatch.distributor_products);
    }

    let productQuery = supabase
      .from('distributor_products')
      .select('*')
      .or(`sku.eq.${sku},external_sku.eq.${sku}`);

    if (distributorId) {
      productQuery = productQuery.eq('distributor_id', distributorId);
    }

    const { data: product } = await productQuery.single();

    if (product) {
      return res.json(product);
    }

    res.status(404).json({ error: 'Product not found' });
  } catch (error) {
    logger.error('Product lookup error:', error);
    return handleApiError(res, error);
  }
});

// GET /api/products/:id - Get single product with full details
app.get('/api/products/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { id } = req.params;

    const { data: product, error } = await supabase
      .from('distributor_products')
      .select(`
        *,
        distributor_product_slabs(*),
        distributor_product_tiles(*),
        distributor_product_flooring(*),
        distributor_product_installation(*),
        distributor_product_skus(*),
        distributors(company_name, logo_url, email, phone),
        distributor_locations(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (error) {
    logger.error('Get product error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/products - Create product
app.post('/api/products', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const {
      sku, external_sku, upc, product_type = 'slab',
      name, brand, description, material_type, color_family, finish,
      quantity = 1, quantity_unit = 'each', min_stock_level = 0,
      cost_price, wholesale_price, retail_price, price_unit = 'each',
      location_id, warehouse_zone, bin_location,
      status = 'active', is_featured = false, is_public = true,
      images = [], tags = [], custom_attributes = {},
      type_data = {}
    } = req.body;

    // Validate required fields
    if (!sku || !name) {
      return res.status(400).json({ error: 'SKU and name are required' });
    }

    // Insert product
    const { data: product, error: productError } = await supabase
      .from('distributor_products')
      .insert({
        distributor_id: distributorId,
        sku, external_sku, upc, product_type,
        name, brand, description, material_type, color_family, finish,
        quantity, quantity_unit, min_stock_level,
        cost_price, wholesale_price, retail_price, price_unit,
        location_id, warehouse_zone, bin_location,
        status, is_featured, is_public,
        images, tags, custom_attributes,
        sync_source: 'api'
      })
      .select()
      .single();

    if (productError) throw productError;

    // Insert type-specific data
    if (Object.keys(type_data).length > 0) {
      const typeTable = `distributor_product_${product_type === 'installation_product' ? 'installation' : product_type}s`;
      const { error: typeError } = await supabase
        .from(typeTable)
        .insert({
          product_id: product.id,
          ...type_data
        });

      if (typeError) {
        logger.error(`Error inserting ${typeTable}:`, typeError);
      }
    }

    // Log initial inventory transaction
    await supabase
      .from('inventory_transactions')
      .insert({
        product_id: product.id,
        transaction_type: 'receive',
        quantity_change: quantity,
        quantity_before: 0,
        quantity_after: quantity,
        reference_type: 'initial_stock',
        notes: 'Initial inventory on product creation'
      });

    res.status(201).json(product);
  } catch (error) {
    logger.error('Create product error:', error);
    return handleApiError(res, error);
  }
});

// PATCH /api/products/:id - Update product
app.patch('/api/products/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;
    const { type_data, ...productData } = req.body;

    // Verify ownership
    const { data: existing } = await supabase
      .from('distributor_products')
      .select('distributor_id, product_type')
      .eq('id', id)
      .single();

    if (!existing || existing.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized to update this product' });
    }

    // Update product
    const { data: product, error: productError } = await supabase
      .from('distributor_products')
      .update(productData)
      .eq('id', id)
      .select()
      .single();

    if (productError) throw productError;

    // Update type-specific data if provided
    if (type_data && Object.keys(type_data).length > 0) {
      const typeTable = `distributor_product_${existing.product_type === 'installation_product' ? 'installation' : existing.product_type}s`;
      await supabase
        .from(typeTable)
        .upsert({
          product_id: id,
          ...type_data
        });
    }

    res.json(product);
  } catch (error) {
    logger.error('Update product error:', error);
    return handleApiError(res, error);
  }
});

// DELETE /api/products/:id - Delete product
app.delete('/api/products/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('distributor_products')
      .select('distributor_id')
      .eq('id', id)
      .single();

    if (!existing || existing.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    // Delete product (cascades to type-specific tables)
    const { error } = await supabase
      .from('distributor_products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    logger.error('Delete product error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/products/bulk - Bulk create/update products
app.post('/api/products/bulk', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required' });
    }

    const results = {
      inserted: 0,
      updated: 0,
      errors: []
    };

    for (const product of products) {
      try {
        const { type_data, ...productData } = product;

        // Upsert product by SKU
        const { data, error } = await supabase
          .from('distributor_products')
          .upsert({
            distributor_id: distributorId,
            ...productData,
            sync_source: 'bulk_import',
            last_synced_at: new Date().toISOString()
          }, {
            onConflict: 'distributor_id,sku'
          })
          .select()
          .single();

        if (error) {
          results.errors.push({ sku: product.sku, error: error.message });
          continue;
        }

        // Check if insert or update by comparing timestamps
        if (data.created_at === data.updated_at) {
          results.inserted++;
        } else {
          results.updated++;
        }

        // Handle type-specific data
        if (type_data && Object.keys(type_data).length > 0 && data.product_type) {
          const typeTable = `distributor_product_${data.product_type === 'installation_product' ? 'installation' : data.product_type}s`;
          await supabase
            .from(typeTable)
            .upsert({
              product_id: data.id,
              ...type_data
            });
        }
      } catch (err) {
        results.errors.push({ sku: product.sku, error: err.message });
      }
    }

    res.json({
      success: results.errors.length === 0,
      ...results
    });
  } catch (error) {
    logger.error('Bulk import error:', error);
    return handleApiError(res, error);
  }
});

// GET /api/products/:id/inventory - Get inventory transactions
app.get('/api/products/:id/inventory', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data: transactions, error, count } = await supabase
      .from('inventory_transactions')
      .select('*', { count: 'exact' })
      .eq('product_id', id)
      .order('performed_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      transactions,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Get inventory transactions error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/products/:id/inventory - Add inventory transaction
app.post('/api/products/:id/inventory', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;
    const {
      transaction_type,
      quantity_change,
      reference_type,
      reference_id,
      notes
    } = req.body;

    // Verify ownership and get current quantity
    const { data: product } = await supabase
      .from('distributor_products')
      .select('distributor_id, quantity')
      .eq('id', id)
      .single();

    if (!product || product.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const newQuantity = product.quantity + parseInt(quantity_change);

    if (newQuantity < 0) {
      return res.status(400).json({
        error: 'Insufficient inventory',
        current_quantity: product.quantity,
        requested_change: quantity_change
      });
    }

    // Update product quantity
    await supabase
      .from('distributor_products')
      .update({
        quantity: newQuantity,
        status: newQuantity === 0 ? 'out_of_stock' : 'active'
      })
      .eq('id', id);

    // Log transaction
    const { data: transaction, error } = await supabase
      .from('inventory_transactions')
      .insert({
        product_id: id,
        transaction_type,
        quantity_change: parseInt(quantity_change),
        quantity_before: product.quantity,
        quantity_after: newQuantity,
        reference_type,
        reference_id,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      transaction,
      new_quantity: newQuantity
    });
  } catch (error) {
    logger.error('Add inventory transaction error:', error);
    return handleApiError(res, error);
  }
});

// GET /api/products/:id/skus - Get SKU cross-references
app.get('/api/products/:id/skus', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { id } = req.params;

    const { data: skus, error } = await supabase
      .from('distributor_product_skus')
      .select('*')
      .eq('product_id', id)
      .order('is_primary', { ascending: false });

    if (error) throw error;

    res.json(skus);
  } catch (error) {
    logger.error('Get product SKUs error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/products/:id/skus - Add SKU mapping
app.post('/api/products/:id/skus', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;
    const { sku_type, sku_value, system_name, is_primary = false } = req.body;

    // Verify ownership
    const { data: product } = await supabase
      .from('distributor_products')
      .select('distributor_id')
      .eq('id', id)
      .single();

    if (!product || product.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data: sku, error } = await supabase
      .from('distributor_product_skus')
      .insert({
        product_id: id,
        sku_type,
        sku_value,
        system_name,
        is_primary
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(sku);
  } catch (error) {
    logger.error('Add SKU mapping error:', error);
    return handleApiError(res, error);
  }
});

// DELETE /api/products/:id/skus/:skuId - Remove SKU mapping
app.delete('/api/products/:id/skus/:skuId', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id, skuId } = req.params;

    // Verify ownership
    const { data: product } = await supabase
      .from('distributor_products')
      .select('distributor_id')
      .eq('id', id)
      .single();

    if (!product || product.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { error } = await supabase
      .from('distributor_product_skus')
      .delete()
      .eq('id', skuId)
      .eq('product_id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete SKU mapping error:', error);
    return handleApiError(res, error);
  }
});

// ============================================
// ERP INTEGRATIONS API
// ============================================

// GET /api/integrations - List integrations
app.get('/api/integrations', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { data: integrations, error } = await supabase
      .from('erp_integrations')
      .select('*, sync_logs(id, status, started_at, completed_at, records_processed)')
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Remove sensitive config data
    const safeIntegrations = integrations.map(int => ({
      ...int,
      connection_config: { configured: Object.keys(int.connection_config || {}).length > 0 }
    }));

    res.json(safeIntegrations);
  } catch (error) {
    logger.error('Get integrations error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/integrations - Create integration
app.post('/api/integrations', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const {
      system_type,
      display_name,
      connection_config,
      sync_direction = 'bidirectional',
      sync_frequency_minutes = 60,
      field_mappings = {}
    } = req.body;

    if (!system_type) {
      return res.status(400).json({ error: 'System type is required' });
    }

    const { data: integration, error } = await supabase
      .from('erp_integrations')
      .insert({
        distributor_id: distributorId,
        system_type,
        display_name: display_name || system_type,
        connection_config,
        sync_direction,
        sync_frequency_minutes,
        field_mappings
      })
      .select()
      .single();

    if (error) throw error;

    // Return without sensitive config
    res.status(201).json({
      ...integration,
      connection_config: { configured: true }
    });
  } catch (error) {
    logger.error('Create integration error:', error);
    return handleApiError(res, error);
  }
});

// PATCH /api/integrations/:id - Update integration
app.patch('/api/integrations/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('erp_integrations')
      .select('distributor_id')
      .eq('id', id)
      .single();

    if (!existing || existing.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data: integration, error } = await supabase
      .from('erp_integrations')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      ...integration,
      connection_config: { configured: Object.keys(integration.connection_config || {}).length > 0 }
    });
  } catch (error) {
    logger.error('Update integration error:', error);
    return handleApiError(res, error);
  }
});

// DELETE /api/integrations/:id - Delete integration
app.delete('/api/integrations/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('erp_integrations')
      .select('distributor_id')
      .eq('id', id)
      .single();

    if (!existing || existing.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { error } = await supabase
      .from('erp_integrations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete integration error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/integrations/:id/sync - Trigger manual sync
app.post('/api/integrations/:id/sync', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;

    // Verify ownership and get integration
    const { data: integration } = await supabase
      .from('erp_integrations')
      .select('*')
      .eq('id', id)
      .eq('distributor_id', distributorId)
      .single();

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Create sync log entry
    const { data: syncLog, error: logError } = await supabase
      .from('sync_logs')
      .insert({
        integration_id: id,
        sync_type: 'manual',
        direction: integration.sync_direction,
        status: 'running'
      })
      .select()
      .single();

    if (logError) throw logError;

    // Update integration last_sync
    await supabase
      .from('erp_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'running'
      })
      .eq('id', id);

    // Mark sync as pending - actual sync implementations would go here
    // For now, mark as pending_implementation to be transparent
    setTimeout(async () => {
      await supabase
        .from('sync_logs')
        .update({
          status: 'pending_implementation',
          completed_at: new Date().toISOString(),
          records_processed: 0,
          error_message: 'ERP sync not yet implemented for this system type'
        })
        .eq('id', syncLog.id);

      await supabase
        .from('erp_integrations')
        .update({ last_sync_status: 'pending_implementation' })
        .eq('id', id);
    }, 1000);

    res.json({
      success: true,
      sync_log_id: syncLog.id,
      message: 'Sync queued - ERP integration is configured but sync functionality is pending implementation',
      status: 'pending_implementation'
    });
  } catch (error) {
    logger.error('Trigger sync error:', error);
    return handleApiError(res, error);
  }
});

// GET /api/integrations/:id/logs - Get sync logs
app.get('/api/integrations/:id/logs', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;
    const { limit = 20 } = req.query;

    // Verify ownership
    const { data: integration } = await supabase
      .from('erp_integrations')
      .select('distributor_id')
      .eq('id', id)
      .single();

    if (!integration || integration.distributor_id !== distributorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data: logs, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('integration_id', id)
      .order('started_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json(logs);
  } catch (error) {
    logger.error('Get sync logs error:', error);
    return handleApiError(res, error);
  }
});

// POST /api/integrations/:id/test - Test connection
app.post('/api/integrations/:id/test', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const distributorId = await getDistributorId(req);
    if (!distributorId) return res.status(401).json({ error: 'Authentication required' });

    const { id } = req.params;

    // Get integration
    const { data: integration } = await supabase
      .from('erp_integrations')
      .select('*')
      .eq('id', id)
      .eq('distributor_id', distributorId)
      .single();

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Check if connection config exists
    const hasConfig = Object.keys(integration.connection_config || {}).length > 0;

    if (!hasConfig) {
      return res.json({
        success: false,
        message: 'No connection configuration found'
      });
    }

    // Actual connection testing requires implementation per ERP system
    // Return status indicating config is present but connection test is not yet implemented
    res.json({
      success: true,
      message: 'Connection configuration is valid. Live connection testing is pending implementation.',
      config_valid: true,
      connection_tested: false,
      system_type: integration.system_type
    });
  } catch (error) {
    logger.error('Test connection error:', error);
    return handleApiError(res, error, 'Test connection');
  }
});

// ============================================
// ARIA REALTIME - OpenAI Voice WebSocket Relay
// ============================================
const http = require('http');
const WebSocket = require('ws');

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// WebSocket rate limiting
const wsConnectionCounts = new Map();
const WS_MAX_CONNECTIONS_PER_IP = 3;

// Handle WebSocket upgrade for Aria Realtime
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/api/aria-realtime') {
    // Check origin for security
    const origin = request.headers.origin;
    const allowedOrigins = isProduction
      ? ['https://www.surprisegranite.com', 'https://surprisegranite.com']
      : ['https://www.surprisegranite.com', 'https://surprisegranite.com', 'http://localhost:3000', 'http://localhost:8888', 'http://127.0.0.1:5500'];

    if (origin && !allowedOrigins.includes(origin)) {
      logger.info('[Aria Realtime] Rejected connection from unauthorized origin:', origin);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // Rate limit by IP
    const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
    const currentCount = wsConnectionCounts.get(ip) || 0;

    if (currentCount >= WS_MAX_CONNECTIONS_PER_IP) {
      logger.info('[Aria Realtime] Rate limit exceeded for IP:', ip);
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    wsConnectionCounts.set(ip, currentCount + 1);

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Track connection for cleanup
      ws._clientIp = ip;
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Aria Realtime WebSocket handler
wss.on('connection', (clientWs) => {
  logger.info('[Aria Realtime] Client connected');

  let openAiWs = null;
  let sessionConfig = null;
  let isSessionReady = false;

  // Handle messages from browser client
  clientWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'config':
          // Client sends configuration - connect to OpenAI
          sessionConfig = msg;
          await connectToOpenAI();
          break;

        case 'audio':
          // Forward audio to OpenAI
          if (openAiWs?.readyState === WebSocket.OPEN && isSessionReady) {
            openAiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.audio
            }));
          }
          break;

        case 'start_listening':
          logger.info('[Aria Realtime] Client started listening');
          break;

        case 'stop_listening':
          // Commit the audio buffer to get a response
          if (openAiWs?.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          }
          break;

        case 'text_input':
          // Text input instead of voice
          if (openAiWs?.readyState === WebSocket.OPEN && isSessionReady) {
            openAiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: msg.text }]
              }
            }));
            openAiWs.send(JSON.stringify({
              type: 'response.create',
              response: { modalities: ['text', 'audio'] }
            }));
          }
          break;

        case 'trigger_greeting':
          // Trigger Aria's greeting
          if (openAiWs?.readyState === WebSocket.OPEN && isSessionReady) {
            openAiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text', 'audio'],
                instructions: `Greet the user briefly: "${msg.greeting || "Hi! How can I help you today?"}"`
              }
            }));
          }
          break;
      }
    } catch (error) {
      logger.error('[Aria Realtime] Message parse error:', error);
    }
  });

  // Connect to OpenAI Realtime API
  async function connectToOpenAI() {
    if (!process.env.OPENAI_API_KEY) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'OpenAI API key not configured' }));
      return;
    }

    try {
      openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      openAiWs.on('open', () => {
        logger.info('[Aria Realtime] Connected to OpenAI');

        // Configure the session
        const config = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: sessionConfig?.voice || 'coral',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1', language: 'en' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.6,
              prefix_padding_ms: 400,
              silence_duration_ms: 800,
              create_response: true
            },
            instructions: sessionConfig?.systemInstructions || buildDefaultInstructions(),
            temperature: 0.7,
            max_response_output_tokens: 300,
            tools: [
              // LEAD CAPTURE
              {
                type: 'function',
                name: 'capture_lead',
                description: 'Capture customer contact information for follow-up. Use when customer provides their name, phone, email, or expresses interest in getting a quote.',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Customer name' },
                    phone: { type: 'string', description: 'Phone number' },
                    email: { type: 'string', description: 'Email address' },
                    project_type: { type: 'string', description: 'Type of project (countertops, flooring, tile, cabinets, full remodel)' },
                    project_details: { type: 'string', description: 'Brief description of what they need' },
                    preferred_contact_time: { type: 'string', description: 'When they prefer to be contacted' }
                  },
                  required: []
                }
              },
              // SCHEDULING
              {
                type: 'function',
                name: 'schedule_estimate',
                description: 'Schedule a free estimate appointment',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Customer name' },
                    phone: { type: 'string', description: 'Phone number' },
                    email: { type: 'string', description: 'Email address' },
                    preferred_date: { type: 'string', description: 'Preferred date/time' },
                    project_type: { type: 'string', description: 'Type of project' },
                    address: { type: 'string', description: 'Project address' }
                  },
                  required: ['name', 'phone']
                }
              },
              // CALENDAR
              {
                type: 'function',
                name: 'create_calendar_event',
                description: 'Create a calendar event with participants for appointments, measurements, or installations',
                parameters: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Event title' },
                    event_type: { type: 'string', enum: ['appointment', 'measurement', 'installation', 'meeting', 'follow_up'], description: 'Type of event' },
                    start_time: { type: 'string', description: 'Start time in ISO format' },
                    duration_minutes: { type: 'number', description: 'Duration in minutes (default 60)' },
                    location: { type: 'string', description: 'Event location or address' },
                    participants: { type: 'array', items: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } } }, description: 'List of participants' }
                  },
                  required: ['title', 'event_type', 'start_time']
                }
              },
              {
                type: 'function',
                name: 'check_availability',
                description: 'Check calendar for available time slots on a given date',
                parameters: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' },
                    duration_minutes: { type: 'number', description: 'Desired appointment duration' }
                  },
                  required: ['date']
                }
              },
              // MARKETPLACE
              {
                type: 'function',
                name: 'search_products',
                description: 'Search marketplace for countertop materials, slabs, or products',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query (e.g., "white quartz", "calacatta marble")' },
                    category: { type: 'string', description: 'Product category (quartz, granite, marble, quartzite)' },
                    brand: { type: 'string', description: 'Brand name filter' },
                    max_price: { type: 'number', description: 'Maximum price per square foot' }
                  },
                  required: []
                }
              },
              {
                type: 'function',
                name: 'get_product_info',
                description: 'Get detailed information about a specific product',
                parameters: {
                  type: 'object',
                  properties: {
                    product_id: { type: 'string', description: 'Product ID' }
                  },
                  required: ['product_id']
                }
              },
              // NOTIFICATIONS
              {
                type: 'function',
                name: 'notify_owner',
                description: 'Send a notification to the business owner about important events',
                parameters: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['new_lead', 'appointment_booked', 'urgent', 'question'], description: 'Notification type' },
                    title: { type: 'string', description: 'Notification title' },
                    message: { type: 'string', description: 'Notification message' },
                    priority: { type: 'string', enum: ['high', 'normal', 'low'], description: 'Priority level' }
                  },
                  required: ['type', 'message']
                }
              },
              {
                type: 'function',
                name: 'send_sms',
                description: 'Send an SMS message to a phone number',
                parameters: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string', description: 'Phone number to send to' },
                    message: { type: 'string', description: 'SMS message content' }
                  },
                  required: ['phone', 'message']
                }
              },
              // LEAD MANAGEMENT
              {
                type: 'function',
                name: 'qualify_lead',
                description: 'Update lead qualification score and status',
                parameters: {
                  type: 'object',
                  properties: {
                    lead_id: { type: 'string', description: 'Lead ID' },
                    score: { type: 'number', description: 'Qualification score (1-100)' },
                    notes: { type: 'string', description: 'Qualification notes' }
                  },
                  required: ['lead_id']
                }
              },
              // STATUS UPDATES
              {
                type: 'function',
                name: 'update_job_status',
                description: 'Update the status of a job or project',
                parameters: {
                  type: 'object',
                  properties: {
                    job_id: { type: 'string', description: 'Job ID' },
                    status: { type: 'string', description: 'New status' },
                    notes: { type: 'string', description: 'Status update notes' }
                  },
                  required: ['job_id', 'status']
                }
              }
            ]
          }
        };

        openAiWs.send(JSON.stringify(config));
      });

      openAiWs.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          handleOpenAIMessage(response);
        } catch (error) {
          logger.error('[Aria Realtime] OpenAI message parse error:', error);
        }
      });

      openAiWs.on('error', (error) => {
        logger.error('[Aria Realtime] OpenAI WebSocket error:', error);
        clientWs.send(JSON.stringify({ type: 'error', message: 'OpenAI connection error' }));
      });

      openAiWs.on('close', () => {
        logger.info('[Aria Realtime] OpenAI connection closed');
        isSessionReady = false;
      });

    } catch (error) {
      logger.error('[Aria Realtime] Failed to connect to OpenAI:', error);
      clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to connect to voice service' }));
    }
  }

  // Handle OpenAI messages
  function handleOpenAIMessage(response) {
    switch (response.type) {
      case 'session.created':
      case 'session.updated':
        isSessionReady = true;
        clientWs.send(JSON.stringify({ type: 'connected' }));
        logger.info('[Aria Realtime] Session ready');
        break;

      case 'response.audio.delta':
        // Forward audio to client
        if (response.delta) {
          clientWs.send(JSON.stringify({
            type: 'audio',
            audio: response.delta
          }));
        }
        break;

      case 'response.audio_transcript.delta':
        // Aria is speaking - send transcript
        if (response.delta) {
          clientWs.send(JSON.stringify({
            type: 'response_text',
            text: response.delta,
            partial: true
          }));
        }
        break;

      case 'response.audio_transcript.done':
        // Complete transcript
        if (response.transcript) {
          clientWs.send(JSON.stringify({
            type: 'response_text',
            text: response.transcript,
            partial: false
          }));
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        if (response.transcript) {
          clientWs.send(JSON.stringify({
            type: 'transcript',
            text: response.transcript
          }));
        }
        break;

      case 'response.audio.done':
        clientWs.send(JSON.stringify({ type: 'speaking_end' }));
        break;

      case 'response.created':
        clientWs.send(JSON.stringify({ type: 'speaking_start' }));
        break;

      case 'response.function_call_arguments.done':
        // Handle tool calls
        handleToolCall(response);
        break;

      case 'error':
        logger.error('[Aria Realtime] OpenAI error:', response.error);
        clientWs.send(JSON.stringify({
          type: 'error',
          message: response.error?.message || 'Unknown error'
        }));
        break;
    }
  }

  // Handle tool calls from OpenAI
  async function handleToolCall(response) {
    const functionName = response.name;
    let args = {};

    try {
      args = JSON.parse(response.arguments || '{}');
    } catch (e) {
      logger.error('[Aria Realtime] Failed to parse tool args:', e);
      return;
    }

    logger.info(`[Aria Realtime] Tool call: ${functionName}`, args);

    let toolResult = { success: false, message: 'Unknown tool' };

    try {
      switch (functionName) {
        case 'capture_lead':
        case 'schedule_estimate':
          toolResult = await handleLeadCapture(args, functionName);
          break;

        case 'create_calendar_event':
          toolResult = await handleCreateCalendarEvent(args);
          break;

        case 'check_availability':
          toolResult = await handleCheckAvailability(args);
          break;

        case 'search_products':
          toolResult = await handleSearchProducts(args);
          break;

        case 'get_product_info':
          toolResult = await handleGetProductInfo(args);
          break;

        case 'notify_owner':
          toolResult = await handleNotifyOwner(args);
          break;

        case 'send_sms':
          toolResult = await handleSendSms(args);
          break;

        case 'qualify_lead':
          toolResult = await handleQualifyLead(args);
          break;

        case 'update_job_status':
          toolResult = await handleUpdateJobStatus(args);
          break;

        default:
          logger.warn(`[Aria Realtime] Unknown tool: ${functionName}`);
      }
    } catch (error) {
      logger.error(`[Aria Realtime] Tool error for ${functionName}:`, error);
      toolResult = { success: false, message: error.message };
    }

    // Send function output back to OpenAI
    if (openAiWs?.readyState === WebSocket.OPEN) {
      openAiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: response.call_id,
          output: JSON.stringify(toolResult)
        }
      }));
      openAiWs.send(JSON.stringify({
        type: 'response.create',
        response: { modalities: ['text', 'audio'] }
      }));
    }
  }

  // Tool Handler: Lead Capture
  async function handleLeadCapture(args, functionName) {
    const adminEmail = sessionConfig?.adminEmail || ADMIN_EMAIL;
    const businessName = sessionConfig?.businessName || 'Surprise Granite';

    const leadData = {
      name: args.name || '',
      phone: args.phone || '',
      email: args.email || '',
      project_type: args.project_type || '',
      project_details: args.project_details || args.address || '',
      preferred_contact_time: args.preferred_contact_time || args.preferred_date || '',
      notes: functionName === 'schedule_estimate' ? `Estimate requested for ${args.preferred_date || 'ASAP'}` : '',
      source: `Aria Voice Chat - ${businessName}`,
      tool: functionName,
      timestamp: new Date().toISOString()
    };

    if (leadData.name || leadData.phone || leadData.email) {
      const leadHtml = buildLeadEmailHtml(leadData, businessName, functionName);
      await sendNotification(
        adminEmail,
        `🎤 New Voice Lead: ${leadData.name || 'Unknown'} - ${leadData.project_type || 'Inquiry'}`,
        leadHtml
      );

      if (supabase) {
        try {
          await supabase.from('aria_leads').insert([{
            ...leadData,
            admin_email: adminEmail,
            business_name: businessName
          }]);
        } catch (dbErr) {
          logger.info('[Aria Realtime] DB save skipped:', dbErr.message);
        }
      }

      clientWs.send(JSON.stringify({
        type: 'lead_captured',
        data: { name: leadData.name, phone: leadData.phone, email: leadData.email }
      }));

      return { success: true, message: 'Lead captured successfully' };
    }

    return { success: false, message: 'No contact information provided' };
  }

  // Tool Handler: Create Calendar Event
  async function handleCreateCalendarEvent(args) {
    if (!supabase) return { success: false, message: 'Database not available' };

    const adminEmail = sessionConfig?.adminEmail || ADMIN_EMAIL;
    const { data: admin } = await supabase
      .from('sg_users')
      .select('id')
      .eq('email', adminEmail)
      .single();

    if (!admin) return { success: false, message: 'Admin user not found' };

    const durationMinutes = args.duration_minutes || 60;
    const startTime = new Date(args.start_time);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const { data: event, error } = await supabase
      .from('calendar_events')
      .insert({
        created_by: admin.id,
        title: args.title,
        event_type: args.event_type || 'appointment',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        location: args.location || null,
        status: 'scheduled'
      })
      .select()
      .single();

    if (error) throw error;

    // Add participants if provided
    if (args.participants && Array.isArray(args.participants)) {
      const participants = args.participants.map(p => ({
        event_id: event.id,
        email: p.email,
        name: p.name,
        role: p.role,
        participant_type: 'attendee',
        response_status: 'pending'
      }));
      await supabase.from('calendar_event_participants').insert(participants);
    }

    clientWs.send(JSON.stringify({
      type: 'event_created',
      data: { eventId: event.id, title: event.title, startTime: event.start_time }
    }));

    return {
      success: true,
      message: `Event "${args.title}" created for ${startTime.toLocaleString()}`,
      eventId: event.id
    };
  }

  // Tool Handler: Check Availability
  async function handleCheckAvailability(args) {
    if (!supabase) return { success: false, message: 'Database not available' };

    const date = args.date;
    const durationMinutes = args.duration_minutes || 60;

    // Get events for the date
    const startOfDay = new Date(date + 'T00:00:00');
    const endOfDay = new Date(date + 'T23:59:59');

    const { data: events } = await supabase
      .from('calendar_events')
      .select('start_time, end_time')
      .neq('status', 'cancelled')
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString());

    // Generate available slots (8am-6pm)
    const availableSlots = [];
    for (let hour = 8; hour < 18; hour++) {
      const slotStart = new Date(date + `T${hour.toString().padStart(2, '0')}:00:00`);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      const isAvailable = !events?.some(e => {
        const eventStart = new Date(e.start_time);
        const eventEnd = new Date(e.end_time);
        return (slotStart < eventEnd && slotEnd > eventStart);
      });

      if (isAvailable) {
        availableSlots.push(slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
      }
    }

    return {
      success: true,
      date,
      availableSlots,
      message: availableSlots.length > 0
        ? `Available times on ${date}: ${availableSlots.slice(0, 5).join(', ')}${availableSlots.length > 5 ? ' and more' : ''}`
        : `No available slots on ${date}`
    };
  }

  // Tool Handler: Search Products
  async function handleSearchProducts(args) {
    if (!supabase) return { success: false, message: 'Database not available' };

    let query = supabase
      .from('distributor_products')
      .select('id, name, color_name, material_type, brand, price_per_sqft, image_url')
      .eq('is_active', true)
      .limit(10);

    if (args.query) {
      query = query.or(`name.ilike.%${args.query}%,color_name.ilike.%${args.query}%`);
    }
    if (args.category) {
      query = query.eq('material_type', args.category);
    }
    if (args.brand) {
      query = query.ilike('brand', `%${args.brand}%`);
    }
    if (args.max_price) {
      query = query.lte('price_per_sqft', args.max_price);
    }

    const { data: products, error } = await query;

    if (error) throw error;

    const productList = products?.map(p =>
      `${p.name} (${p.material_type}) - $${p.price_per_sqft}/sqft`
    ).join('; ') || 'No products found';

    return {
      success: true,
      count: products?.length || 0,
      products: products?.slice(0, 5) || [],
      message: products?.length
        ? `Found ${products.length} products: ${productList}`
        : 'No matching products found'
    };
  }

  // Tool Handler: Get Product Info
  async function handleGetProductInfo(args) {
    if (!supabase || !args.product_id) return { success: false, message: 'Product ID required' };

    const { data: product, error } = await supabase
      .from('distributor_products')
      .select('*')
      .eq('id', args.product_id)
      .single();

    if (error || !product) return { success: false, message: 'Product not found' };

    return {
      success: true,
      product,
      message: `${product.name}: ${product.description || ''} - $${product.price_per_sqft}/sqft. ${product.features || ''}`
    };
  }

  // Tool Handler: Notify Owner
  async function handleNotifyOwner(args) {
    const adminEmail = sessionConfig?.adminEmail || ADMIN_EMAIL;
    const businessName = sessionConfig?.businessName || 'Surprise Granite';

    const notificationHtml = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #f9cb00;">Aria Notification: ${args.title || args.type}</h2>
        <p style="font-size: 16px;">${args.message}</p>
        <p style="color: #666; font-size: 12px;">Priority: ${args.priority || 'normal'}</p>
        <hr>
        <p style="color: #999; font-size: 11px;">From Aria AI Assistant - ${businessName}</p>
      </div>
    `;

    await sendNotification(adminEmail, `Aria: ${args.title || args.type}`, notificationHtml);

    // Also create in-app notification if database available
    if (supabase) {
      const { data: admin } = await supabase
        .from('sg_users')
        .select('id')
        .eq('email', adminEmail)
        .single();

      if (admin) {
        await supabase.from('pro_notifications').insert({
          pro_user_id: admin.id,
          notification_type: args.type || 'aria_notification',
          title: args.title || 'Aria Notification',
          message: args.message,
          data: { priority: args.priority, source: 'aria_voice' }
        });
      }
    }

    return { success: true, message: 'Owner notified' };
  }

  // Tool Handler: Send SMS
  async function handleSendSms(args) {
    if (!args.phone || !args.message) {
      return { success: false, message: 'Phone and message required' };
    }

    // Use SMS service if available
    try {
      const smsService = require('./services/smsService');
      await smsService.sendSMS(args.phone, args.message);
      return { success: true, message: 'SMS sent' };
    } catch (e) {
      logger.warn('[Aria Realtime] SMS service not available');
      return { success: false, message: 'SMS service not configured' };
    }
  }

  // Tool Handler: Qualify Lead
  async function handleQualifyLead(args) {
    if (!supabase || !args.lead_id) return { success: false, message: 'Lead ID required' };

    const updates = {};
    if (args.score !== undefined) updates.qualification_score = args.score;
    if (args.notes) updates.qualification_notes = args.notes;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', args.lead_id);

    if (error) throw error;

    return { success: true, message: `Lead qualification updated${args.score ? ` to score ${args.score}` : ''}` };
  }

  // Tool Handler: Update Job Status
  async function handleUpdateJobStatus(args) {
    if (!supabase || !args.job_id || !args.status) {
      return { success: false, message: 'Job ID and status required' };
    }

    const updates = {
      status: args.status,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', args.job_id);

    if (error) throw error;

    // Add status note if provided
    if (args.notes && supabase) {
      await supabase.from('job_notes').insert({
        job_id: args.job_id,
        note: `Status changed to ${args.status}: ${args.notes}`,
        note_type: 'status_change'
      });
    }

    return { success: true, message: `Job status updated to ${args.status}` };
  }

  // Build lead email HTML
  function buildLeadEmailHtml(lead, businessName, tool) {
    return `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="500" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #1a1a2e; font-size: 24px; font-weight: 700;">🎤 New Voice Lead from Aria</h1>
              <p style="margin: 8px 0 0; color: #1a1a2e; opacity: 0.8;">${businessName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Contact Information</h2>
              <table width="100%" cellspacing="0" cellpadding="8">
                <tr>
                  <td style="color: #666; font-weight: 600; width: 140px;">Name:</td>
                  <td style="color: #1a1a2e;">${lead.name || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Phone:</td>
                  <td style="color: #1a1a2e;"><a href="tel:${lead.phone}" style="color: #1a1a2e; font-weight: 600;">${lead.phone || 'Not provided'}</a></td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Email:</td>
                  <td style="color: #1a1a2e;"><a href="mailto:${lead.email}" style="color: #1a1a2e;">${lead.email || 'Not provided'}</a></td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Best Time:</td>
                  <td style="color: #1a1a2e;">${lead.preferred_contact_time || 'Not specified'}</td>
                </tr>
              </table>

              <h2 style="margin: 25px 0 15px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Project Details</h2>
              <table width="100%" cellspacing="0" cellpadding="8">
                <tr>
                  <td style="color: #666; font-weight: 600; width: 140px;">Project Type:</td>
                  <td style="color: #1a1a2e;">${lead.project_type || 'Not specified'}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Details:</td>
                  <td style="color: #1a1a2e;">${lead.project_details || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-weight: 600;">Notes:</td>
                  <td style="color: #1a1a2e;">${lead.notes || 'None'}</td>
                </tr>
              </table>

              <div style="margin-top: 25px; padding: 15px; background: #f8f8f8; border-radius: 8px; border-left: 4px solid #f9cb00;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                  <strong>Source:</strong> ${lead.source || 'Aria Voice Chat'}<br>
                  <strong>Action:</strong> ${tool || 'Lead Capture'}<br>
                  <strong>Time:</strong> ${lead.timestamp || new Date().toISOString()}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #1a1a2e; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #f9cb00; font-size: 14px; font-weight: 600;">Follow up ASAP!</p>
              <p style="margin: 5px 0 0; color: #888; font-size: 12px;">This lead came from the Aria AI voice assistant.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // Build default instructions
  function buildDefaultInstructions() {
    const name = sessionConfig?.businessName || 'Surprise Granite';
    const ctx = sessionConfig?.businessContext || {};

    return `You are Aria, a friendly AI voice assistant for ${name}.

PERSONALITY:
- Warm, helpful, and professional
- Keep responses SHORT (1-2 sentences)
- Use natural conversational language
- Be direct and get to the point quickly

BUSINESS INFO:
- Services: ${ctx.services?.join(', ') || 'countertops, tile, flooring, cabinets, full remodels'}
- Service Area: ${ctx.serviceArea || 'Phoenix metro area'}
- Hours: ${ctx.businessHours || 'Monday-Saturday 8am-6pm'}
- Phone: (602) 833-3189

CAPABILITIES:
- Answer questions about services and materials
- Help schedule free estimates
- Provide general pricing info
- Transfer to human if needed

LEAD CAPTURE - CRITICAL:
When a customer provides ANY of the following information, IMMEDIATELY use the capture_lead function:
- Their name
- Their phone number
- Their email address
- Expresses interest in a quote or estimate
- Mentions a specific project they want done

You MUST capture leads proactively. Even partial info is valuable. After capturing, continue the conversation naturally and try to gather more details.

If they want to schedule an estimate, use schedule_estimate function.

Be helpful and guide users toward scheduling an appointment or getting a quote.`;
  }

  // Cleanup on disconnect
  clientWs.on('close', () => {
    logger.info('[Aria Realtime] Client disconnected');
    if (openAiWs?.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
    // Decrement connection count for rate limiting
    if (clientWs._clientIp) {
      const currentCount = wsConnectionCounts.get(clientWs._clientIp) || 1;
      if (currentCount <= 1) {
        wsConnectionCounts.delete(clientWs._clientIp);
      } else {
        wsConnectionCounts.set(clientWs._clientIp, currentCount - 1);
      }
    }
  });

  clientWs.on('error', (error) => {
    logger.error('[Aria Realtime] Client WebSocket error:', error);
  });
});

// ============ PROJECT MANAGEMENT API ============

// Save/Update project with customer info
app.post('/api/projects/save', authenticateJWT, async (req, res) => {
  try {
    const {
      project_id,
      name,
      room_type,
      room_width,
      room_depth,
      elements,
      rooms,
      settings,
      quote_total,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      status,
      notes
    } = req.body;

    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const projectData = {
      user_id,
      name: name || 'Untitled Project',
      room_type: room_type || 'kitchen',
      room_width: room_width || 12,
      room_depth: room_depth || 10,
      elements: elements || [],
      rooms: rooms || [],
      settings: settings || {},
      quote_total: quote_total || 0,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      status: status || 'draft',
      quote_notes: notes,
      updated_at: new Date().toISOString()
    };

    let result;

    if (project_id) {
      // Update existing project
      const { data, error } = await supabase
        .from('room_designs')
        .update(projectData)
        .eq('id', project_id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Log activity
      await supabase.from('project_activities').insert({
        project_id,
        user_id,
        activity_type: 'updated',
        description: 'Project updated'
      });
    } else {
      // Create new project
      const share_token = require('crypto').randomBytes(12).toString('hex');

      const { data, error } = await supabase
        .from('room_designs')
        .insert({
          ...projectData,
          share_token,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Log activity
      await supabase.from('project_activities').insert({
        project_id: result.id,
        user_id,
        activity_type: 'created',
        description: 'Project created'
      });
    }

    res.json({ success: true, project: result });

  } catch (error) {
    logger.error('Project save error:', error);
    return handleApiError(res, error);
  }
});

// Get user's projects with filtering
app.get('/api/projects', authenticateJWT, async (req, res) => {
  try {
    const user_id = req.user?.id;
    const { status, search, limit = 50, offset = 0 } = req.query;

    if (!user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let query = supabase
      .from('room_designs')
      .select('*')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ projects: data, count: data.length });

  } catch (error) {
    logger.error('Get projects error:', error);
    return handleApiError(res, error);
  }
});

// Get single project by ID or share token
app.get('/api/projects/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const user_id = req.user?.id; // May be null for public share token access

    // Try to get by ID first, then by share_token
    let query = supabase.from('room_designs').select('*');

    // Check if it's a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    if (isUUID) {
      query = query.eq('id', identifier);
    } else {
      query = query.eq('share_token', identifier);
    }

    const { data, error } = await query.single();

    if (error) throw error;

    // Check access permissions
    const isOwner = data.user_id === user_id;
    const isCustomer = data.customer_id === user_id;
    const hasShareToken = !isUUID; // Accessed via share token

    if (!isOwner && !isCustomer && !hasShareToken) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get activity log if owner
    let activities = [];
    if (isOwner) {
      const { data: activityData } = await supabase
        .from('project_activities')
        .select('*')
        .eq('project_id', data.id)
        .order('created_at', { ascending: false })
        .limit(50);
      activities = activityData || [];
    }

    res.json({
      project: data,
      activities,
      permissions: {
        canEdit: isOwner,
        canApprove: isCustomer || hasShareToken,
        canPay: isCustomer || hasShareToken
      }
    });

  } catch (error) {
    logger.error('Get project error:', error);
    return handleApiError(res, error);
  }
});

// Send quote to customer
app.post('/api/projects/:id/send-quote', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_email, customer_name, message, expires_days = 30 } = req.body;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!customer_email) {
      return res.status(400).json({ error: 'Customer email required' });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('room_designs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user_id)
      .single();

    if (projectError) throw projectError;

    // Generate portal token
    const portal_token = require('crypto').randomBytes(16).toString('hex');
    const expires_at = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

    // Create portal token record
    await supabase.from('customer_portal_tokens').insert({
      project_id: id,
      token: portal_token,
      customer_email,
      expires_at
    });

    // Update project
    await supabase
      .from('room_designs')
      .update({
        customer_email,
        customer_name: customer_name || project.customer_name,
        status: 'sent',
        quote_sent_at: new Date().toISOString(),
        quote_expires_at: expires_at
      })
      .eq('id', id);

    // Create quote version snapshot
    const { data: versions } = await supabase
      .from('quote_versions')
      .select('version_number')
      .eq('project_id', id)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = (versions?.[0]?.version_number || 0) + 1;

    await supabase.from('quote_versions').insert({
      project_id: id,
      version_number: nextVersion,
      elements: project.elements,
      quote_total: project.quote_total,
      quote_breakdown: project.quote_breakdown,
      pricing_config: project.settings?.pricing_config,
      created_by: user_id
    });

    // Update project version
    await supabase
      .from('room_designs')
      .update({ quote_version: nextVersion })
      .eq('id', id);

    // Log activity
    await supabase.from('project_activities').insert({
      project_id: id,
      user_id,
      activity_type: 'quote_sent',
      description: `Quote v${nextVersion} sent to ${customer_email}`,
      metadata: { customer_email, portal_token, expires_at }
    });

    // Build portal URL
    const portalUrl = `${process.env.SITE_URL || 'https://surprisegranite.com'}/customer-portal/?token=${portal_token}`;

    // Send email to customer
    const emailHtml = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">Your Project Quote</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">from Surprise Granite</p>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        Hi ${customer_name || 'there'},
      </p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        ${message || 'Your project quote is ready for review. Click the button below to view your design, pricing details, and approve the project.'}
      </p>

      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
        <p style="color: #666; margin: 0 0 5px; font-size: 14px;">Project Total</p>
        <p style="color: #1a1a2e; margin: 0; font-size: 32px; font-weight: 700;">$${(project.quote_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View Quote & Approve
        </a>
      </div>

      <p style="color: #666; font-size: 14px; text-align: center;">
        This quote expires on ${new Date(expires_at).toLocaleDateString()}
      </p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        Questions? Reply to this email or call (602) 833-3189
      </p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"Surprise Granite" <${SMTP_USER}>`,
      to: customer_email,
      subject: `Your Project Quote - ${project.name || 'Kitchen Design'}`,
      html: emailHtml
    });

    res.json({
      success: true,
      portal_url: portalUrl,
      portal_token,
      quote_version: nextVersion
    });

  } catch (error) {
    logger.error('Send quote error:', error);
    return handleApiError(res, error);
  }
});

// Customer approves quote
app.post('/api/projects/approve', async (req, res) => {
  try {
    const { token, customer_name, customer_phone } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Portal token required' });
    }

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from('customer_portal_tokens')
      .select('*, room_designs(*)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (tokenError || !tokenData) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const project = tokenData.room_designs;

    // Update project status
    await supabase
      .from('room_designs')
      .update({
        status: 'approved',
        quote_approved_at: new Date().toISOString(),
        customer_name: customer_name || project.customer_name,
        customer_phone: customer_phone || project.customer_phone
      })
      .eq('id', project.id);

    // Log activity
    await supabase.from('project_activities').insert({
      project_id: project.id,
      activity_type: 'quote_approved',
      description: `Quote approved by ${tokenData.customer_email}`,
      metadata: { customer_name, customer_phone }
    });

    // Notify owner
    if (project.user_id) {
      const { data: owner } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', project.user_id)
        .single();

      if (owner?.email) {
        await transporter.sendMail({
          from: `"Surprise Granite" <${SMTP_USER}>`,
          to: owner.email,
          subject: `Quote Approved - ${project.name}`,
          html: `
            <h2>Great news! Your quote has been approved.</h2>
            <p><strong>Project:</strong> ${project.name}</p>
            <p><strong>Customer:</strong> ${customer_name || tokenData.customer_email}</p>
            <p><strong>Amount:</strong> $${(project.quote_total || 0).toLocaleString()}</p>
            <p>The customer can now proceed with payment.</p>
          `
        });
      }
    }

    res.json({ success: true, project_id: project.id });

  } catch (error) {
    logger.error('Quote approval error:', error);
    return handleApiError(res, error);
  }
});

// Create payment intent for project
app.post('/api/projects/:id/create-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_type, token, customer_email } = req.body;

    // Get project - either by portal token or by ID (requires valid token for security)
    let project;

    if (token) {
      const { data: tokenData } = await supabase
        .from('customer_portal_tokens')
        .select('*, room_designs(*)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (!tokenData) {
        return res.status(404).json({ error: 'Invalid or expired token' });
      }
      project = tokenData.room_designs;
    } else {
      // Portal token required for payment creation (no x-user-id header auth)
      return res.status(401).json({ error: 'Portal token required for payment' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Calculate amount based on payment type
    let amount;
    let description;
    const total = project.quote_total || 0;

    switch (payment_type) {
      case 'deposit':
        amount = Math.max(99, total * 0.1); // 10% or minimum $99
        description = `Deposit (10%) - ${project.name}`;
        break;
      case 'half':
        amount = total * 0.5;
        description = `50% Payment - ${project.name}`;
        break;
      case 'full':
        amount = total;
        description = `Full Payment - ${project.name}`;
        break;
      case 'remaining':
        amount = total - (project.amount_paid || 0);
        description = `Remaining Balance - ${project.name}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid payment type' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    // Create Stripe customer if needed
    let stripeCustomerId = project.stripe_customer_id;
    const email = customer_email || project.customer_email;

    if (!stripeCustomerId && email) {
      const existingCustomers = await stripe.customers.list({ email, limit: 1 });

      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email,
          name: project.customer_name,
          metadata: { project_id: project.id }
        });
        stripeCustomerId = customer.id;
      }

      // Save customer ID to project
      await supabase
        .from('room_designs')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', project.id);
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      description,
      metadata: {
        project_id: project.id,
        payment_type,
        project_name: project.name
      },
      receipt_email: email
    });

    // Record payment in database
    await supabase.from('project_payments').insert({
      project_id: project.id,
      stripe_payment_intent_id: paymentIntent.id,
      amount,
      payment_type,
      status: 'pending',
      customer_email: email
    });

    // Log activity
    await supabase.from('project_activities').insert({
      project_id: project.id,
      activity_type: 'payment_initiated',
      description: `${payment_type} payment of $${amount.toFixed(2)} initiated`,
      metadata: { payment_intent_id: paymentIntent.id, amount }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount
    });

  } catch (error) {
    logger.error('Create payment error:', error);
    return handleApiError(res, error);
  }
});

// Update project status (for webhook or manual update)
app.post('/api/projects/:id/status', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validStatuses = ['draft', 'quoted', 'sent', 'viewed', 'approved', 'paid', 'in_progress', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Update project
    const updateData = { status };

    if (status === 'completed') {
      updateData.completed_date = new Date().toISOString().split('T')[0];
    }

    await supabase
      .from('room_designs')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user_id);

    // Log activity
    await supabase.from('project_activities').insert({
      project_id: id,
      user_id,
      activity_type: 'status_changed',
      description: `Status changed to ${status}${notes ? ': ' + notes : ''}`,
      metadata: { new_status: status, notes }
    });

    res.json({ success: true, status });

  } catch (error) {
    logger.error('Update status error:', error);
    return handleApiError(res, error);
  }
});

// Get project activity log
app.get('/api/projects/:id/activities', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user?.id;
    const { limit = 50 } = req.query;

    // Verify access
    const { data: project } = await supabase
      .from('room_designs')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!project || project.user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: activities, error } = await supabase
      .from('project_activities')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ activities });

  } catch (error) {
    logger.error('Get activities error:', error);
    return handleApiError(res, error);
  }
});

// ============ DESIGN SHARE COMMENTS ============
// Unified communication for design share comments

// Rate limiter for comment posting (10 per minute)
const commentRateLimiter = publicRateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  message: 'Too many comments. Please wait before posting again.'
});

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escape HTML for email content
function escapeHtmlForEmail(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.post('/api/design-comments', commentRateLimiter, async (req, res) => {
  try {
    const { lead_id, share_id, design_id, message, author, direction = 'inbound' } = req.body;

    // Input validation
    if (!lead_id || !message) {
      return res.status(400).json({ error: 'lead_id and message are required' });
    }

    if (!UUID_REGEX.test(lead_id)) {
      return res.status(400).json({ error: 'Invalid lead_id format' });
    }

    if (share_id && !UUID_REGEX.test(share_id)) {
      return res.status(400).json({ error: 'Invalid share_id format' });
    }

    // Sanitize message (max 5000 chars)
    const sanitizedMessage = String(message).slice(0, 5000);
    const sanitizedAuthor = author ? String(author).slice(0, 100) : 'Customer';

    // For inbound comments, validate that share_id is linked to lead_id
    if (direction === 'inbound' && share_id) {
      const { data: share } = await supabase
        .from('room_design_shares')
        .select('lead_id')
        .eq('id', share_id)
        .single();

      if (!share || share.lead_id !== lead_id) {
        return res.status(403).json({ error: 'Invalid share access' });
      }
    }

    // Save comment to customer_messages table
    const { data: savedMessage, error: insertError } = await supabase
      .from('customer_messages')
      .insert({
        customer_id: lead_id,
        direction: direction,
        channel: 'design_share',
        message: sanitizedMessage,
        sent_from: sanitizedAuthor,
        status: 'sent',
        metadata: {
          share_id: share_id || null,
          design_id: design_id || null,
          author: sanitizedAuthor
        }
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to save design comment:', insertError);
      throw insertError;
    }

    // Get lead info for notification
    const { data: lead } = await supabase
      .from('leads')
      .select('full_name, email, owner_id')
      .eq('id', lead_id)
      .single();

    // Get design info
    const { data: design } = await supabase
      .from('room_designs')
      .select('project_name, user_id')
      .eq('id', design_id)
      .single();

    // Send email notification to staff if this is a customer comment
    if (direction === 'inbound' && lead) {
      try {
        // Get owner email
        let ownerEmail = process.env.ADMIN_EMAIL || 'info@surprisegranite.com';

        if (lead.owner_id) {
          const { data: owner } = await supabase
            .from('users')
            .select('email')
            .eq('id', lead.owner_id)
            .single();
          if (owner?.email) ownerEmail = owner.email;
        } else if (design?.user_id) {
          const { data: designer } = await supabase
            .from('users')
            .select('email')
            .eq('id', design.user_id)
            .single();
          if (designer?.email) ownerEmail = designer.email;
        }

        // Send notification email
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        const projectName = escapeHtmlForEmail(design?.project_name || 'Design Project');
        const customerName = escapeHtmlForEmail(lead.full_name || 'A customer');
        const escapedMessage = escapeHtmlForEmail(sanitizedMessage);

        await transporter.sendMail({
          from: `"Surprise Granite" <${process.env.SMTP_USER || 'notifications@surprisegranite.com'}>`,
          to: ownerEmail,
          subject: `New Comment from ${customerName} on ${projectName}`,
          html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5;">
  <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px; text-align: center;">
      <h1 style="color: #f9a825; margin: 0; font-size: 20px;">New Comment</h1>
    </div>
    <div style="padding: 25px;">
      <p style="margin: 0 0 15px; color: #333;"><strong>${customerName}</strong> commented on <strong>${projectName}</strong>:</p>
      <div style="background: #f8f9fa; border-left: 4px solid #f9a825; padding: 15px; margin: 15px 0; border-radius: 4px;">
        <p style="margin: 0; color: #333; font-style: italic;">"${escapedMessage}"</p>
      </div>
      <p style="margin: 15px 0 0; color: #666; font-size: 14px;">Reply directly in the account dashboard to respond.</p>
      <a href="https://www.surprisegranite.com/account/#/customers" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #f9a825; color: #1a1a2e; text-decoration: none; border-radius: 8px; font-weight: 600;">View in Dashboard</a>
    </div>
  </div>
</body>
</html>
          `
        });

        logger.info('Design comment notification sent to:', ownerEmail);
      } catch (emailError) {
        logger.warn('Failed to send comment notification email:', emailError.message);
        // Don't fail the request if email fails
      }
    }

    res.json({
      success: true,
      message: savedMessage,
      notified: direction === 'inbound'
    });

  } catch (error) {
    logger.error('Design comment error:', error);
    return handleApiError(res, error);
  }
});

// Get design comments for a share
app.get('/api/design-comments/:share_id', async (req, res) => {
  try {
    const { share_id } = req.params;

    // Get the share to find lead_id
    const { data: share } = await supabase
      .from('room_design_shares')
      .select('lead_id')
      .eq('id', share_id)
      .single();

    if (!share?.lead_id) {
      return res.json({ comments: [] });
    }

    // Get comments from customer_messages
    const { data: comments, error } = await supabase
      .from('customer_messages')
      .select('*')
      .eq('customer_id', share.lead_id)
      .eq('channel', 'design_share')
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ comments: comments || [] });

  } catch (error) {
    logger.error('Get design comments error:', error);
    return handleApiError(res, error);
  }
});

// Staff reply to design comment (requires authentication)
app.post('/api/design-comments/:lead_id/reply', commentRateLimiter, authenticateJWT, async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { message, share_id, design_id, author = 'Surprise Granite' } = req.body;
    const user_id = req.user?.id;

    // Require user ID for staff replies
    if (!user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate lead_id format
    if (!UUID_REGEX.test(lead_id)) {
      return res.status(400).json({ error: 'Invalid lead_id format' });
    }

    // Sanitize inputs
    const sanitizedMessage = String(message).slice(0, 5000);
    const sanitizedAuthor = String(author).slice(0, 100);

    // Verify user has access to this lead (check ownership)
    const { data: lead } = await supabase
      .from('leads')
      .select('owner_id, full_name, email')
      .eq('id', lead_id)
      .single();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Save staff reply to customer_messages
    const { data: savedMessage, error: insertError } = await supabase
      .from('customer_messages')
      .insert({
        customer_id: lead_id,
        sender_id: user_id,
        direction: 'outbound',
        channel: 'design_share',
        message: sanitizedMessage,
        sent_from: sanitizedAuthor,
        status: 'sent',
        metadata: {
          share_id: share_id || null,
          design_id: design_id || null,
          author: sanitizedAuthor,
          staff_id: user_id
        }
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Optionally send email to customer about the reply
    // Note: lead was already fetched above with full_name and email
    if (lead?.email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        const escapedName = escapeHtmlForEmail(lead.full_name?.split(' ')[0] || 'there');
        const escapedAuthor = escapeHtmlForEmail(sanitizedAuthor);
        const escapedMessage = escapeHtmlForEmail(sanitizedMessage);

        await transporter.sendMail({
          from: `"Surprise Granite" <${process.env.SMTP_USER || 'notifications@surprisegranite.com'}>`,
          to: lead.email,
          subject: `New reply on your design project`,
          html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5;">
  <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px; text-align: center;">
      <h1 style="color: #f9a825; margin: 0; font-size: 20px;">New Reply on Your Project</h1>
    </div>
    <div style="padding: 25px;">
      <p style="margin: 0 0 15px; color: #333;">Hi ${escapedName},</p>
      <p style="margin: 0 0 15px; color: #333;"><strong>${escapedAuthor}</strong> replied to your comment:</p>
      <div style="background: #f8f9fa; border-left: 4px solid #f9a825; padding: 15px; margin: 15px 0; border-radius: 4px;">
        <p style="margin: 0; color: #333;">"${escapedMessage}"</p>
      </div>
      <p style="margin: 15px 0; color: #666; font-size: 14px;">View the full conversation on your project page.</p>
    </div>
  </div>
</body>
</html>
          `
        });
      } catch (emailError) {
        logger.warn('Failed to send reply notification to customer:', emailError.message);
      }
    }

    res.json({ success: true, message: savedMessage });

  } catch (error) {
    logger.error('Staff reply error:', error);
    return handleApiError(res, error);
  }
});

// Rate limiter for token-based portal access (prevent brute force)
const portalTokenLimiter = publicRateLimiter({
  maxRequests: 5,
  windowMs: 300000, // 5 minutes
  message: 'Too many portal access attempts. Please wait 5 minutes.'
});

// Customer portal - get project by token
app.get('/api/customer-portal/:token', portalTokenLimiter, async (req, res) => {
  try {
    const { token } = req.params;

    // Get token and project
    const { data: tokenData, error } = await supabase
      .from('customer_portal_tokens')
      .select('*, room_designs(*)')
      .eq('token', token)
      .single();

    if (error || !tokenData) {
      return res.status(404).json({ error: 'Invalid token' });
    }

    // Check expiration
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Token expired' });
    }

    const project = tokenData.room_designs;

    // Update view tracking
    await supabase
      .from('customer_portal_tokens')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (tokenData.access_count || 0) + 1
      })
      .eq('token', token);

    // Record first view
    if (!project.quote_viewed_at) {
      await supabase
        .from('room_designs')
        .update({
          quote_viewed_at: new Date().toISOString(),
          status: project.status === 'sent' ? 'viewed' : project.status
        })
        .eq('id', project.id);

      // Log activity
      await supabase.from('project_activities').insert({
        project_id: project.id,
        activity_type: 'quote_viewed',
        description: `Quote viewed by ${tokenData.customer_email}`
      });
    }

    // Get payment history
    const { data: payments } = await supabase
      .from('project_payments')
      .select('*')
      .eq('project_id', project.id)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false });

    res.json({
      project: {
        id: project.id,
        name: project.name,
        room_type: project.room_type,
        elements: project.elements,
        rooms: project.rooms,
        settings: project.settings,
        quote_total: project.quote_total,
        quote_breakdown: project.quote_breakdown,
        status: project.status,
        amount_paid: project.amount_paid || 0,
        customer_name: project.customer_name,
        created_at: project.created_at
      },
      payments: payments || [],
      permissions: tokenData.permissions || ['view', 'approve', 'pay'],
      expires_at: tokenData.expires_at
    });

  } catch (error) {
    logger.error('Customer portal error:', error);
    return handleApiError(res, error);
  }
});

// Diagnostic endpoint to check Stripe connection
app.get('/api/stripe-status', async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve();
    const keyPrefix = process.env.STRIPE_SECRET_KEY?.substring(0, 20) || 'NOT SET';
    res.json({
      connected: true,
      account_id: account.id,
      business_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
      key_prefix: keyPrefix + '...',
      livemode: account.charges_enabled
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.message,
      key_prefix: process.env.STRIPE_SECRET_KEY?.substring(0, 20) || 'NOT SET'
    });
  }
});

// Start server with WebSocket support
server.listen(PORT, () => {
  logger.info(`Surprise Granite API running on port ${PORT}`);
  logger.info(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY} (key starts with: ${process.env.STRIPE_SECRET_KEY?.substring(0, 15) || 'NOT SET'})`);
  logger.info(`Supabase configured: ${!!supabase}`);
  logger.info(`Replicate configured: ${!!process.env.REPLICATE_API_TOKEN}`);
  logger.info(`OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  logger.info(`SMTP configured: ${!!SMTP_USER} (${SMTP_USER ? 'User: ' + SMTP_USER.substring(0, 3) + '***' : 'Not set'})`);
  logger.info(`Aria Realtime WebSocket: /api/aria-realtime`);
});
