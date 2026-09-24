import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHeaders, parseOrigins } from '../scripts/security-headers.mjs';

test('en-têtes : CSP stricte avec Supabase, Turnstile et sites parents autorisés', () => {
  const h = buildHeaders({
    VITE_SUPABASE_URL: 'https://abcd.supabase.co',
    VITE_TURNSTILE_SITEKEY: '0x4AAA',
    VITE_PARENT_ORIGINS: 'https://club.fr/, http://pas-https.fr, javascript:alert(1)',
  });
  assert.match(h, /connect-src 'self' https:\/\/tablebase\.lichess\.ovh https:\/\/abcd\.supabase\.co wss:\/\/abcd\.supabase\.co/);
  assert.match(h, /script-src 'self' 'wasm-unsafe-eval' https:\/\/challenges\.cloudflare\.com;/);
  assert.match(h, /frame-ancestors 'self' https:\/\/club\.fr;/);
  assert.doesNotMatch(h, /pas-https|javascript/);
  assert.doesNotMatch(h, /unsafe-eval'[^;]*'unsafe-eval|script-src[^;]*'unsafe-inline'/);
  assert.match(h, /Strict-Transport-Security: max-age=63072000/);
  assert.doesNotMatch(h, /X-Frame-Options/);
});

test('en-têtes : sans configuration, aucune intégration externe', () => {
  const h = buildHeaders({});
  assert.match(h, /frame-ancestors 'self';/);
  assert.match(h, /X-Frame-Options: SAMEORIGIN/);
  assert.match(h, /frame-src 'none'/);
  assert.match(h, /connect-src 'self' https:\/\/tablebase\.lichess\.ovh;/);
  assert.deepEqual(parseOrigins(' https://a.fr , https://b.fr:8443/ '), ['https://a.fr', 'https://b.fr:8443']);
});
