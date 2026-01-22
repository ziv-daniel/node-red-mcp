# ADR-011: SSE Implementation Completion

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: Development Team
- **Reviewers**: Tech Lead, Architecture Team

## Context

Server-Sent Events (SSE) infrastructure is partially implemented (~70% complete)
but lacks critical features for production use:

### Current State
- ✅ **SSE Handler Core**: Basic connection management exists
- ✅ **Event Types**: Event schema and types defined
- ✅ **Connection Tracking**: Active connection monitoring
- 🔄 **Event Filtering**: Subscription-based delivery incomplete
- 🔄 **Health Monitoring**: Connection heartbeat needs improvement
- ⏳ **Node-RED Integration**: Live event capture not fully implemented

### Missing Features
1. **Event Filtering**: Clients can't subscribe to specific event types
2. **Connection Health**: No heartbeat/keepalive mechanism
3. **Reconnection Logic**: Poor handling of disconnections
4. **Event Buffering**: No replay capability for missed events
5. **Node-RED Hooks**: Not capturing all Node-RED events
6. **Error Handling**: Incomplete error recovery

### Use Cases
- **Real-time Monitoring**: Live flow execution status
- **Debug Streaming**: Debug node output in real-time
- **Error Notifications**: Immediate error alerts
- **Deployment Events**: Flow deployment notifications
- **Node Status**: Node state changes (running, stopped, error)

## Decision

Complete SSE implementation with focus on **reliability, filtering, and
Node-RED integration**:

### Core Features

**1. Event Filtering & Subscriptions**
```typescript
// Clients specify event types they want
GET /api/events?filter=flow.deployed,flow.error,node.status
```

Supported filters:
- `flow.*` - All flow events
- `flow.deployed` - Flow deployments
- `flow.error` - Flow errors
- `node.status` - Node status changes
- `debug.*` - Debug node messages
- `system.*` - System events

**2. Connection Health Management**
- Heartbeat every 15 seconds (configurable)
- Client must respond to heartbeat or be disconnected
- Automatic cleanup of dead connections
- Connection timeout: 5 minutes of inactivity
- Graceful shutdown on server restart

**3. Event Buffering & Replay**
- In-memory buffer: Last 100 events per type
- Clients can request replay: `?lastEventId=123`
- Events have sequential IDs
- Buffer cleared on server restart (not persistent)

**4. Node-RED Event Integration**
- Hook into Node-RED runtime events
- Capture debug node output
- Monitor flow deployment
- Track node status changes
- Error propagation from Node-RED

**5. Error Handling & Recovery**
- Automatic reconnection with exponential backoff
- Event delivery guarantees (at-least-once)
- Error events sent to clients
- Graceful degradation if Node-RED unavailable

### Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ SSE Connection
       │ GET /api/events?filter=flow.*
       │
┌──────▼──────────────────────────────┐
│    SSE Handler                      │
│  ┌──────────────────────────────┐  │
│  │  Connection Manager          │  │
│  │  - Track active connections  │  │
│  │  - Filter subscriptions      │  │
│  │  - Heartbeat monitoring      │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Event Buffer                │  │
│  │  - Last 100 events by type   │  │
│  │  - Sequential IDs            │  │
│  │  - Replay capability         │  │
│  └──────────────────────────────┘  │
└──────┬──────────────────────────────┘
       │ Subscribe to events
       │
┌──────▼──────────────────────────┐
│  Node-RED Event Bridge          │
│  - Runtime event listener       │
│  - Debug node capture           │
│  - Deployment hooks             │
│  - Status monitoring            │
└──────┬──────────────────────────┘
       │
