import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildHeaders } from './scripts/security-headers.mjs';

/** Écrit dist/_headers (en-têtes de sécurité) à chaque build. */
function securityHeaders(env: Record<string, string>): Plugin {
  return {
    name: 'security-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: buildHeaders(env) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Chemins relatifs : le dossier dist/ fonctionne dans n'importe quel
    // sous-dossier d'un site (ex. https://mon-club.fr/finales/).
    base: './',
    plugins: [react(), tailwindcss(), securityHeaders(env)],
    build: { sourcemap: false },
  };
});
