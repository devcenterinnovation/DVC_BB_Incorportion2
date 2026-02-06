// Load and validate configuration first
import config from './config/index';

// Export for Firebase Functions (when deployed to Firebase)
export { api, healthCheck, scheduledFunction } from './index.firebase';

// Import the main Express application from app.js  
// This is the core of our server, where all routes and middleware are set up
import app from './app';

// Start the Express server
// Don't start server ONLY when running in Firebase Functions environment
// Render, local dev, and other platforms need the server to listen
if (!config.firebase.emulator && !config.firebase.config) {
  const HOST = process.env.RENDER ? '0.0.0.0' : 'localhost';
  app.listen(config.port, HOST, () => {
    console.log(`🚀 Server running on ${HOST}:${config.port}`);
    console.log(`📋 Health check: http://${HOST}:${config.port}/health`);
    console.log(`🔐 Admin login: http://${HOST}:${config.port}/api/v1/admin/auth/login`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`💾 Database: ${config.database.type}`);
  });
}