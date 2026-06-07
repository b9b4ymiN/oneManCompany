import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is enabled by default in dev, this is for reference
  experimental: {
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3100/:path*',
      },
    ];
  },
};

export default nextConfig;
