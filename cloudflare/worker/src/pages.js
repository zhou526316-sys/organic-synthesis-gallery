import worker from './index.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
      return worker.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
