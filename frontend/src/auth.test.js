import { describe, expect, it } from 'vitest';

import { authErrorMessage } from './auth.js';

describe('authErrorMessage', () => {
  it('does not reveal whether the email or password was wrong', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe('The email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/user-not-found' })).toBe('The email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toBe('The email or password is incorrect.');
  });

  it('explains when Firebase email/password is not enabled', () => {
    expect(authErrorMessage({ code: 'auth/operation-not-allowed' })).toContain('not enabled');
  });

  it('preserves the safe verification guidance created by the adapter', () => {
    expect(authErrorMessage({ code: 'auth/email-not-verified', message: 'Verify your email before signing in.' }))
      .toBe('Verify your email before signing in.');
  });

  it('turns network failures into actionable guidance', () => {
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toContain('connection');
  });

  it('falls back to a supplied safe message', () => {
    expect(authErrorMessage({ code: 'auth/unknown', message: 'Try again.' })).toBe('Try again.');
  });

  it('explains the storage-partitioned redirect failure with a way forward', () => {
    const message = 'Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared.';
    expect(authErrorMessage({ code: 'auth/internal-error', message })).toContain('Chrome/Safari');
    expect(authErrorMessage({ code: 'auth/redirect-cancelled-by-user' })).toContain('email & password');
  });
});
