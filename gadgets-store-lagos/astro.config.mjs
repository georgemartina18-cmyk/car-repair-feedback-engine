// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Secret keys are NOT written here. They live in the `.env` file on your
// computer and in Cloudflare's "Variables and Secrets" page when live.
const secret = (optional = true) => envField.string({ context: 'server', access: 'secret', optional });

export default defineConfig({
  site: 'https://gadgetstorelagos.com',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: { plugins: [tailwindcss()] },
  env: {
    schema: {
      SUPABASE_URL: secret(),
      SUPABASE_ANON_KEY: secret(),
      SUPABASE_SERVICE_ROLE_KEY: secret(),
    },
  },
});
