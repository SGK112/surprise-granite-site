// Supabase Edge Function: Send Appointment Email Notifications
// Deploy with: supabase functions deploy send-appointment-email

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "info@surprisegranite.com";
const FROM_EMAIL = "appointments@surprisegranite.com";

interface AppointmentData {
  id: string;
  name: string;
  email: string;
  phone: string;
  appointment_type: string;
  preferred_date: string;
  preferred_time: string;
  project_type?: string;
  project_address?: string;
  project_city?: string;
  message?: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: AppointmentData;
  old_record?: AppointmentData;
}

const formatAppointmentType = (type: string): string => {
  const types: Record<string, string> = {
    free_estimate: "Free Estimate",
    showroom_visit: "Showroom Visit",
    design_consultation: "Design Consultation",
    measurement: "Measurement",
    installation: "Installation",
  };
  return types[type] || type;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Send email to admin about new appointment
async function sendAdminNotification(appointment: AppointmentData) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a2b3c; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 20px; background: #f9f9f9; }
        .detail { margin-bottom: 12px; }
        .label { font-weight: bold; color: #666; }
        .value { color: #333; }
        .highlight { background: #f9cb00; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; background: #f9cb00; color: #1a2b3c; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Appointment Request</h1>
        </div>
        <div class="content">
          <div class="highlight">
            <strong>Appointment Type:</strong> ${formatAppointmentType(appointment.appointment_type)}<br>
            <strong>Requested Date:</strong> ${formatDate(appointment.preferred_date)}<br>
            <strong>Requested Time:</strong> ${appointment.preferred_time}
          </div>

          <h3>Customer Information</h3>
          <div class="detail">
            <span class="label">Name:</span>
            <span class="value">${appointment.name}</span>
          </div>
          <div class="detail">
            <span class="label">Email:</span>
            <span class="value"><a href="mailto:${appointment.email}">${appointment.email}</a></span>
          </div>
          <div class="detail">
            <span class="label">Phone:</span>
            <span class="value"><a href="tel:${appointment.phone}">${appointment.phone}</a></span>
          </div>

          ${appointment.project_type ? `
          <h3>Project Details</h3>
          <div class="detail">
            <span class="label">Project Type:</span>
            <span class="value">${appointment.project_type}</span>
          </div>
          ` : ""}

          ${appointment.project_address ? `
          <div class="detail">
            <span class="label">Address:</span>
            <span class="value">${appointment.project_address}${appointment.project_city ? `, ${appointment.project_city}` : ""}</span>
          </div>
          ` : ""}

          ${appointment.message ? `
          <h3>Message</h3>
          <p>${appointment.message}</p>
          ` : ""}

          <center>
            <a href="https://surprisegranite.com/account/admin/appointments.html" class="button">
              View in Dashboard
            </a>
          </center>
        </div>
        <div class="footer">
          <p>This notification was sent from your Surprise Granite website.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `New Appointment Request: ${appointment.name} - ${formatDate(appointment.preferred_date)}`,
      html: html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send admin email: ${error}`);
  }

  return response.json();
}

// Send confirmation email to customer
async function sendCustomerConfirmation(appointment: AppointmentData) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a2b3c; color: white; padding: 20px; text-align: center; }
        .header img { max-width: 180px; }
        .header h1 { margin: 10px 0 0; font-size: 20px; }
        .content { padding: 20px; }
        .highlight { background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f9cb00; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f9f9f9; }
        .cta { text-align: center; margin: 30px 0; }
        .button { display: inline-block; background: #f9cb00; color: #1a2b3c; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Request Received</h1>
        </div>
        <div class="content">
          <p>Dear ${appointment.name},</p>

          <p>Thank you for scheduling an appointment with Surprise Granite! We have received your request and will confirm your appointment shortly.</p>

          <div class="highlight">
            <strong>Appointment Details:</strong><br><br>
            <strong>Type:</strong> ${formatAppointmentType(appointment.appointment_type)}<br>
            <strong>Requested Date:</strong> ${formatDate(appointment.preferred_date)}<br>
            <strong>Requested Time:</strong> ${appointment.preferred_time}
          </div>

          <p><strong>What happens next?</strong></p>
          <ol>
            <li>Our team will review your appointment request</li>
            <li>You'll receive a confirmation email within 24 hours</li>
            <li>If we need to suggest an alternate time, we'll contact you</li>
          </ol>

          <p>If you have any questions or need to reschedule, please call us at <a href="tel:+16028333189">(602) 833-3189</a> or reply to this email.</p>

          <div class="cta">
            <a href="https://surprisegranite.com" class="button">Visit Our Website</a>
          </div>

          <p>We look forward to meeting you!</p>

          <p>Best regards,<br>
          <strong>The Surprise Granite Team</strong></p>
        </div>
        <div class="footer">
          <p><strong>Surprise Granite</strong><br>
          Premium Countertops & Stone Surfaces<br>
          <a href="tel:+16028333189">(602) 833-3189</a> |
          <a href="mailto:info@surprisegranite.com">info@surprisegranite.com</a></p>
          <p>14050 N 83rd Ave Suite 290, Peoria, AZ 85381</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: appointment.email,
      subject: `Appointment Request Received - Surprise Granite`,
      html: html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send customer email: ${error}`);
  }

  return response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // Verify API key is configured
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const payload: WebhookPayload = await req.json();

    // Only handle INSERT events for new appointments
    if (payload.type !== "INSERT" || payload.table !== "appointments") {
      return new Response(JSON.stringify({ message: "Ignored - not a new appointment" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const appointment = payload.record;

    // Send both emails concurrently
    const [adminResult, customerResult] = await Promise.allSettled([
      sendAdminNotification(appointment),
      sendCustomerConfirmation(appointment),
    ]);

    const results = {
      admin: adminResult.status === "fulfilled" ? "sent" : (adminResult as PromiseRejectedResult).reason.message,
      customer: customerResult.status === "fulfilled" ? "sent" : (customerResult as PromiseRejectedResult).reason.message,
    };

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error processing appointment notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