┌──────▼──────────────────────────┐
│  Node-RED Instance              │
│  - Flows                        │
│  - Nodes                        │
│  - Runtime                      │
└─────────────────────────────────┘
```

## Rationale

### Why Event Filtering?
- **Efficiency**: Clients only receive relevant events
- **Bandwidth**: Reduces unnecessary data transfer
- **Client-side**: Simplifies client code (no filtering needed)
- **Scalability**: Server can optimize delivery

### Why Event Buffering?
- **Reliability**: Clients can recover from disconnections
- **Replay**: Useful for debugging and monitoring
- **Flexibility**: Clients can catch up on missed events
- **Simple**: In-memory is sufficient (not critical data)

### Why Heartbeat?
- **Detection**: Quickly identify dead connections
- **Cleanup**: Prevent resource leaks
- **User Experience**: Client knows connection is alive
- **Standard**: SSE best practice

### Why at-least-once Delivery?
- **Reliability**: Better to duplicate than lose events
- **Simple**: Easier to implement than exactly-once
- **Acceptable**: Clients can deduplicate if needed
- **Real-time**: Monitoring doesn't require exactly-once

## Alternatives Considered

### Alternative 1: WebSocket Instead of SSE
**Pros**:
- Bidirectional communication
- Lower latency
- Better for high-frequency updates
- More flexible protocol

**Cons**:
- More complex implementation
- Requires WebSocket infrastructure
- SSE sufficient for one-way events
- ADR-001 already decided on SSE

**Verdict**: ❌ Rejected - SSE sufficient, already decided

### Alternative 2: Polling Instead of SSE
**Pros**:
- Simpler client implementation
- Works everywhere (no SSE support needed)
- No persistent connections

**Cons**:
- Higher latency
- More server load
- Inefficient bandwidth usage
- Poor user experience

**Verdict**: ❌ Rejected - SSE is superior for real-time

### Alternative 3: Redis for Event Buffering
**Pros**:
- Persistent across restarts
- Shared across multiple instances
- Powerful pub/sub features
- Scalable

**Cons**:
- Additional infrastructure dependency
- Overkill for non-critical events
- More complexity
- Not needed for single instance

**Verdict**: ❌ Rejected for now - Can add later if needed

### Alternative 4: No Event Replay
**Pros**:
- Simpler implementation
- No buffering needed
- Lower memory usage

**Cons**:
- Poor reconnection experience
- Missed events lost forever
- Harder debugging
- Worse user experience

**Verdict**: ❌ Rejected - Event replay is valuable

## Consequences

### Positive
- ✅ **Real-time Monitoring**: Live visibility into Node-RED
- ✅ **Better UX**: Filtered events, replay capability
- ✅ **Reliability**: Heartbeat and reconnection
- ✅ **Scalability**: Efficient filtering reduces load
- ✅ **Debugging**: Event replay helps troubleshooting
- ✅ **Production Ready**: Robust error handling

### Negative
- ⚠️ **Memory Usage**: Event buffering consumes memory (~10-50MB)
- ⚠️ **Connection Limits**: SSE connections limited to ~100-1000 per process
- ⚠️ **Complexity**: More sophisticated connection management
- ⚠️ **Testing**: Harder to test real-time features
- ⚠️ **Node-RED Coupling**: Tight integration with Node-RED internals

### Mitigation Strategies
- Implement connection limits (max 1000 concurrent)
- Use circular buffer to cap memory usage
- Document connection limits clearly
- Provide comprehensive tests for SSE features
- Abstract Node-RED integration for testability

## Implementation Notes

### Phase 1: Event Filtering (Week 1)

```typescript
// src/sse/types.ts
export type EventFilter = {
  categories: string[];  // ['flow', 'node', 'debug']
  types: string[];       // ['deployed', 'error', 'status']
};

// src/sse/connection-manager.ts
export class SSEConnectionManager {
  private connections = new Map<string, SSEConnection>();

  addConnection(req: Request, res: Response, filter: EventFilter) {
    const connectionId = uuid();
    const connection = new SSEConnection(connectionId, res, filter);
    this.connections.set(connectionId, connection);

    // Set up keepalive
    const heartbeat = setInterval(() => {
      connection.sendHeartbeat();
    }, 15000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.connections.delete(connectionId);
    });
  }

  broadcast(event: SSEEvent) {
    for (const connection of this.connections.values()) {
      if (connection.matchesFilter(event)) {
        connection.sendEvent(event);
      }
    }
  }
}
```

### Phase 2: Event Buffering (Week 1)

```typescript
// src/sse/event-buffer.ts
export class EventBuffer {
  private buffer: CircularBuffer<SSEEvent>;
  private eventIdCounter = 0;

