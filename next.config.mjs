/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships a WASM binary + fs access; it must stay outside the bundler and
  // run on the Node runtime. Bundling it produces a broken/duplicated instance.
  serverExternalPackages: ['@electric-sql/pglite', 'katex'],

  // Lint runs on build again. It had been off with no config file present,
  // which is how ~60 unused imports and two stale-closure effect bugs shipped
  // (react-hooks/exhaustive-deps flags both). See eslint.config.mjs.
  eslint: { dirs: ['src'] },

  // Source PDFs and question images are streamed through authenticated route
  // handlers, never served statically. Nothing large is imported at build time.
  experimental: {
    largePageDataBytes: 512 * 1024,
  },

  async redirects() {
    return [
      {
        source: '/srsma',
        destination: '/SRSMA',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
