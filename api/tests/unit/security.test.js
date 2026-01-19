/**
 * Security Utilities Tests
 */

const {
  escapeHtml,
  isValidEmail,
  isValidPhone,
  sanitizeString,
  isValidUUID,
  sanitizeForStripeQuery
} = require('../../utils/security');

describe('Security Utilities', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      expect(escapeHtml("He said 'hello'")).toBe('He said &#039;hello&#039;');
      expect(escapeHtml('She said "hi"')).toBe('She said &quot;hi&quot;');
    });

    it('should convert non-strings to strings', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml({ foo: 'bar' })).toBe('[object Object]');
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(isValidEmail('user@subdomain.domain.org')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
      expect(isValidEmail('spaces in@email.com')).toBe(false);
    });

    it('should reject empty or non-string values', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail(123)).toBe(false);
    });

    it('should reject emails over 254 characters', () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate correct phone numbers', () => {
      expect(isValidPhone('6028331234')).toBe(true);
      expect(isValidPhone('(602) 833-1234')).toBe(true);
      expect(isValidPhone('+1 602-833-1234')).toBe(true);
      expect(isValidPhone('602.833.1234')).toBe(true);
    });

    it('should reject short phone numbers', () => {
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('123456789')).toBe(false);
    });

    it('should allow empty/null (phone is optional)', () => {
      expect(isValidPhone('')).toBe(true);
      expect(isValidPhone(null)).toBe(true);
      expect(isValidPhone(undefined)).toBe(true);
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should respect max length', () => {
      expect(sanitizeString('hello world', 5)).toBe('hello');
    });

    it('should handle empty values', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should convert numbers to strings', () => {
      expect(sanitizeString(123)).toBe('123');
    });
  });

  describe('isValidUUID', () => {
    it('should validate correct UUIDs', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
    });
  });

  describe('sanitizeForStripeQuery', () => {
    it('should remove quotes and backslashes', () => {
      expect(sanitizeForStripeQuery("test'value")).toBe('testvalue');
      expect(sanitizeForStripeQuery('test"value')).toBe('testvalue');
      expect(sanitizeForStripeQuery('test\\value')).toBe('testvalue');
    });

    it('should limit length to 100 characters', () => {
      const longString = 'a'.repeat(150);
      expect(sanitizeForStripeQuery(longString).length).toBe(100);
    });

    it('should handle empty values', () => {
      expect(sanitizeForStripeQuery('')).toBe('');
      expect(sanitizeForStripeQuery(null)).toBe('');
    });
  });
});
