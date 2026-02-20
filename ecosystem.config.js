module.exports = {
  apps: [
    {
      name: 'sae-backend',
      script: 'dist/app.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
