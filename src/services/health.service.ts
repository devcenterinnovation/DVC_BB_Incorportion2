import type { HealthCheckResponse, HealthStatus } from '../types/api';
import { cacApiService } from './cacApi.service';

export class HealthService {
  private startTime: number;
  private version: string;
  private lastCpuUsage: NodeJS.CpuUsage;
  private lastCpuCheck: number;
  private cachedCpuPercent: number;

  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = Date.now();
    this.cachedCpuPercent = 0;
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
   * Calculate CPU usage percentage
   */
  private calculateCpuUsage(): number {
    const now = Date.now();
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    
    // Calculate time elapsed in microseconds
    const elapsedTime = (now - this.lastCpuCheck) * 1000;
    
    if (elapsedTime > 0) {
      // Total CPU time used (user + system) in microseconds
      const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system;
      
      // Calculate CPU percentage (total CPU time / elapsed time)
      const cpuPercent = (totalCpuTime / elapsedTime) * 100;
      
      // Update cache
      this.cachedCpuPercent = Math.min(100, Math.max(0, cpuPercent));
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuCheck = now;
    }
    
    return this.cachedCpuPercent;
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
        usage: this.calculateCpuUsage(),
        cores: os.cpus().length
      },
      requests: {
        total: 0, // TODO: Would be tracked by middleware
        active: 0  // TODO: Would be tracked by middleware
      }
    };
  }

  /**
   * Get API statistics from actual usage data
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
      const { database } = await import('../database/index');
      
      // Get all customers to aggregate their usage
      const { customers } = await database.listCustomers({});
      
      // Collect all usage records
      const allUsageRecords = [];
      for (const customer of customers) {
        try {
          const records = await database.getUsage(customer.id);
          allUsageRecords.push(...records);
        } catch (error) {
          // Skip customer if usage data unavailable
          continue;
        }
      }
      
      if (allUsageRecords.length === 0) {
        return {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          successRate: 0,
          avgResponseTime: 0,
          endpointStats: []
        };
      }
      
      // Calculate aggregate stats
      const totalCalls = allUsageRecords.length;
      const successfulCalls = allUsageRecords.filter(r => r.statusCode >= 200 && r.statusCode < 400).length;
      const failedCalls = allUsageRecords.filter(r => r.statusCode >= 400).length;
      const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;
      const avgResponseTime = totalCalls > 0 
        ? allUsageRecords.reduce((sum, r) => sum + r.responseTimeMs, 0) / totalCalls 
        : 0;
      
      // Calculate endpoint statistics
      const endpointMap = new Map<string, {
        calls: number;
        totalResponseTime: number;
        errors: number;
        method: string;
      }>();
      
      for (const record of allUsageRecords) {
        const key = `${record.method}:${record.endpoint}`;
        const existing = endpointMap.get(key) || {
          calls: 0,
          totalResponseTime: 0,
          errors: 0,
          method: record.method
        };
        
        existing.calls++;
        existing.totalResponseTime += record.responseTimeMs;
        if (record.statusCode >= 400) {
          existing.errors++;
        }
        
        endpointMap.set(key, existing);
      }
      
      // Convert to array and sort by call count
      const endpointStats = Array.from(endpointMap.entries())
        .map(([key, data]) => ({
          endpoint: key.split(':')[1],
          method: data.method,
          calls: data.calls,
          avgResponseTime: data.calls > 0 ? data.totalResponseTime / data.calls : 0,
          errorRate: data.calls > 0 ? data.errors / data.calls : 0
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 10); // Top 10 endpoints
      
      return {
        totalCalls,
        successfulCalls,
        failedCalls,
        successRate,
        avgResponseTime,
        endpointStats
      };
    } catch (error) {
      console.error('Failed to get API statistics:', error);
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