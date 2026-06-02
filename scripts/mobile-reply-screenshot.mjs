import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.env.OUT_DIR || '/root/obelisk-qa/mobile-reply-layout';
await mkdir(outDir, { recursive: true });

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Obelisk mobile reply layout repro</title>
<link rel="stylesheet" href="file://${path.resolve('src/app/app/mobile/mobile-shell.css')}" />
<style>
  html, body { margin: 0; min-height: 100%; background: #050505; font-family: Inter, system-ui, sans-serif; }
  .screen { width: 390px; height: 844px; margin: 0 auto; position: relative; overflow: hidden; }
  .messages { padding: 14px 12px 96px; display: flex; flex-direction: column; gap: 14px; }
  .mock-header { padding: 14px 14px 10px; border-bottom: 1px solid var(--app-line); color: var(--app-text); font-weight: 700; }
</style>
</head>
<body>
<div class="obelisk-mobile">
  <div class="screen channel-screen active" data-screen="channel">
    <div class="mock-header"># general · mobile reply repro</div>
    <div class="messages">
      <div class="msg" data-msg-id="parent">
        <div class="msg-ava">FA</div>
        <div class="msg-body">
          <div class="msg-head">
            <span class="msg-name">Fabricio Acosta</span>
            <span class="msg-time">12:01</span>
            <button class="msg-more" aria-label="Message actions"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>
          </div>
          <div class="msg-text">Parent message with enough content to be quoted by the reply preview.</div>
        </div>
      </div>
      <div class="msg" data-msg-id="reply-long-name">
        <div class="msg-ava">TX</div>
        <div class="msg-body">
          <button type="button" class="msg-reply-row">
            <span class="msg-reply-arrow">↩</span>
            <span class="msg-reply-name">Extremely Long Sender Name That Used To Crush The Row And Push Everything Down On Small Screens</span>
            <span class="msg-reply-text">A very long quoted reply preview with links https://obelisk.ar/super/long/path and unbroken nostr identifiers npub1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
          </button>
          <div class="msg-head">
            <span class="msg-name">Another Ridiculously Long Sender Name That Should Truncate Instead Of Distorting Mobile Layout</span>
            <span class="msg-time">12:02</span>
            <button class="msg-more" aria-label="Message actions"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>
          </div>
          <div class="msg-text">This reply row should stay one line, the sender name should truncate, and the message head should not get shoved down weirdly.</div>
          <div class="reactions"><button class="reaction mine">🔥 3</button><button class="reaction">⚡ 1</button></div>
        </div>
      </div>
    </div>
    <div class="composer">
      <div class="composer-reply">
        <div class="composer-reply-info">
          <span class="composer-reply-label">Replying to <span class="composer-reply-author">Absurdly Long Composer Reply Author Name That Must Not Break The Composer</span></span>
          <span class="composer-reply-text">Long composer quoted text should truncate, not shove buttons or input around.</span>
        </div>
        <button class="composer-reply-close" aria-label="Cancel reply"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="composer-inner"><button class="composer-attach">+</button><input class="composer-input" value="" placeholder="Message #general" /><button class="composer-send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 14-7-7 14-2-5-5-2z"/></svg></button></div>
    </div>
  </div>
</div>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: path.join(outDir, 'mobile-reply-layout-repro.png'), fullPage: true });
const metrics = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, top: r.top, left: r.left, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  };
  return {
    replyRow: pick('.msg-reply-row'),
    replyName: pick('.msg-reply-name'),
    replyText: pick('.msg-reply-text'),
    msgHead: pick('#dummy'),
    composerReply: pick('.composer-reply'),
    composerAuthor: pick('.composer-reply-author'),
    screenWidth: window.innerWidth,
  };
});
console.log(JSON.stringify({ outDir, screenshot: path.join(outDir, 'mobile-reply-layout-repro.png'), metrics }, null, 2));
await browser.close();
