module.exports = {
  apps: [
    {
      name: "myapp",
      cwd: "/var/www/myapp",
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production" }
    }
  ]
};
