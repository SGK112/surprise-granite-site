# Optional Services Configuration Guide

This guide covers setting up optional production services for the Surprise Granite API.

## Table of Contents
1. [Sentry Error Tracking](#sentry-error-tracking)
2. [Redis Rate Limiting](#redis-rate-limiting)
3. [Twilio SMS Notifications](#twilio-sms-notifications)

---

## Sentry Error Tracking

Sentry provides real-time error tracking and performance monitoring.

### Setup Steps

1. **Create Sentry Account**
   - Go to [sentry.io](https://sentry.io) and create a free account
   - Create a new project, select "Node.js" as the platform

2. **Get Your DSN**
   - In your project settings, go to "Client Keys (DSN)"
   - Copy the DSN (looks like `https://xxx@yyy.ingest.sentry.io/zzz`)

3. **Install Package** (if not already installed)
   ```bash
   cd api
   npm install @sentry/node
   ```

4. **Add Environment Variable**

   In Render Dashboard:
   - Go to your service → Environment
   - Add: `SENTRY_DSN` = your DSN from step 2

5. **Enable in server.js** (optional - already configured)

   The code in `utils/sentry.js` will automatically initialize when `SENTRY_DSN` is set.

### Features Enabled
- Automatic error capture for 5xx errors
- Performance monitoring (10% sampling in production)
- Sensitive data filtering (passwords, tokens, API keys redacted)
- Request/response context for debugging

### Verify Setup
After deployment, trigger a test error and check your Sentry dashboard.

---

## Redis Rate Limiting

Redis provides distributed rate limiting that works across multiple server instances.

### Setup Steps

1. **Create Redis Instance**

   **Option A: Render Redis**
   - In Render Dashboard, click "New +" → "Redis"
   - Select a plan (free tier available)
   - Note the Internal URL after creation

   **Option B: Upstash (Serverless Redis)**
   - Go to [upstash.com](https://upstash.com)
   - Create a free Redis database
   - Copy the Redis URL from the dashboard

   **Option C: Redis Cloud**
   - Go to [redis.com/cloud](https://redis.com/try-free/)
   - Create a free database
   - Copy the public endpoint URL

2. **Install Packages** (if not already installed)
   ```bash
   cd api
   npm install ioredis rate-limiter-flexible
   ```

3. **Add Environment Variable**

   In Render Dashboard:
   - Add: `REDIS_URL` = your Redis URL

   Format: `redis://[:password@]host:port` or `rediss://...` for TLS

4. **Restart Service**

   The rate limiter in `utils/redis-rate-limiter.js` will automatically use Redis when `REDIS_URL` is configured.

### Rate Limit Tiers
Pre-configured limits (in `utils/redis-rate-limiter.js`):

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General API | 100 requests | per minute |
| Authentication | 5 attempts | per 15 minutes |
| AI Endpoints | 10 requests | per hour |
| Email Sending | 20 emails | per hour |
| Lead Submission | 5 submissions | per hour |
| Webhooks | 1000 requests | per minute |

### Verify Setup
Check logs for "Redis connected for rate limiting" message.

---

## Twilio SMS Notifications

Twilio enables SMS notifications for estimates, invoices, and job updates.

### Setup Steps

1. **Create Twilio Account**
   - Go to [twilio.com](https://www.twilio.com/try-twilio) and sign up
   - Verify your phone number

2. **Get Credentials**
   - From the Twilio Console dashboard, copy:
     - Account SID
     - Auth Token
   - Go to Phone Numbers → Manage → Buy a number
   - Purchase a phone number with SMS capability

3. **Install Package** (if not already installed)
   ```bash
   cd api
   npm install twilio
   ```

4. **Add Environment Variables**

   In Render Dashboard, add:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_PHONE_NUMBER=+1234567890
   ```

5. **Update Notification Service**

   The workflow routes (`routes/workflow.js`) will automatically send SMS when Twilio is configured.

### SMS Templates
The system sends SMS for:
- **Estimates**: "Your estimate #{number} for ${total} is ready. View: {link}"
- **Invoices**: "Invoice #{number} for ${total} is due. Pay: {link}"
- **Jobs**: "Job update: Your project status is now '{status}'."
- **Appointments**: "Reminder: Appointment on {date} at {time}."

### Verify Setup
1. Submit a test lead through the website
2. Convert lead to estimate
3. Check if SMS is sent to the customer phone number

### Cost Considerations
- Twilio charges per SMS (~$0.0079 per message in US)
- Consider implementing opt-in for SMS notifications
- Use `LOG_LEVEL=debug` to see SMS activity without sending

---

## Quick Reference: All Environment Variables

```bash
# Required (already configured)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
PORT=3001
NODE_ENV=production

# Email (already configured)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_app_password
ADMIN_EMAIL=admin@example.com

# AI Services (already configured)
REPLICATE_API_TOKEN=r8_...
OPENAI_API_KEY=sk-proj-...

# Supabase (already configured)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Optional - Error Tracking
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz

# Optional - Distributed Rate Limiting
REDIS_URL=redis://localhost:6379

# Optional - SMS Notifications
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# Optional - Logging
LOG_LEVEL=info  # debug, info, warn, error
```

---

## Troubleshooting

### Sentry not capturing errors
- Verify `SENTRY_DSN` is set correctly
- Check for "Sentry error tracking initialized" in logs
- Ensure errors are 5xx (4xx errors are intentionally not captured)

### Redis connection failing
- Verify URL format (redis:// or rediss://)
- Check if Redis instance is running
- Verify network access (firewall, VPC settings)
- System falls back to in-memory rate limiting automatically

### Twilio SMS not sending
- Verify all three env vars are set
- Check Twilio console for error logs
- Ensure phone number has SMS capability
- Verify customer phone numbers are valid (E.164 format: +1234567890)

---

## Security Notes

1. **Never commit credentials** - Always use environment variables
2. **Rotate tokens periodically** - Update API keys every 90 days
3. **Monitor usage** - Set up billing alerts in each service
4. **Use least privilege** - Only enable features you need
