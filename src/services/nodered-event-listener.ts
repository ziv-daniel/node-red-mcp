/**
 * Node-RED Event Listener Service
 * Captures real-time events from Node-RED and forwards them through SSE
 */

import { SSEHandler } from '../server/sse-handler.js';
import {
  NodeRedEvent,
  NodeRedFlowEvent,
  NodeRedNodeEvent,
  NodeRedRuntimeEvent,
  NodeRedErrorEvent,
  NodeRedStatusEvent,
} from '../types/nodered.js';

import { NodeRedAPIClient } from './nodered-api.js';

export class NodeRedEventListener {
  private sseHandler: SSEHandler;
  private nodeRedClient: NodeRedAPIClient;
  private eventPollingInterval?: NodeJS.Timeout | undefined;
  private isMonitoring = false;
  private lastEventTimestamp: number = Date.now();

  constructor(sseHandler: SSEHandler, nodeRedClient: NodeRedAPIClient) {
    this.sseHandler = sseHandler;
    this.nodeRedClient = nodeRedClient;
  }

  /**
   * Start monitoring Node-RED events
   */
  startEventMonitoring(intervalMs = 5000): void {
    if (this.isMonitoring) {
      console.log('Node-RED event monitoring already started');
      return;
    }

    console.log(`Starting Node-RED event monitoring (interval: ${intervalMs}ms)`);
    this.isMonitoring = true;

    // Poll for runtime status changes
    this.eventPollingInterval = setInterval(async () => {
      try {
        await this.checkRuntimeEvents();
        await this.checkFlowEvents();
      } catch (error) {
        console.error('Error checking Node-RED events:', error);
        this.broadcastError(
          'Failed to check Node-RED events',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }, intervalMs);

    // Send initial runtime event
    this.broadcastRuntimeEvent('start', 'Node-RED event monitoring started');
  }

  /**
   * Stop monitoring Node-RED events
   */
  stopEventMonitoring(): void {
    if (!this.isMonitoring) return;

    console.log('Stopping Node-RED event monitoring');
    this.isMonitoring = false;

    if (this.eventPollingInterval) {
      clearInterval(this.eventPollingInterval);
      this.eventPollingInterval = undefined;
    }

    this.broadcastRuntimeEvent('stop', 'Node-RED event monitoring stopped');
  }

  /**
   * Check for runtime status changes
   */
  private async checkRuntimeEvents(): Promise<void> {
    try {
      const health = await this.nodeRedClient.healthCheck();

      // Broadcast system status if it changed
      const statusEvent: NodeRedRuntimeEvent = {
        type: 'runtime',
        timestamp: new Date().toISOString(),
        data: {
          event: health.healthy ? 'start' : 'error',
          message: health.healthy ? 'Node-RED is running' : 'Node-RED connection error',
          memory: process.memoryUsage(),
        },
      };

      this.sseHandler.broadcast(statusEvent);
    } catch (error) {
      this.broadcastError(
        'Runtime health check failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Check for flow-related events
   */
  private async checkFlowEvents(): Promise<void> {
    try {
      // For now, we'll simulate flow events based on API calls
      // In a real implementation, this would connect to Node-RED's event system

      // Check if flows have been deployed recently
      const flows = await this.nodeRedClient.getFlows();
      const currentTimestamp = Date.now();

      // Simple heuristic: if we can successfully get flows, consider it a "running" state
      const flowEvent: NodeRedFlowEvent = {
        type: 'flow',
        timestamp: new Date().toISOString(),
        data: {
          id: 'global',
          event: 'start',
          message: `${flows.length} flows are active`,
        },
      };

      // Only broadcast if significant time has passed since last event
      if (currentTimestamp - this.lastEventTimestamp > 60000) {
        // 1 minute
        this.sseHandler.broadcast(flowEvent);
        this.lastEventTimestamp = currentTimestamp;
      }
    } catch (error) {
      const errorEvent: NodeRedFlowEvent = {
        type: 'flow',
        timestamp: new Date().toISOString(),
        data: {
          id: 'global',
          event: 'error',
          message: 'Failed to get flow status',
        },
      };
      this.sseHandler.broadcast(errorEvent);
    }
  }

  /**
   * Broadcast Node-RED runtime event
   */
  private broadcastRuntimeEvent(
    event: 'start' | 'stop' | 'restart' | 'error',
    message: string
  ): void {
    const runtimeEvent: NodeRedRuntimeEvent = {
      type: 'runtime',
      timestamp: new Date().toISOString(),
      data: {
        event,
        message,
        memory: process.memoryUsage(),
      },
    };

    this.sseHandler.broadcast(runtimeEvent);
  }

  /**
   * Broadcast error event
   */
  private broadcastError(error: string, details?: string): void {
    const errorEvent: NodeRedErrorEvent = {
      type: 'error',
      timestamp: new Date().toISOString(),
      data: {
        error,
        source: {
          id: 'event-listener',
          type: 'service',
          name: 'NodeRedEventListener',
        },
      },
    };

    this.sseHandler.broadcast(errorEvent);
    console.error(`Node-RED Event Error: ${error}`, details);
  }

  /**
   * Manually trigger flow deploy event
   */
  onFlowDeploy(flowId?: string): void {
    const deployEvent: NodeRedFlowEvent = {
      type: 'flow',
      timestamp: new Date().toISOString(),
      data: {
        id: flowId || 'global',
        event: 'deploy',
        message: flowId ? `Flow ${flowId} deployed` : 'All flows deployed',
      },
    };

    this.sseHandler.broadcast(deployEvent);
  }

  /**
   * Manually trigger node status event
   */
  onNodeStatus(nodeId: string, status: { fill?: string; shape?: string; text?: string }): void {
    const statusEvent: NodeRedStatusEvent = {
      type: 'status',
      timestamp: new Date().toISOString(),
      data: {
        id: nodeId,
        status: {
          fill: status.fill as any,
          shape: status.shape as any,
          text: status.text ?? undefined,
        },
      },
    };

    this.sseHandler.broadcast(statusEvent);
  }

  /**
   * Get monitoring status
   */
  getStatus(): { isMonitoring: boolean; lastEventTimestamp: number } {
    return {
      isMonitoring: this.isMonitoring,
      lastEventTimestamp: this.lastEventTimestamp,
    };
  }
}
