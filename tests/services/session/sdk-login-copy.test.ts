import { afterEach, describe, expect, it } from 'vitest';
import { localizeSdkLoginCopy, watchSdkLoginCopy } from '@/services/session/sdk-login-copy';
import { translator } from '@tests/support/intl';

const es = translator('es');
const en = translator('en');

function mount(html: string) {
  const overlay = document.createElement('div');
  overlay.className = 'nui-modal-overlay';
  overlay.innerHTML = `<div class="nui-modal obelisk-login-modal" role="dialog" aria-label="Sign in to Nostr">${html}</div>`;
  document.body.append(overlay);
  return overlay.querySelector<HTMLElement>('.obelisk-login-modal')!;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('localizeSdkLoginCopy', () => {
  it('rewrites text in place, keeping the nodes React holds and the spaces of a split sentence', () => {
    const modal = mount('<span class="nui-method-label">Paste private key</span><p>Back this up <strong>before</strong> you continue. Lose it and your\n identity is gone \u2014 there\'s no recovery.</p>');
    const label = modal.querySelector('.nui-method-label')!.firstChild!;
    localizeSdkLoginCopy(modal, es);
    expect(modal.querySelector('.nui-method-label')!.firstChild).toBe(label);
    expect(label.nodeValue).toBe('Pegar clave privada');
    expect(modal.querySelector('p')!.textContent).toBe(
      'Guardá una copia antes de continuar. Si la perdés, perdés tu identidad y no hay forma de recuperarla.',
    );
  });

  it('rewrites placeholders and aria-labels, the dialog itself included, and keeps the original', () => {
    const modal = mount('<input placeholder="nsec1… or 64-char hex" /><button aria-label="Close">x</button>');
    localizeSdkLoginCopy(modal, es);
    const input = modal.querySelector('input')!;
    expect(input.placeholder).toBe('nsec1… o hex de 64 caracteres');
    expect(input.dataset.obeliskSdkPlaceholder).toBe('nsec1… or 64-char hex');
    expect(modal.getAttribute('aria-label')).toBe('Conectate a Nostr');
    expect(modal.querySelector('button')!.getAttribute('aria-label')).toBe('Cerrar');
  });

  it('leaves text it does not know alone', () => {
    const modal = mount('<span>nsec1abc</span><input placeholder="Satoshi" />');
    localizeSdkLoginCopy(modal, es);
    expect(modal.querySelector('span')!.textContent).toBe('nsec1abc');
    expect(modal.querySelector('input')!.placeholder).toBe('Satoshi');
  });

  it('takes the em dashes out of the English copy too', () => {
    const modal = mount('<span>Private key (nsec) \u2014 keep secret</span><span>nsec or 64-char hex \u2014 risky in browsers</span>');
    localizeSdkLoginCopy(modal, en);
    expect(modal.textContent).not.toContain('\u2014');
    expect(modal.textContent).toContain('Private key (nsec), keep it secret');
  });
});

describe('watchSdkLoginCopy', () => {
  it('localizes a dialog that opens later and text the widget writes back, until stopped', async () => {
    const stop = watchSdkLoginCopy(es);
    const modal = mount('<button>Continue</button>');
    await Promise.resolve();
    const text = modal.querySelector('button')!.firstChild!;
    expect(text.nodeValue).toBe('Continuar');

    text.nodeValue = 'Continue';
    await Promise.resolve();
    expect(text.nodeValue).toBe('Continuar');

    stop();
    text.nodeValue = 'Continue';
    await Promise.resolve();
    expect(text.nodeValue).toBe('Continue');
  });
});
