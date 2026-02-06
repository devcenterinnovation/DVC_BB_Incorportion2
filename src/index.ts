// Load and validate configuration first
import config from './config/index';

// Export for Firebase Functions (when deployed to Firebase)
export { api, healthCheck, scheduledFunction } from './index.firebase';

// Import the main Express application from app.js  
// This is the core of our server, where all routes and middleware are set up
import app from './app';

// Start the Express server (for local development only)
// Don't start server when running in Firebase Functions environment
if (!config.isProduction && !config.firebase.emulator && !config.firebase.config) {
  app.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port}`);
    console.log(`📋 Health check: http://localhost:${config.port}/health`);
    console.log(`🔐 Admin login: http://localhost:${config.port}/api/v1/admin/auth/login`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
  });
}