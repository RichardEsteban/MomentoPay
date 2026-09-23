import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // La web reutiliza la regla de decisión del agente y los datos de deployments/.
  server: { fs: { allow: ['..'] } },
  build: { chunkSizeWarningLimit: 1500 },
});
