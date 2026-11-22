import { createServerApp } from '../apps/api/src/server.js';

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = createServerApp({ startExpiryWorker: false }).then(({ app }) => app);
  }
  return appPromise;
}

export default async function handler(request, response) {
  try {
    const app = await getApp();
    return app(request, response);
  } catch (error) {
    console.error('Harf API initialization failed.', {
      name: error?.name,
      message: error?.message
    });
    return response.status(500).json({
      error: {
        code: 'API_INITIALIZATION_FAILED',
        message: 'The API is temporarily unavailable.'
      }
    });
  }
}
