// PM2 ecosystem config for Obelisk production.
//
// Start the app:          pm2 start ecosystem.config.js
// Redeploy app only:      npm run deploy   (tests, builds, restarts, health-checks obelisk-dex)
//
// Env overrides (set in the shell before `pm2 start`, then `pm2 save`):
//   PORT          : Next.js port (default: 3001). Used for both the `-p`
//                   argument and the PORT env, so the two cannot disagree.
//
// Logs go to pm2's default ~/.pm2/logs/obelisk-dex-{out,error}.log and
// grow without bound; pm2 cannot rotate them from this file. Install the
// rotation module once on the box: `pm2 install pm2-logrotate`.

const PORT = Number(process.env.PORT) || 3001;

module.exports = {
  apps: [
    {
      name: 'obelisk-dex',
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${PORT} -H 127.0.0.1`,
      cwd: '/root/obelisk-dex',
      watch: false,
      // A build that dies on boot used to be respawned as fast as pm2 could
      // fork it, pegging the box and burying the real error under restart
      // noise. Back off (1s, 2s, 4s, ... capped at 15s) and give up after ten
      // short-lived starts so `pm2 status` shows "errored" instead of a
      // climbing restart counter.
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
      // SIGTERM, then SIGKILL after 5s. Next shuts down cleanly on SIGTERM.
      kill_timeout: 5000,
      // Timestamp every log line; pm2's default lines carry no time.
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
      },
    },
  ],
};
