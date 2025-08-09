/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
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
