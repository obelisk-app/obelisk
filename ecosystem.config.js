// PM2 ecosystem config for Obelisk production.
//
// Start both processes:   pm2 start ecosystem.config.js
// Redeploy app only:      npm run deploy   (builds then restarts obelisk-dex)
//
// Env overrides (set in .env or shell before pm2 start):
//   PORT          — Next.js port (default: 3001)
//   TUNNEL_TOKEN  — Cloudflare tunnel token

module.exports = {
  apps: [
    {
      name: 'obelisk-dex',
      script: 'npm',
      args: 'start',
      cwd: '/root/obelisk-dex',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
      },
    },
    {
      name: 'obelisk-dex-tunnel',
      script: 'bash',
      args: `-c "cloudflared tunnel run --token ${process.env.TUNNEL_TOKEN || ''} --url http://127.0.0.1:${process.env.PORT || 3001}"`,
      cwd: '/root/obelisk-dex',
      watch: false,
      env: {
        TUNNEL_TOKEN: process.env.TUNNEL_TOKEN || '',
      },
    },
  ],
};
