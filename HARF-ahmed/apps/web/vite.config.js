import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default defineConfig(({ mode, command }) => {
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, repositoryRoot, '');
  const appOrigin = new URL(env.APP_ORIGIN || 'http://localhost:5173');
  const apiTarget = env.VITE_DEV_API_TARGET;
  const keyFile = env.VITE_HTTPS_KEY_FILE?.trim();
  const certificateFile = env.VITE_HTTPS_CERT_FILE?.trim();
  let https;

  if (command === 'serve' && Boolean(keyFile) !== Boolean(certificateFile)) {
    throw new Error('Set both VITE_HTTPS_KEY_FILE and VITE_HTTPS_CERT_FILE to enable HTTPS testing.');
  }
  if (command === 'serve' && keyFile && certificateFile) {
    https = {
      key: readFileSync(path.resolve(repositoryRoot, keyFile)),
      cert: readFileSync(path.resolve(repositoryRoot, certificateFile))
    };
  }
  if (command === 'serve' && appOrigin.protocol === 'https:' && !https) {
    throw new Error('APP_ORIGIN uses HTTPS; configure both VITE_HTTPS_KEY_FILE and VITE_HTTPS_CERT_FILE.');
  }
  if (command === 'serve' && appOrigin.protocol !== 'https:' && https) {
    throw new Error('APP_ORIGIN must use HTTPS when local HTTPS certificates are configured.');
  }

  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    envDir: repositoryRoot,
    publicDir: false,
    plugins: [react()],
    server: {
      host: appOrigin.hostname,
      port: Number(appOrigin.port || (appOrigin.protocol === 'https:' ? 443 : 80)),
      strictPort: true,
      https,
      proxy: apiTarget
        ? {
            '/api': {
              target: apiTarget,
              changeOrigin: true
            }
          }
        : undefined
    }
  };
});
