/**
 * Health Endpoint Integration Tests
 */

const request = require('supertest');
const express = require('express');
const healthRoutes = require('../../routes/health');

// Create a minimal test app
const app = express();
app.use('/api/health', healthRoutes);

describe('Health Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({ alive: true });
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready status (without database)', async () => {
      // Without Supabase configured, it should still return ready
      const response = await request(app)
        .get('/api/health/ready')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('ready', true);
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });
});
