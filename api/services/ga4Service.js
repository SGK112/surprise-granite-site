/**
 * SURPRISE GRANITE - GA4 Analytics Service
 * Uses Google Analytics Data API with Service Account auth
 * Provides server-side GA4 data with in-memory caching
 */

const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// In-memory cache (5 minute TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Initialize client from env
let analyticsClient = null;
let propertyId = null;

function getClient() {
  if (analyticsClient) return analyticsClient;

  const json = process.env.GA4_SERVICE_ACCOUNT_JSON;
  propertyId = process.env.GA4_PROPERTY_ID;

  if (!json || !propertyId) {
    return null;
  }

  try {
    const credentials = JSON.parse(json);
    analyticsClient = new BetaAnalyticsDataClient({ credentials });
    return analyticsClient;
  } catch (err) {
    console.error('GA4 Service: Failed to parse service account JSON:', err.message);
    return null;
  }
}

function getPropertyPath() {
  return `properties/${propertyId}`;
}

// Helper to format duration in seconds to readable string
function formatDuration(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remaining = s % 60;
  return `${m}m ${remaining}s`;
}

/**
 * Get traffic overview: sessions, pageviews, users, bounce rate, avg session duration
 */
async function getTrafficOverview(startDate = '30daysAgo', endDate = 'today') {
  const cacheKey = `overview:${startDate}:${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  const [response] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'engagedSessions' }
    ]
  });

  const row = response.rows?.[0];
  if (!row) return null;

  const result = {
    sessions: parseInt(row.metricValues[0].value) || 0,
    pageViews: parseInt(row.metricValues[1].value) || 0,
    totalUsers: parseInt(row.metricValues[2].value) || 0,
    newUsers: parseInt(row.metricValues[3].value) || 0,
    bounceRate: (parseFloat(row.metricValues[4].value) * 100).toFixed(1),
    avgSessionDuration: formatDuration(parseFloat(row.metricValues[5].value)),
    avgSessionDurationRaw: parseFloat(row.metricValues[5].value),
    engagedSessions: parseInt(row.metricValues[6].value) || 0
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Get realtime active users
 */
async function getRealtimeActiveUsers() {
  const cacheKey = 'realtime';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  try {
    const [response] = await client.runRealtimeReport({
      property: getPropertyPath(),
      metrics: [{ name: 'activeUsers' }]
    });

    const result = {
      activeUsers: parseInt(response.rows?.[0]?.metricValues?.[0]?.value) || 0
    };

    // Shorter cache for realtime (30 seconds)
    cache.set('realtime', { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error('GA4 realtime error:', err.message);
    return { activeUsers: 0 };
  }
}

/**
 * Get top pages by views
 */
async function getTopPages(startDate = '30daysAgo', endDate = 'today', limit = 10) {
  const cacheKey = `pages:${startDate}:${endDate}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  const [response] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'totalUsers' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' }
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit
  });

  const result = (response.rows || []).map(row => ({
    path: row.dimensionValues[0].value,
    views: parseInt(row.metricValues[0].value) || 0,
    users: parseInt(row.metricValues[1].value) || 0,
    avgDuration: formatDuration(parseFloat(row.metricValues[2].value)),
    bounceRate: (parseFloat(row.metricValues[3].value) * 100).toFixed(1)
  }));

  setCache(cacheKey, result);
  return result;
}

/**
 * Get traffic sources breakdown
 */
async function getTrafficSources(startDate = '30daysAgo', endDate = 'today') {
  const cacheKey = `sources:${startDate}:${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  const [response] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
  });

  const result = (response.rows || []).map(row => ({
    channel: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value) || 0,
    users: parseInt(row.metricValues[1].value) || 0
  }));

  setCache(cacheKey, result);
  return result;
}

/**
 * Get conversion/key events
 */
async function getConversionEvents(startDate = '30daysAgo', endDate = 'today') {
  const cacheKey = `conversions:${startDate}:${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  const [response] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 15
  });

  const result = (response.rows || []).map(row => ({
    event: row.dimensionValues[0].value,
    count: parseInt(row.metricValues[0].value) || 0,
    users: parseInt(row.metricValues[1].value) || 0
  }));

  setCache(cacheKey, result);
  return result;
}

/**
 * Get user demographics (device category + city)
 */
async function getUserDemographics(startDate = '30daysAgo', endDate = 'today') {
  const cacheKey = `demographics:${startDate}:${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  // Device categories
  const [deviceResponse] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
  });

  // Top cities
  const [cityResponse] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'city' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10
  });

  const result = {
    devices: (deviceResponse.rows || []).map(row => ({
      device: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value) || 0,
      users: parseInt(row.metricValues[1].value) || 0
    })),
    cities: (cityResponse.rows || []).map(row => ({
      city: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value) || 0,
      users: parseInt(row.metricValues[1].value) || 0
    }))
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Get daily time series data for charts
 */
async function getDailyTimeSeries(startDate = '30daysAgo', endDate = 'today') {
  const cacheKey = `timeseries:${startDate}:${endDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return null;

  const [response] = await client.runReport({
    property: getPropertyPath(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' }
    ],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
  });

  const result = (response.rows || []).map(row => {
    const d = row.dimensionValues[0].value;
    return {
      date: `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`,
      sessions: parseInt(row.metricValues[0].value) || 0,
      users: parseInt(row.metricValues[1].value) || 0,
      pageViews: parseInt(row.metricValues[2].value) || 0
    };
  });

  setCache(cacheKey, result);
  return result;
}

module.exports = {
  getTrafficOverview,
  getRealtimeActiveUsers,
  getTopPages,
  getTrafficSources,
  getConversionEvents,
  getUserDemographics,
  getDailyTimeSeries
};
