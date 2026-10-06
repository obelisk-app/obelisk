import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import { CodedError, ERROR_CODES, codeOrMessage, errorCodeOf, isErrorCode } from '@/utils/errors/codes';
import { errorText } from '@/utils/errors/error-text';
import en from '@/i18n/messages/en/errors.json';

describe('errorCodeOf', () => {
  it('reads a CodedError, any object with a known string code, and a bare code', () => {
    expect(errorCodeOf(new CodedError('offline', 'browser offline'))).toBe('offline');
    expect(errorCodeOf(Object.assign(new Error('x'), { code: 'auth-refused' }))).toBe('auth-refused');
    expect(errorCodeOf('publish-timeout')).toBe('publish-timeout');
  });

  it('ignores unknown codes, numeric DOM codes and plain messages', () => {
    expect(errorCodeOf(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBeNull();
    expect(errorCodeOf({ code: 22 })).toBeNull();
    expect(errorCodeOf('Not logged in')).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
  });

  it('keeps the English message on the error for logs', () => {
    const err = new CodedError('not-logged-in', 'Not logged in');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not logged in');
    expect(codeOrMessage(err)).toBe('not-logged-in');
    expect(codeOrMessage(new Error('relay said no'))).toBe('relay said no');
  });

  it('lists exactly the codes the errors module has messages for', () => {
    expect([...ERROR_CODES].sort()).toEqual(Object.keys(en.codes).sort());
    expect(isErrorCode('offline')).toBe(true);
  });
});

describe('errorText', () => {
  it('translates a coded error into each language', () => {
    const err = new CodedError('not-logged-in', 'Not logged in');
    expect(errorText(translator('en'), err)).toBe('You are not logged in. Log in and try again.');
    expect(errorText(translator('es'), err)).toBe('No iniciaste sesión. Entrá y probá de nuevo.');
    expect(errorText(translator('pt'), err)).toBe('Você não está conectado. Entre e tente de novo.');
  });

  it('uses the fallback key for an uncoded error, so the screen stays in one language', () => {
    expect(errorText(translator('es'), new Error('boom'), 'errors.generic')).toBe('Algo salió mal. Probá de nuevo.');
  });

  it('shows a third party\'s own words when there is no fallback, and the generic line when there are none', () => {
    expect(errorText(translator('es'), new Error('blocked: not a member'))).toBe('blocked: not a member');
    expect(errorText(translator('pt'), new Error(''))).toBe('Algo deu errado. Tente de novo.');
    expect(errorText(translator('en'), undefined)).toBe('Something went wrong. Try again.');
  });

  it('every code resolves in every language', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const t = translator(locale);
      for (const code of ERROR_CODES) expect(errorText(t, code)).not.toContain('errors.codes');
    }
  });
});
