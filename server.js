const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
// Load environment variables - try root first, then api/.env
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Make supabase available to routes
app.set('supabase', supabase);

// Arizona timezone offset (MST, no DST)
const ARIZONA_TIMEZONE_OFFSET = '-07:00';

// Middleware
app.use(cors());
app.use(express.json());

// Disable caching for HTML files
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path.endsWith('/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static('.'));

// Clean URL routing for key pages
app.get('/book-appointment', (req, res) => {
  res.sendFile(path.join(__dirname, 'book-appointment.html'));
});

app.get('/book', (req, res) => {
  res.redirect('/book-appointment');
});

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Send estimate endpoint
app.post('/api/send-estimate', async (req, res) => {
    try {
        const {
            email,
            counterSqft,
            splashSqft,
            totalSqft,
            edgeProfile,
            edgeLF,
            priceBudget,
            pricePopular,
            pricePremium
        } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Your Countertop Estimate</h1>
                            <p style="color: #f9cb00; margin: 10px 0 0; font-size: 18px; font-weight: bold;">Surprise Granite</p>
                            <p style="color: #cccccc; margin: 5px 0 0; font-size: 14px;">Marble & Quartz</p>
                        </td>
                    </tr>

                    <!-- Summary Section -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 30px 40px;">
                            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 20px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Project Summary</h2>

                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Countertop Area</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${counterSqft}</strong>
                                    </td>
                                </tr>
                                ${splashSqft && splashSqft !== '0 sqft' && splashSqft !== '0.00 sqft' ? `
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Backsplash Area</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${splashSqft}</strong>
                                    </td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Total with 10% Waste</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${totalSqft}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Edge Profile</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${edgeProfile}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0;">
                                        <span style="color: #666666; font-size: 15px;">Edge Length</span>
                                    </td>
                                    <td style="padding: 12px 0; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${edgeLF}</strong>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Price Section -->
                    <tr>
                        <td style="background-color: #f9f9f9; padding: 30px 40px;">
                            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 20px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Estimated Price Range</h2>

                            <!-- Budget Tier -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 12px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold;">Budget-Friendly</p>
                                        <p style="margin: 4px 0 0; color: #888888; font-size: 13px;">Basic granite & quartz</p>
                                    </td>
                                    <td style="padding: 16px 20px; text-align: right;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: bold;">${priceBudget}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Popular Tier -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 2px solid #f9cb00; border-radius: 8px; margin-bottom: 12px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold;">Popular Choice ★</p>
                                        <p style="margin: 4px 0 0; color: #888888; font-size: 13px;">Mid-range selections</p>
                                    </td>
                                    <td style="padding: 16px 20px; text-align: right;">
                                        <p style="margin: 0; color: #c9a000; font-size: 22px; font-weight: bold;">${pricePopular}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Premium Tier -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 16px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold;">Premium</p>
                                        <p style="margin: 4px 0 0; color: #888888; font-size: 13px;">High-end & exotic</p>
                                    </td>
                                    <td style="padding: 16px 20px; text-align: right;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: bold;">${pricePremium}</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0; color: #888888; font-size: 12px; font-style: italic;">* This is an estimate only. Final pricing depends on material selection, edge profile, cutouts, and layout complexity.</p>
                        </td>
                    </tr>

                    <!-- CTA Section -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <p style="color: #ffffff; font-size: 18px; margin: 0 0 20px;">Ready for an exact quote?</p>
                            <a href="https://surprisegranite.com/get-a-free-estimate/" style="display: inline-block; background-color: #f9cb00; color: #1a1a2e; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Schedule Free Estimate</a>
                            <p style="color: #cccccc; font-size: 14px; margin: 20px 0 0;">Or call us: <a href="tel:+16028333189" style="color: #f9cb00; text-decoration: none; font-weight: bold;">(602) 833-3189</a></p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f4f4f4; padding: 20px 40px; text-align: center;">
                            <p style="color: #888888; font-size: 13px; margin: 0;">Surprise Granite Marble & Quartz</p>
                            <p style="color: #888888; font-size: 13px; margin: 5px 0;">Greater Phoenix, AZ | We Come to You!</p>
                            <p style="color: #888888; font-size: 12px; margin: 10px 0 0;"><a href="https://surprisegranite.com" style="color: #1a1a2e;">surprisegranite.com</a></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        // Send to customer
        await transporter.sendMail({
            from: `"Surprise Granite" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your Countertop Estimate - Surprise Granite',
            html: emailHtml
        });

        // Send copy to business
        await transporter.sendMail({
            from: `"Website Estimate" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `New Estimate Request from ${email}`,
            html: `
                <h2>New Estimate Generated</h2>
                <p><strong>Customer Email:</strong> ${email}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                <hr>
                <p><strong>Countertop:</strong> ${counterSqft}</p>
                <p><strong>Backsplash:</strong> ${splashSqft || 'None'}</p>
                <p><strong>Total (with waste):</strong> ${totalSqft}</p>
                <p><strong>Edge:</strong> ${edgeProfile} - ${edgeLF}</p>
                <hr>
                <p><strong>Budget Range:</strong> ${priceBudget}</p>
                <p><strong>Popular Range:</strong> ${pricePopular}</p>
                <p><strong>Premium Range:</strong> ${pricePremium}</p>
            `
        });

        res.json({ success: true, message: 'Estimate sent successfully' });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
});

// Remnant listing submission (from fabricators)
app.post('/api/remnant-listing', async (req, res) => {
    try {
        const data = req.body;

        await transporter.sendMail({
            from: `"Remnant Marketplace" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `New Remnant Listing: ${data.stoneName} ${data.stoneType}`,
            html: `
                <h2>New Remnant Listing Submitted</h2>
                <h3>Stone Details</h3>
                <p><strong>Stone Name:</strong> ${data.stoneName}</p>
                <p><strong>Type:</strong> ${data.stoneType}</p>
                <p><strong>Dimensions:</strong> ${data.length}" x ${data.width}" (${data.squareFeet} sq ft)</p>
                <p><strong>Thickness:</strong> ${data.thickness}</p>
                <p><strong>Finish:</strong> ${data.finish || 'Polished'}</p>
                <p><strong>Condition:</strong> ${data.condition || 'Excellent'}</p>
                <p><strong>Asking Price:</strong> $${data.price}</p>
                <p><strong>Description:</strong> ${data.description || 'None'}</p>
                <hr>
                <h3>Fabricator Contact</h3>
                <p><strong>Business:</strong> ${data.businessName}</p>
                <p><strong>Contact:</strong> ${data.contactName}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Phone:</strong> ${data.phone}</p>
                <p><strong>Location:</strong> ${data.city}, AZ ${data.zip}</p>
                <hr>
                <p><em>Submitted: ${new Date().toLocaleString()}</em></p>
            `
        });

        // Send confirmation to fabricator
        await transporter.sendMail({
            from: `"Surprise Granite Marketplace" <${process.env.EMAIL_USER}>`,
            to: data.email,
            subject: 'Your Remnant Listing Has Been Received',
            html: `
                <h2>Thanks for listing your remnant!</h2>
                <p>Hi ${data.contactName},</p>
                <p>We've received your listing for <strong>${data.stoneName} ${data.stoneType}</strong>.</p>
                <p>Our team will review it and add it to the marketplace within 24 hours. You'll receive another email once it's live.</p>
                <h3>Listing Summary</h3>
                <ul>
                    <li>Stone: ${data.stoneName} ${data.stoneType}</li>
                    <li>Size: ${data.length}" x ${data.width}" (${data.squareFeet} sq ft)</li>
                    <li>Price: $${data.price}</li>
                </ul>
                <p>Questions? Reply to this email or call us at (602) 833-3189.</p>
                <p>Thanks,<br>Surprise Granite Team</p>
            `
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Remnant listing error:', error);
        res.status(500).json({ error: 'Failed to submit listing' });
    }
});

// Remnant notification signup
app.post('/api/remnant-notify', async (req, res) => {
    try {
        const { email } = req.body;

        await transporter.sendMail({
            from: `"Remnant Marketplace" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'New Remnant Notification Signup',
            html: `<p>New remnant notification signup: <strong>${email}</strong></p><p>Date: ${new Date().toLocaleString()}</p>`
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Notify signup error:', error);
        res.status(500).json({ error: 'Failed to signup' });
    }
});

// Remnant inquiry (from consumers)
app.post('/api/remnant-inquiry', async (req, res) => {
    try {
        const data = req.body;

        await transporter.sendMail({
            from: `"Remnant Inquiry" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `Remnant Inquiry: ${data.stoneName}`,
            html: `
                <h2>New Remnant Inquiry</h2>
                <p><strong>Stone:</strong> ${data.stoneName}</p>
                <hr>
                <h3>Customer Info</h3>
                <p><strong>Name:</strong> ${data.name}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Phone:</strong> ${data.phone}</p>
                <p><strong>Message:</strong> ${data.message || 'No message'}</p>
                <hr>
                <p><em>Submitted: ${new Date().toLocaleString()}</em></p>
            `
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Remnant inquiry error:', error);
        res.status(500).json({ error: 'Failed to submit inquiry' });
    }
});

// ============================================
// CALENDAR AVAILABILITY ENDPOINTS (PUBLIC)
// ============================================

const BUSINESS_HOURS = {
  start: 8,  // 8 AM
  end: 18,   // 6 PM
  slotDuration: 60,
  daysOfWeek: [1, 2, 3, 4, 5, 6] // Mon-Sat
};

function isBusinessDay(date) {
  const dayOfWeek = date.getDay();
  return BUSINESS_HOURS.daysOfWeek.includes(dayOfWeek);
}

function generateTimeSlots(date, durationMinutes = 60) {
  const slots = [];
  const dateStr = date.toISOString().split('T')[0];
  for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
    // Create slot in Arizona timezone (MST, no DST)
    const slotStart = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:00:00${ARIZONA_TIMEZONE_OFFSET}`);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
    // Check end hour in Arizona time
    const endHourAZ = new Date(slotEnd.toLocaleString('en-US', { timeZone: 'America/Phoenix' })).getHours();
    if (endHourAZ <= BUSINESS_HOURS.end) {
      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        time: `${hour.toString().padStart(2, '0')}:00`,
        label: hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`
      });
    }
  }
  return slots;
}

