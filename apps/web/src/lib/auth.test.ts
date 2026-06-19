import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_COOKIE_NAME, AUTH_TOKEN_STORAGE_KEY, clearAuthStorage } from './auth';

describe('clearAuthStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retire le token legacy du localStorage', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-123');
    clearAuthStorage();
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('expire le cookie de session legacy', () => {
    document.cookie = `${AUTH_COOKIE_NAME}=tok-123; path=/`;
    clearAuthStorage();
    expect(document.cookie).not.toContain('tok-123');
  });

  it('ne lève pas si rien à nettoyer', () => {
    expect(() => clearAuthStorage()).not.toThrow();
  });
});
