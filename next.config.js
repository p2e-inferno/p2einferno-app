/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  
  compiler: {
    // Remove console logs in production only
    removeConsole: process.env.NODE_ENV === "production",
  },
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
        port: '',
        pathname: '/v1/create-qr-code/**',
      },
      {
        protocol: 'https',
        hostname: 'zbgeglcumaaqrxcncrhn.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },
  turbopack: {
    rules: {
      // Ignore problematic worker files (equivalent to your webpack config)
      '**/HeartbeatWorker.js': {
        loaders: ['ignore-loader'],
      },
    },
  },
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          // CSP enforcement mode
          // {
          //   key: 'Content-Security-Policy',
          //   value: buildCsp()
          // },
          // Existing security headers
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // New hardening headers
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          // CSP reporting endpoint configuration
          {
            key: 'Reporting-Endpoints',
            value: 'default="/api/security/csp-report"',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude problematic worker files from build
      config.module.rules.push({
        test: /HeartbeatWorker\.js$/,
        use: 'ignore-loader'
      });
    }
    return config;
  },
  async redirects() {
    return [
      // Redirect old routes to new nested structure
      {
        source: "/infernal-lobby",
        destination: "/lobby",
        permanent: true,
      },
      {
        source: "/events",
        destination: "/lobby/events",
        permanent: true,
      },
      {
        source: "/quests",
        destination: "/lobby/quests",
        permanent: true,
      },
      {
        source: "/bounties",
        destination: "/lobby/bounties",
        permanent: true,
      },
      {
        source: "/achievements",
        destination: "/lobby/achievements",
        permanent: true,
      },
      {
        source: "/dashboard",
        destination: "/lobby",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
