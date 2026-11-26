module.exports = {
  apps: [{
    name: 'ws-gen',
    cwd: '/opt/ws-gen',
    script: './node_modules/vite/bin/vite.js',
    args: 'preview --host 127.0.0.1 --port 3101 --strictPort',
    interpreter: '/usr/bin/node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    max_memory_restart: '512M',
    time: true,
    env: {
      NODE_ENV: 'production',
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: 'worksheet.srv.io.vn'
    }
  }]
};
