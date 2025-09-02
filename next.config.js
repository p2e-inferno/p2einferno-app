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
    const buildCsp = () => {
      const directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        `script-src 'self' https://challenges.cloudflare.com https://js.paystack.co${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://*.supabase.co https://api.paystack.co https://pulse.walletconnect.org https://api.web3modal.org https://sepolia.base.org https://mainnet.base.org",
        "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
        "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://checkout.paystack.com https://js.paystack.co https://*.paystack.com",
        "worker-src 'self'",
        "manifest-src 'self'",
        // CSP reporting directives
        "report-uri /api/security/csp-report",
        "report-to default"
      ];
      return directives.join("; ");
    };

    return [
      {
        source: '/(.*)',
        headers: [
          // CSP enforcement mode
          {
            key: 'Content-Security-Policy',
            value: buildCsp()
          },
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
