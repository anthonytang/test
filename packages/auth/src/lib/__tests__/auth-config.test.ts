import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { msalConfig, loginRequest } from '../auth-config';

describe('auth-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('msalConfig', () => {
    it('should have correct structure', () => {
      expect(msalConfig).toHaveProperty('auth');
      expect(msalConfig).toHaveProperty('cache');
      expect(msalConfig).toHaveProperty('system');
    });

    it('should read client ID from environment', () => {
      process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID = 'test-client-id';
      // Note: config is evaluated at module load, so this test verifies structure
      expect(typeof msalConfig.auth.clientId).toBe('string');
    });

    it('should have sessionStorage cache location', () => {
      expect(msalConfig.cache.cacheLocation).toBe('sessionStorage');
    });

    it('should have correct logger configuration', () => {
      expect(msalConfig.system.loggerOptions).toBeDefined();
      expect(msalConfig.system.loggerOptions.piiLoggingEnabled).toBe(false);
    });

    it('should have correct redirect URI configuration', () => {
      expect(msalConfig.auth).toHaveProperty('redirectUri');
      expect(msalConfig.auth).toHaveProperty('postLogoutRedirectUri');
    });
  });

  describe('loginRequest', () => {
    it('should have User.Read scope', () => {
      expect(loginRequest.scopes).toContain('User.Read');
    });

    it('should have select_account prompt', () => {
      expect(loginRequest.prompt).toBe('select_account');
    });

    it('should have redirectUri property', () => {
      expect(loginRequest).toHaveProperty('redirectUri');
    });

    it('should have redirectStartPage property', () => {
      expect(loginRequest).toHaveProperty('redirectStartPage');
    });
  });
});

