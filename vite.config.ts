import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Chemins relatifs : le dossier dist/ fonctionne dans n'importe quel
  // sous-dossier d'un site (ex. https://mon-club.fr/finales/).
  base: './',
  plugins: [react(), tailwindcss()],
});
