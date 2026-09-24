// En-têtes de sécurité HTTP du site, générés au build à partir de la
// configuration (.env.production). Produit dist/_headers, format lu par
// Cloudflare Pages et Netlify.

/** Liste d'origines https valides, séparées par des virgules. */
export function parseOrigins(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
}

export function buildHeaders(env) {
  const supabase = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.VITE_SUPABASE_URL ?? '') ? env.VITE_SUPABASE_URL : null;
  const turnstile = env.VITE_TURNSTILE_SITEKEY ? 'https://challenges.cloudflare.com' : null;
  const parents = parseOrigins(env.VITE_PARENT_ORIGINS);
  const join = (...xs) => xs.filter(Boolean).join(' ');

  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' : nécessaire au moteur Stockfish (WebAssembly), n'autorise PAS eval() en JavaScript.
    `script-src ${join("'self'", "'wasm-unsafe-eval'", turnstile)}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${join("'self'", 'https://tablebase.lichess.ovh', supabase, supabase && supabase.replace('https://', 'wss://'))}`,
    "worker-src 'self'",
    `frame-src ${turnstile ?? "'none'"}`,
    `frame-ancestors ${join("'self'", ...parents)}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  const common = [
    `Content-Security-Policy: ${csp}`,
    'Strict-Transport-Security: max-age=63072000; includeSubDomains',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: no-referrer',
    'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy: same-origin',
    'Cross-Origin-Resource-Policy: same-origin',
    ...(parents.length ? [] : ['X-Frame-Options: SAMEORIGIN']),
  ];
  return [
    '/*',
    ...common.map((h) => `  ${h}`),
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}