// Get available time slots for a specific date
app.get('/api/calendar/availability/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const durationMinutes = parseInt(req.query.duration_minutes) || 60;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const targetDate = new Date(date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if date is in the past
    if (targetDate < today) {
      return res.json({ date, slots: [], availableSlots: 0, message: 'Date is in the past' });
    }

    // Check if business day
    if (!isBusinessDay(targetDate)) {
      return res.json({ date, isBusinessDay: false, slots: [], availableSlots: 0, message: 'Not a business day' });
    }

    // Generate all time slots
    const allSlots = generateTimeSlots(targetDate, durationMinutes);

    // Get existing events for this date from Supabase
    let bookedSlots = [];
    if (supabase) {
      const startOfDay = new Date(date + 'T00:00:00').toISOString();
      const endOfDay = new Date(date + 'T23:59:59').toISOString();

      const { data: events } = await supabase
        .from('calendar_events')
        .select('start_time, end_time')
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .neq('status', 'cancelled');

      bookedSlots = events || [];
    }

    // Mark slots as available or booked
    const slots = allSlots.map(slot => {
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);

      const isBooked = bookedSlots.some(event => {
        const eventStart = new Date(event.start_time);
        const eventEnd = new Date(event.end_time);
        return (slotStart < eventEnd && slotEnd > eventStart);
      });

      return { ...slot, available: !isBooked };
    });

    const availableSlots = slots.filter(s => s.available).length;

    res.json({
      date,
      isBusinessDay: true,
      totalSlots: slots.length,
      availableSlots,
      slots
    });

  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Get availability for multiple days
