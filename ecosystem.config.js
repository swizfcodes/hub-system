module.exports = {
  apps: [
    {
      name: "hub-api",
      script: "server.js",
      cwd: "/var/www/hub-system",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "/var/www/hub-system/logs/error.log",
      out_file: "/var/www/hub-system/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: "1G",
      restart_delay: 5000,
      watch: false,
    },
  ],
};
