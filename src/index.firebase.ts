/**
 * Firebase Functions Entry Point
 * Exports the Express app as a Firebase Function
 */

import * as functions from 'firebase-functions';
import app from './app.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// Export the Express app as a Firebase Function
export const api = functions.https.onRequest(app);

// Optional: Export other Firebase Functions
export const scheduledFunction = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'UTC' },
  async (event) => {
    // Daily maintenance tasks
    console.log('Running daily maintenance...');
  
    // Example: Clean up old usage records
    // Example: Send usage reports
    // Example: Check for expired API keys
  
    return;
  });

// Health check function (optional)
export const healthCheck = functions.https.onRequest(async (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    version: '1.0.0'
  });
});