import type { HealthCheckResponse, HealthStatus } from '../types/api.js';
import { cacApiService } from './cacApi.service.js';

export class HealthService {
  private startTime: number;
  private version: string;

  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResponse> {
    const checks = await this.runHealthChecks();
    const overallStatus = this.determineOverallStatus(checks);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: Date.now() - this.startTime,
      checks,
    };
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {};

    try {
      // Check CAC.gov.ng API (main search API)
      checks.externalApi = await this.checkExternalApi();
    } catch (error) {
      checks.externalApi = {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString(),
      };
    }

    try {
      // Check memory usage
      checks.memory = this.checkMemoryUsage();
    } catch (error) {
      checks.memory = {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString(),
      };
    }

    try {
      // Check disk space (simplified)
      checks.disk = this.checkDiskSpace();
    } catch (error) {
      checks.disk = {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString(),
      };
    }

    return checks;
  }

  /**
   * Check CAC.gov.ng API health (main search API)
   */
  private async checkExternalApi(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const healthStatus = await cacApiService.healthCheck();
      
      return {
        status: healthStatus.status === 'healthy' ? 'up' : 'down',
        responseTime: healthStatus.responseTime,
        message: `Circuit breaker: ${healthStatus.circuitBreakerState}`,
        lastCheck: healthStatus.lastCheck,
      };
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'API check failed',
        lastCheck: new Date().toISOString(),
      };
    }
  }

  /**
   * Check memory usage
   */
  private checkMemoryUsage(): HealthStatus {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const usagePercent = (usedMem / totalMem) * 100;

    // More reasonable thresholds for development/production environments
    // Up to 85% is healthy, 85-95% is degraded, 95%+ is down
    return {
      status: usagePercent < 85 ? 'up' : usagePercent < 95 ? 'degraded' : 'down',
      responseTime: 0,
      message: `Memory usage: ${usagePercent.toFixed(2)}% (${(usedMem / 1024 / 1024).toFixed(2)}MB / ${(totalMem / 1024 / 1024).toFixed(2)}MB)`,
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Check disk space (simplified - would need fs module in real implementation)
   */
  private checkDiskSpace(): HealthStatus {
    // In a real implementation, you would use the 'check-disk-space' package
    // or os module to check actual disk usage
    
    return {
      status: 'up',
      responseTime: 0,
      message: 'Disk space check not implemented',
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Determine overall health status based on individual checks
   */
  private determineOverallStatus(checks: HealthCheckResponse['checks']): HealthCheckResponse['status'] {
    const checkResults = Object.values(checks);
    
    if (checkResults.length === 0) {
      return 'healthy';
    }

    const hasDown = checkResults.some(check => check.status === 'down');
    const hasDegraded = checkResults.some(check => check.status === 'degraded');
    
    if (hasDown) {
      return 'unhealthy';
    } else if (hasDegraded) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Get detailed system information
   */
  getSystemInfo(): {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      cores: number;
    };
    requests: {
      total: number;
      active: number;
    };
  } {
    const os = require('os');
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000), // in seconds
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100
      },
      cpu: {
        usage: 0, // Would require OS sampling over time
        cores: os.cpus().length
      },
      requests: {
        total: 0, // Would be tracked by middleware
        active: 0  // Would be tracked by middleware
      }
    };
  }

  /**
   * Get API statistics
   */
  async getApiStatistics(): Promise<{
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    successRate: number;
    avgResponseTime: number;
    endpointStats: Array<{
      endpoint: string;
      method: string;
      calls: number;
      avgResponseTime: number;
      errorRate: number;
    }>;
  }> {
    try {
      // In a real implementation, this would query the usage records
      // For now, return placeholder data that won't cause errors
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        successRate: 0,
        avgResponseTime: 0,
        endpointStats: []
      };
    } catch (error) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        successRate: 0,
        avgResponseTime: 0,
        endpointStats: []
      };
    }
  }

  /**
   * Get readiness probe (for Kubernetes)
   */
  async getReadinessProbe(): Promise<{
    status: 'ready' | 'not_ready';
    checks: {
      externalApi: HealthStatus;
      memory: HealthStatus;
    };
  }> {
    const checks: { externalApi: HealthStatus; memory: HealthStatus } = {
      externalApi: await this.checkExternalApi(),
      memory: this.checkMemoryUsage(),
    };

    const isReady = checks.externalApi.status === 'up' && (checks.memory.status === 'up' || checks.memory.status === 'degraded');

    return {
      status: isReady ? 'ready' : 'not_ready',
      checks,
    };
  }

  /**
   * Get liveness probe (for Kubernetes)
   */
  getLivenessProbe(): {
    status: 'alive' | 'dead';
    uptime: number;
    timestamp: string;
  } {
    return {
      status: 'alive',
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const healthService = new HealthService();

export default healthService;