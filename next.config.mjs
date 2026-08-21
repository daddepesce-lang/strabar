/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // File di verifica per i deep link delle app native (App Links / Universal Links).
      // Sono route handler statiche invece di file in /public: così il JSON esce col
      // Content-Type che Android e Apple si aspettano, e le impronte/Team ID arrivano
      // dalle env var invece di stare hardcoded nel repo.
      { source: '/.well-known/assetlinks.json', destination: '/api/well-known/assetlinks' },
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/well-known/apple-app-site-association',
      },
    ];
  },
};

export default nextConfig;