  constructor(maxSize = 100) {
    this.buffer = new CircularBuffer<SSEEvent>(maxSize);
  }

  add(event: SSEEvent) {
    event.id = String(++this.eventIdCounter);
    event.timestamp = Date.now();
    this.buffer.push(event);
  }

  getEventsSince(lastEventId: string): SSEEvent[] {
    const lastId = parseInt(lastEventId, 10);
    return this.buffer.filter(e => parseInt(e.id!, 10) > lastId);
  }
}
```

### Phase 3: Node-RED Integration (Week 2)

```typescript
// src/nodered/event-bridge.ts
export class NodeRedEventBridge {
  constructor(
    private nodeRedClient: NodeRedApiService,
    private sseManager: SSEConnectionManager
  ) {}

  async start() {
    // Hook into Node-RED runtime events
    await this.subscribeToRuntimeEvents();
    await this.subscribeToDebugMessages();
    await this.subscribeToDeployments();
  }

  private async subscribeToRuntimeEvents() {
    // Poll Node-RED for events or use webhooks if available
    setInterval(async () => {
      const events = await this.nodeRedClient.getRecentEvents();
      events.forEach(event => {
        this.sseManager.broadcast(this.transformEvent(event));
      });
    }, 1000);
  }

  private transformEvent(nodeRedEvent: any): SSEEvent {
    return {
      type: `flow.${nodeRedEvent.type}`,
      data: nodeRedEvent,
      timestamp: Date.now()
    };
  }
}
```

### Phase 4: Client Reconnection (Week 2)

```typescript
// Client-side reconnection logic
class SSEClient {
  private lastEventId: string | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  connect(url: string, filters: string[]) {
    const query = new URLSearchParams({
      filter: filters.join(','),
      ...(this.lastEventId && { lastEventId: this.lastEventId })
    });

    const eventSource = new EventSource(`${url}?${query}`);

    eventSource.onmessage = (event) => {
      this.lastEventId = event.lastEventId;
      this.reconnectDelay = 1000; // Reset on success
      this.handleEvent(JSON.parse(event.data));
    };

    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(() => {
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay
        );
        this.connect(url, filters);
      }, this.reconnectDelay);
    };
  }
}
```

### API Endpoints

```typescript
// GET /api/events - Subscribe to SSE stream
// Query params:
//   - filter: Comma-separated event types (e.g., "flow.deployed,node.status")
//   - lastEventId: ID of last received event (for replay)

router.get('/api/events', async (req, res) => {
  const filter = parseFilter(req.query.filter as string);
  const lastEventId = req.query.lastEventId as string;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send buffered events if lastEventId provided
  if (lastEventId) {
    const bufferedEvents = eventBuffer.getEventsSince(lastEventId);
    bufferedEvents.forEach(event => {
      sendSSEEvent(res, event);
    });
  }

  // Register connection
  sseManager.addConnection(req, res, filter);
});
```

### Event Format

```typescript
// SSE event format
id: 123
event: flow.deployed
data: {
  "flowId": "abc123",
  "label": "My Flow",
  "timestamp": 1705756800000
}

// Heartbeat format
event: heartbeat
data: {"timestamp": 1705756800000}
```

### Configuration

```bash
# Environment variables
SSE_HEARTBEAT_INTERVAL=15000    # 15 seconds
SSE_CONNECTION_TIMEOUT=300000   # 5 minutes
SSE_MAX_CONNECTIONS=1000
SSE_BUFFER_SIZE=100
SSE_ENABLE_REPLAY=true
```

## Related ADRs

- [ADR-001: MCP Transport Layer Selection](./001-mcp-transport-selection.md) - SSE decision made here
- [ADR-009: Production Observability Strategy](./009-production-observability-strategy.md) - Logging SSE events

## References

- [SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Node-RED Runtime API](https://nodered.org/docs/api/runtime/)
- [Best Practices for SSE](https://www.smashingmagazine.com/2018/02/sse-websockets-data-flow-http2/)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
