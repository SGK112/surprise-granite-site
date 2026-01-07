# Surprise Granite Stripe API

This API handles Stripe operations for the Surprise Granite platform, including:
- Invoice creation and management
- Customer management
- Payment links
- Stripe Connect for vendor payouts

## Setup

### 1. Deploy to Render

Create a new Web Service on Render:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect this repository or use the `/api` folder
4. Configure:
   - **Name**: `sg-api` (or your preferred name)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or paid for production)

### 2. Set Environment Variables

In Render, add these environment variables:

```
STRIPE_SECRET_KEY=sk_live_51Smr3E3qDbNyHFmd...  (your Stripe secret key)
STRIPE_WEBHOOK_SECRET=whsec_...                  (optional, for webhooks)
PORT=3001                                        (Render sets this automatically)
```

### 3. Update Frontend API URL

After deployment, update the API URL in `/account/index.html`:

```javascript
const API_URL = 'https://your-api-name.onrender.com';
```

## API Endpoints

### Customers

- `POST /api/customers` - Create or get a customer
- `GET /api/customers/:email` - Get customer by email

### Invoices

- `POST /api/invoices` - Create and send an invoice
- `GET /api/invoices` - List all invoices
- `GET /api/invoices/:id` - Get invoice details
- `POST /api/invoices/:id/remind` - Send payment reminder
- `POST /api/invoices/:id/void` - Void an invoice

### Payment Links

- `POST /api/payment-links` - Create a quick payment link

### Stripe Connect (Vendor Payouts)

- `POST /api/connect/accounts` - Create vendor account
- `GET /api/connect/accounts/:id` - Get vendor account status
- `POST /api/connect/accounts/:id/login` - Get vendor dashboard link
- `POST /api/connect/payouts` - Create payout to vendor

## Example: Create Invoice

```javascript
const response = await fetch('https://sg-api.onrender.com/api/invoices', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer_email: 'customer@example.com',
    customer_name: 'John Smith',
    items: [
      { description: 'Countertop Installation', quantity: 1, amount: 2500 }
    ],
    due_days: 30,
    auto_send: true
  })
});

const data = await response.json();
console.log(data.invoice.hosted_invoice_url);
```

## Security Notes

- The Stripe secret key is stored server-side only
- CORS is configured to only allow requests from surprisegranite.com
- For production, enable Stripe webhook signature verification
