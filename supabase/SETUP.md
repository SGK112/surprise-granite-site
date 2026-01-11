# Supabase Appointment System Setup

This guide walks you through setting up the appointment booking system with email notifications.

## Step 1: Create the Database Tables

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `/database/appointments-schema.sql`
4. Click **Run** to create the tables

This creates:
- `appointments` table - stores all appointment requests
- `notification_queue` table - queues email notifications
- RLS policies for security
- Triggers for auto-updating timestamps

## Step 2: Set Up Email Notifications (Resend)

### Option A: Using Supabase Edge Functions (Recommended)

1. **Get a Resend API Key**
   - Sign up at [resend.com](https://resend.com)
   - Create an API key
   - Verify your domain (surprisegranite.com) to send from custom addresses

2. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

3. **Link your project**
   ```bash
   cd /path/to/surprise-granite-site
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (Find your project ref in Supabase Dashboard > Settings > General)

4. **Set the secret**
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
   ```

5. **Deploy the function**
   ```bash
   supabase functions deploy send-appointment-email
   ```

6. **Create Database Webhook**
   - Go to Supabase Dashboard > Database > Webhooks
   - Click **Create a new webhook**
   - Settings:
     - Name: `appointment-email-notification`
     - Table: `appointments`
     - Events: `INSERT`
     - Type: `Supabase Edge Functions`
     - Edge Function: `send-appointment-email`

### Option B: Using External Webhook Service

If you prefer not to use Edge Functions, you can use a service like Make.com or Zapier:

1. Create a webhook endpoint in Make.com/Zapier
2. Go to Supabase Dashboard > Database > Webhooks
3. Create webhook pointing to your external service
4. Configure the external service to send emails via your preferred provider

## Step 3: Configure Email Settings

Update these values in `/supabase/functions/send-appointment-email/index.ts`:

```typescript
const ADMIN_EMAIL = "info@surprisegranite.com";  // Your notification email
const FROM_EMAIL = "appointments@surprisegranite.com";  // Sender email (must be verified in Resend)
```

## Step 4: Test the System

1. Go to your website's `/book/` page
2. Fill out and submit an appointment request
3. Check:
   - The admin dashboard at `/account/admin/appointments.html`
   - Your email inbox for notifications
   - Supabase Dashboard > Edge Functions > Logs for any errors

## Troubleshooting

### Emails not sending?
1. Check Edge Function logs in Supabase Dashboard
2. Verify RESEND_API_KEY is set correctly
3. Ensure your domain is verified in Resend
4. Check the webhook is configured correctly

### Appointments not showing?
1. Check browser console for errors
2. Verify Supabase anon key is correct in the booking page
3. Check RLS policies are applied

### CORS errors?
The Edge Function includes CORS headers. If issues persist, check your Supabase project's API settings.

## Files Reference

```
/database/appointments-schema.sql  - Database schema
/book/index.html                   - Public booking page
/account/admin/appointments.html   - Admin dashboard
/supabase/functions/               - Edge Functions
  └── send-appointment-email/
      └── index.ts                 - Email notification function
```

## Email Templates

The Edge Function sends two emails:

1. **Admin Notification** - Sent to `info@surprisegranite.com`
   - New appointment details
   - Customer contact info
   - Link to admin dashboard

2. **Customer Confirmation** - Sent to the customer
   - Appointment confirmation
   - Next steps
   - Contact information

## Security Notes

- RLS policies ensure only admins can view/modify appointments
- Anonymous users can only INSERT (submit new appointments)
- Service role has full access for backend operations
- All emails are sent server-side (no API keys in browser)
