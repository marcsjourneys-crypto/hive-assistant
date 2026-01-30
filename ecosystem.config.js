module.exports = {
  apps: [{
    name: 'hive',
    script: 'dist/cli.js',
    args: 'start --daemon --verbose',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
