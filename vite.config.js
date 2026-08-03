import { execFileSync } from 'node:child_process';

import { icpBindgen } from '@icp-sdk/bindgen/plugins/vite';
import { defineConfig } from 'vite';

function getIcpDevServerConfig(environment) {
  const runIcp = args => execFileSync('icp', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  const networkStatus = JSON.parse(runIcp(['network', 'status', '-e', environment, '--json']));
  const backendId = runIcp(['canister', 'status', 'backend', '-e', environment, '-i']);
  const canisterParams = `PUBLIC_CANISTER_ID:backend=${backendId}`;
  const rootKey = networkStatus.root_key ? `&ic_root_key=${networkStatus.root_key}` : '';

  return {
    headers: {
      'Set-Cookie': `ic_env=${encodeURIComponent(`${canisterParams}${rootKey}`)}; SameSite=Lax;`,
    },
    proxy: {
      '/api': {
        target: networkStatus.api_url,
        changeOrigin: true,
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const environment = process.env.ICP_ENVIRONMENT;
  const icpDev = command === 'serve' && environment
    ? getIcpDevServerConfig(environment)
    : {};

  return {
    plugins: [
      icpBindgen({
        didFile: './src/backend/backend.did',
        outDir: './src/bindings',
      }),
    ],
    server: {
      port: 3000,
      host: true,
      strictPort: true,
      ...icpDev,
      proxy: {
        '/api-icp': {
          target: 'https://icptokens.net',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api-icp/, ''),
        },
        ...icpDev.proxy,
      },
    },
    preview: {
      allowedHosts: true,
    },
  };
});
