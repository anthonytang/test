/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Transpile workspace packages to enable proper TypeScript resolution
  transpilePackages: [
    '@studio/api',
    '@studio/auth',
    '@studio/core',
    '@studio/notifications',
    '@studio/projects',
    '@studio/results',
    '@studio/storage',
    '@studio/templates',
    '@studio/ui',
  ],
  experimental: {
    serverComponentsExternalPackages: ['fs', 'path']
  },
  // Only use standalone for production builds
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),

  // Security headers for OAuth popups
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups'  // Allows OAuth popups without COOP errors
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none'  // Allows embedding of external content
          }
        ]
      }
    ]
  },

  webpack: (config) => {
    config.node = {
      __dirname: true,
      __filename: true,
    };

    // Optimize webpack caching
    config.cache = {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename]
      },
      cacheDirectory: path.resolve(__dirname, '.next/cache/webpack')
    };

    return config;
  },
};

module.exports = nextConfig
