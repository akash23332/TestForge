import { describe, it, expect } from 'vitest';
import { getBaseUrl, api } from '../api';

describe('Centralized API Base URL Configuration', () => {
  it('appends /api/v1 when VITE_API_URL is a base domain without path', () => {
    expect(getBaseUrl('https://testforge-api-eayz.onrender.com')).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
  });

  it('strips trailing slashes before appending /api/v1 to avoid double slashes', () => {
    expect(getBaseUrl('https://testforge-api-eayz.onrender.com/')).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
    expect(getBaseUrl('https://testforge-api-eayz.onrender.com///')).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
  });

  it('preserves existing /api/v1 without creating duplicate /api/v1/api/v1', () => {
    expect(getBaseUrl('https://testforge-api-eayz.onrender.com/api/v1')).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
    expect(getBaseUrl('https://testforge-api-eayz.onrender.com/api/v1/')).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
  });

  it('falls back strictly to Render production backend in production when VITE_API_URL is unset', () => {
    expect(getBaseUrl('', true)).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
    expect(getBaseUrl(undefined, true)).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
    expect(getBaseUrl('   ', true)).toBe(
      'https://testforge-api-eayz.onrender.com/api/v1'
    );
  });

  it('falls back to relative /api/v1 for Vite proxy in development when VITE_API_URL is unset', () => {
    expect(getBaseUrl('', false)).toBe('/api/v1');
    expect(getBaseUrl(undefined, false)).toBe('/api/v1');
  });

  it('supports explicit localhost development override', () => {
    expect(getBaseUrl('http://localhost:5001', false)).toBe(
      'http://localhost:5001/api/v1'
    );
    expect(getBaseUrl('http://localhost:5001/api/v1', false)).toBe(
      'http://localhost:5001/api/v1'
    );
  });

  it('instantiates axios with a non-empty string baseURL', () => {
    expect(api.defaults.baseURL).toBeDefined();
    expect(typeof api.defaults.baseURL).toBe('string');
    expect(api.defaults.baseURL.length).toBeGreaterThan(0);
  });
});
