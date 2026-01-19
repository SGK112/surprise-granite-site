/**
 * Surprise Granite API - Modular Server Example
 *
 * This file shows how to refactor server.js to use modular imports.
 * Copy relevant sections to server.js gradually.
 */

const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/.env', override: true });

// Import utilities
const logger = require('./utils/logger');
const { handleApiError } = require('./utils/security');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { aiRateLimiter, leadRateLimiter, emailRateLimiter } = require('./middleware/rateLimiter');

// Import routes
const healthRoutes = require('./routes/health');
const leadRoutes = require('./routes/leads');
// const customerRoutes = require('./routes/customers');
// const invoiceRoutes = require('./routes/invoices');
// const productRoutes = require('./routes/products');

// Import services
const emailService = require('./services/emailService');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
app.set('stripe', stripe);

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;
app.set('supabase', supabase);

// Environment-based CORS
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigins = isProduction
  ? ['https://www.surprisegranite.com', 'https://surprisegranite.com']
  : ['http://localhost:3000', 'http://localhost:8888', 'http://127.0.0.1:5500'];

// Middleware
app.use(cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.request(req);
  next();
});

// Mount routes
app.use('/api/health', healthRoutes);
app.use('/api/leads', leadRoutes);
// app.use('/api/customers', customerRoutes);
// app.use('/api/invoices', invoiceRoutes);
// app.use('/api/products', productRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server started`, { port: PORT, env: process.env.NODE_ENV || 'development' });
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