app.get('/api/calendar/availability', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const durationMinutes = parseInt(req.query.duration_minutes) || 60;

    const availability = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all events for the date range
    let allEvents = [];
    if (supabase) {
      const startDate = today.toISOString();
      const endDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

      const { data: events } = await supabase
        .from('calendar_events')
        .select('start_time, end_time')
        .gte('start_time', startDate)
        .lte('start_time', endDate)
        .neq('status', 'cancelled');

      allEvents = events || [];
    }

    for (let i = 1; i <= days; i++) {
      const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      if (!isBusinessDay(date)) {
        availability.push({ date: dateStr, availableSlots: 0, isBusinessDay: false });
        continue;
      }

      const allSlots = generateTimeSlots(date, durationMinutes);
      const dayEvents = allEvents.filter(e => e.start_time.startsWith(dateStr));

      const availableSlots = allSlots.filter(slot => {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        return !dayEvents.some(event => {
          const eventStart = new Date(event.start_time);
          const eventEnd = new Date(event.end_time);
          return (slotStart < eventEnd && slotEnd > eventStart);
        });
      }).length;

      availability.push({
        date: dateStr,
        availableSlots,
        totalSlots: allSlots.length,
        isBusinessDay: true
      });
    }

    res.json({
      startDate: availability[0]?.date,
      endDate: availability[availability.length - 1]?.date,
      days,
      availability,
      datesWithAvailability: availability.filter(d => d.availableSlots > 0).map(d => d.date)
    });

  } catch (error) {
    console.error('Availability list error:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

// Public booking endpoint
app.post('/api/calendar/book', async (req, res) => {
  try {
    const { name, email, phone, date, time, event_type, project_type, address, notes, duration_minutes } = req.body;

    // Validation
    if (!name || !email || !date || !time) {
      return res.status(400).json({ error: 'Name, email, date, and time are required' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'Invalid time format' });
    }

    // Create datetime (Arizona timezone - MST, no DST)
    const startTime = new Date(`${date}T${time}:00${ARIZONA_TIMEZONE_OFFSET}`);
    const duration = parseInt(duration_minutes) || 60;
    const endTime = new Date(startTime.getTime() + duration * 60000);

    // Check if time is in the past
    if (startTime < new Date()) {
      return res.status(400).json({ error: 'Cannot book appointments in the past' });
    }

    // Check if business hours
    const hour = startTime.getHours();
    if (hour < BUSINESS_HOURS.start || hour >= BUSINESS_HOURS.end) {
      return res.status(400).json({ error: 'Time is outside business hours' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from('calendar_events')
      .select('id')
      .gte('start_time', startTime.toISOString())
      .lt('start_time', endTime.toISOString())
      .neq('status', 'cancelled')
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    // Get admin user for created_by
    let calendarOwnerId = null;
    const { data: adminUser } = await supabase
      .from('sg_users')
      .select('id')
      .or('account_type.eq.admin,account_type.eq.super_admin')
      .limit(1)
      .single();

    if (adminUser) {
      calendarOwnerId = adminUser.id;
    }

    if (!calendarOwnerId) {
      return res.status(500).json({ error: 'No admin user configured for calendar' });
    }

    // Create calendar event
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert([{
        created_by: calendarOwnerId,
        title: `${event_type === 'consultation' ? 'Phone Consultation' : event_type === 'site_visit' ? 'Showroom Visit' : 'In-Home Estimate'}: ${name}`,
        description: `Project: ${project_type || 'Countertops'}\nPhone: ${phone || 'N/A'}\nEmail: ${email}\nAddress: ${address || 'N/A'}\n\nNotes: ${notes || 'None'}`,
        event_type: event_type || 'appointment',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        location: address || null,
        location_address: address || null,
        status: 'scheduled',
        color: '#f59e0b',
        metadata: { source: 'online_booking', project_type }
      }])
      .select()
      .single();

    if (eventError) {
      console.error('Calendar event creation error:', eventError);
      return res.status(500).json({ error: 'Failed to create appointment' });
    }

    // Add customer as participant
    await supabase
      .from('calendar_event_participants')
      .insert([{
        event_id: event.id,
        email: email.toLowerCase(),
        name: name,
        phone: phone || null,
        participant_type: 'attendee',
        response_status: 'accepted'
      }]);

    // Generate calendar links
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startTime.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${endTime.toISOString().replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(event.description || '')}&location=${encodeURIComponent(address || '')}`;

    // Format time for emails
    const timeFormatted = new Date(`2000-01-01T${time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Notify business owner
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
      if (adminEmail) {
        await transporter.sendMail({
          from: `"Surprise Granite" <${process.env.EMAIL_USER}>`,
          to: adminEmail,
          subject: `New Appointment Booked: ${name} - ${dateFormatted} at ${timeFormatted}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#f59e0b;">New Appointment Booked</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;font-weight:bold;">Customer:</td><td style="padding:8px;">${name}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Email:</td><td style="padding:8px;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Phone:</td><td style="padding:8px;">${phone ? `<a href="tel:${phone}">${phone}</a>` : 'N/A'}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Date:</td><td style="padding:8px;">${dateFormatted}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Time:</td><td style="padding:8px;">${timeFormatted}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Type:</td><td style="padding:8px;">${event_type || 'appointment'}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Project:</td><td style="padding:8px;">${project_type || 'Countertops'}</td></tr>
                ${address ? `<tr><td style="padding:8px;font-weight:bold;">Address:</td><td style="padding:8px;">${address}</td></tr>` : ''}
                ${notes ? `<tr><td style="padding:8px;font-weight:bold;">Notes:</td><td style="padding:8px;">${notes}</td></tr>` : ''}
              </table>
              <p style="margin-top:16px;"><a href="${googleCalendarUrl}" style="background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Add to Google Calendar</a></p>
            </div>
          `
        });
      }
    } catch (emailErr) {
      console.error('Admin notification email error:', emailErr);
    }

    // Send confirmation to customer
    try {
      await transporter.sendMail({
        from: `"Surprise Granite" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Appointment Confirmed - ${dateFormatted} at ${timeFormatted}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#f59e0b;">Your Appointment is Confirmed!</h2>
            <p>Hi ${name},</p>
            <p>Your appointment with Surprise Granite has been scheduled:</p>
            <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;">
              <p style="margin:4px 0;"><strong>Date:</strong> ${dateFormatted}</p>
              <p style="margin:4px 0;"><strong>Time:</strong> ${timeFormatted}</p>
              ${address ? `<p style="margin:4px 0;"><strong>Location:</strong> ${address}</p>` : ''}
            </div>
            <p><a href="${googleCalendarUrl}" style="background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Add to Google Calendar</a></p>
            <p style="margin-top:20px;color:#666;">Need to reschedule? Call us at <a href="tel:6028333189">(602) 833-3189</a></p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Customer confirmation email error:', emailErr);
    }

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      event: {
        id: event.id,
        title: event.title,
        start_time: event.start_time,
        end_time: event.end_time,
        date: date,
        time: time
      },
      calendarLinks: {
        google: googleCalendarUrl
      }
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// Lightweight lead notification endpoint (no DB insert, just notify admin)
// Called by frontend forms after they save to Supabase directly
app.post('/api/notify-lead', async (req, res) => {
  try {
    const { name, email, phone, form_name, source, project_type, message, details } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Safety net: also save to Supabase in case client-side save failed
    if (supabase) {
      try {
        // Check if this lead was already saved in the last 2 minutes (avoid duplicates)
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('email', email.toLowerCase().trim())
          .gte('created_at', twoMinAgo)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('leads').insert([{
            full_name: name || '',
            email: email.toLowerCase().trim(),
            phone: phone || null,
            project_type: project_type || null,
            message: message || details || null,
            source: 'website',
            form_name: form_name || 'website',
            page_url: source || null,
            status: 'new'
          }]);
          console.log('[notify-lead] Lead saved to Supabase (safety net)');
        } else {
          console.log('[notify-lead] Lead already exists in Supabase, skipping save');
        }
      } catch (dbErr) {
        console.error('[notify-lead] Supabase save failed:', dbErr.message);
      }
    }

    // Send admin email notification
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!adminEmail) {
      return res.status(500).json({ error: 'Admin email not configured' });
    }

    const formLabel = (form_name || 'website').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const sourceLabel = source || 'Website';

    await transporter.sendMail({
      from: `"Surprise Granite" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `New Lead: ${name || email} (${formLabel})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#f59e0b;margin-bottom:4px;">New Lead from ${formLabel}</h2>
          <p style="color:#666;margin-top:0;">Source: ${sourceLabel}</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#f8f9fa;"><td style="padding:10px;font-weight:bold;border:1px solid #ddd;">Name</td><td style="padding:10px;border:1px solid #ddd;">${name || 'Not provided'}</td></tr>
            <tr><td style="padding:10px;font-weight:bold;border:1px solid #ddd;">Email</td><td style="padding:10px;border:1px solid #ddd;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr style="background:#f8f9fa;"><td style="padding:10px;font-weight:bold;border:1px solid #ddd;">Phone</td><td style="padding:10px;border:1px solid #ddd;">${phone ? `<a href="tel:${phone}">${phone}</a>` : 'Not provided'}</td></tr>
            ${project_type ? `<tr><td style="padding:10px;font-weight:bold;border:1px solid #ddd;">Project</td><td style="padding:10px;border:1px solid #ddd;">${project_type}</td></tr>` : ''}
            ${message || details ? `<tr style="background:#f8f9fa;"><td style="padding:10px;font-weight:bold;border:1px solid #ddd;">Message</td><td style="padding:10px;border:1px solid #ddd;">${message || details}</td></tr>` : ''}
          </table>
          <p style="color:#999;font-size:12px;">Submitted at ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST</p>
        </div>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Lead notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', supabase: !!supabase });
});

// ============================================
// DYNAMIC PRODUCT PAGES (replaces 1600+ static files)
// ============================================

// Load product data for validation
const fs = require('fs');
let countertopsData = { countertops: [] };
let tilesData = { tiles: [] };
let flooringData = { flooring: [] };

try {
  countertopsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/countertops.json'), 'utf8'));
  console.log(`Loaded ${countertopsData.countertops?.length || 0} countertops`);
} catch (e) { console.log('No countertops data found'); }

try {
  tilesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/tile.json'), 'utf8'));
  console.log(`Loaded ${tilesData.tiles?.length || 0} tiles`);
} catch (e) { console.log('No tile data found'); }

try {
  flooringData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/flooring.json'), 'utf8'));
  console.log(`Loaded ${flooringData.flooring?.length || 0} flooring items`);
} catch (e) { console.log('No flooring data found'); }

// Dynamic countertop pages (handles /countertops/calacatta-prado-quartz/)
app.get('/countertops/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/\/$/, ''); // Remove trailing slash
  const product = countertopsData.countertops?.find(p => p.slug === slug);

  if (product) {
    res.sendFile(path.join(__dirname, 'templates/product.html'));
  } else {
    next(); // Fall through to static file handler
  }
});

// Dynamic tile pages
app.get('/tiles/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/\/$/, '');
  const product = tilesData.tiles?.find(p => p.slug === slug);

  if (product) {
    res.sendFile(path.join(__dirname, 'templates/product.html'));
  } else {
    next();
  }
});

app.get('/tile/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/\/$/, '');
  const product = tilesData.tiles?.find(p => p.slug === slug);

  if (product) {
    res.sendFile(path.join(__dirname, 'templates/product.html'));
  } else {
    next();
  }
});

// Dynamic flooring pages
app.get('/flooring/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/\/$/, '');
  const product = flooringData.flooring?.find(p => p.slug === slug);

  if (product) {
    res.sendFile(path.join(__dirname, 'templates/product.html'));
  } else {
    next();
  }
});

// ============================================
// REDIRECTS (old redundant paths)
// ============================================

// /shop/ -> /marketplace/
app.get('/shop', (req, res) => res.redirect(301, '/marketplace/'));
app.get('/shop/', (req, res) => res.redirect(301, '/marketplace/'));

// /store/ -> /marketplace/
app.get('/store', (req, res) => res.redirect(301, '/marketplace/'));
app.get('/store/', (req, res) => res.redirect(301, '/marketplace/'));

// /shop.html -> /marketplace/
app.get('/shop.html', (req, res) => res.redirect(301, '/marketplace/'));

// ============================================
// REMINDERS API
// ============================================
try {
  const remindersRouter = require('./api/routes/reminders');
  app.use('/api/reminders', remindersRouter);
  console.log('Reminders API loaded');
} catch (err) {
  console.warn('Reminders API not available:', err.message);
}

// ============================================
// EMAIL API
// ============================================
try {
  const emailRouter = require('./api/routes/email');
  app.use('/api/email', emailRouter);
  console.log('Email API loaded');
} catch (err) {
  console.warn('Email API not available:', err.message);
}

// ============================================
// CALENDAR API
// ============================================
try {
  const calendarRouter = require('./api/routes/calendar');
  app.use('/api/calendar', calendarRouter);
  console.log('Calendar API loaded');
} catch (err) {
  console.warn('Calendar API not available:', err.message);
}

// ============================================
// PROJECTS API (consolidated from jobs)
// ============================================
try {
  const projectsRouter = require('./api/routes/projects');
  app.use('/api/projects', projectsRouter);
  console.log('Projects API loaded');
} catch (err) {
  console.warn('Projects API not available:', err.message);
}

// ============================================
// LEADS API
// ============================================
try {
  const leadsRouter = require('./api/routes/leads');
  app.use('/api/leads', leadsRouter);
  console.log('Leads API loaded');
} catch (err) {
  console.warn('Leads API not available:', err.message);
}

// ============================================
// INVOICES API
// ============================================
try {
  const invoicesRouter = require('./api/routes/invoices');
  app.use('/api/invoices', invoicesRouter);
  console.log('Invoices API loaded');
} catch (err) {
  console.warn('Invoices API not available:', err.message);
}

// ============================================
// WORKFLOW API (conversions)
// ============================================
try {
  const workflowRouter = require('./api/routes/workflow');
  app.use('/api/workflow', workflowRouter);
  console.log('Workflow API loaded');
} catch (err) {
  console.warn('Workflow API not available:', err.message);
}

// ============================================
// PORTAL API (customer access)
// ============================================
try {
  const portalRouter = require('./api/routes/portal');
  app.use('/api/portal', portalRouter);
  console.log('Portal API loaded');
} catch (err) {
  console.warn('Portal API not available:', err.message);
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start the scheduler service for automated reminders
    try {
      const schedulerService = require('./api/services/schedulerService');
      schedulerService.start();
      console.log('Scheduler service started');
    } catch (err) {
      console.warn('Scheduler service not available:', err.message);
    }
});
