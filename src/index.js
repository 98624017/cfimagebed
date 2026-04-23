import { createApp } from './app.js';

const app = createApp();

export default {
  async fetch(request, env, context) {
    return app.fetch(request, env, context);
  },
};

export const __testables = {
  resetState() {
    app.resetState();
  },
};
