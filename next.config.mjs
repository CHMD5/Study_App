/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships a WASM binary + fs access; it must stay outside the bundler and
  // run on the Node runtime. Bundling it produces a broken/duplicated instance.
  serverExternalPackages: ['@electric-sql/pglite', 'katex'],

  eslint: { ignoreDuringBuilds: true },

  // Source PDFs and question images are streamed through authenticated route
  // handlers, never served statically. Nothing large is imported at build time.
  experimental: {
    largePageDataBytes: 512 * 1024,
  },
};

export default nextConfig;
