# ADR-009: Production Observability Strategy

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: DevOps Team, Development Team
- **Reviewers**: Tech Lead, Operations

## Context

The MCP Node-RED server currently has basic observability features but lacks
comprehensive production-grade monitoring, logging, and tracing capabilities:

### Current State

- **Logging**: Basic Pino setup with pretty printing for development
- **Metrics**: No structured metrics collection
- **Tracing**: OpenTelemetry dependencies installed but not fully configured
- **Monitoring**: No dashboards or alerting
- **Debugging**: Limited correlation between logs, traces, and metrics

### Production Requirements

- **Multi-environment Support**: Development, staging, production
- **Structured Logging**: JSON logs with correlation IDs
- **Distributed Tracing**: Track requests across MCP, Node-RED, and SSE
- **Metrics Collection**: Performance, errors, resource usage
- **Alerting**: Proactive issue detection
- **Debugging**: Quick root cause analysis

### Observability Pillars

1. **Logs**: What happened (events, errors, debug info)
2. **Metrics**: How much/how often (performance, counts, gauges)
3. **Traces**: Where time was spent (distributed request flow)

## Decision

Implement a comprehensive observability stack using **Pino for logging** and
**OpenTelemetry for metrics and tracing**:

### Logging Strategy: Pino

**Development**:

- Pretty printing with colors
- Debug level logging
- Console output

**Production**:

- Structured JSON logs
- Info level default (configurable)
- Correlation IDs for request tracking
- Context propagation across async boundaries
- Log aggregation to stdout (captured by container orchestration)

**Log Structure**:

```json
{
  "level": "info",
  "time": "2026-01-20T10:30:45.123Z",
  "pid": 12345,
  "hostname": "mcp-server-pod-abc",
  "correlationId": "req-123-456-789",
  "service": "mcp-nodered-server",
  "version": "1.0.0",
  "tool": "get_flows",
  "userId": "user-123",
  "duration": 45,
  "msg": "Tool executed successfully"
}
```

### Metrics & Tracing: OpenTelemetry

**Automatic Instrumentation**:

- HTTP server/client requests
- Database queries (if added later)
- External API calls (Node-RED API)

**Custom Metrics**:

- MCP tool invocation counts
- Tool execution duration
- Error rates by tool
- SSE connection counts
- Active flow count
- Node-RED API call latency

**Custom Spans**:

- MCP tool execution
- Node-RED API operations
- SSE event broadcasting
- Authentication flows

**Export Targets**:

- **Development**: Console exporter
- **Production**: OTLP exporter to Jaeger/Grafana Tempo

### Monitoring Dashboard: Grafana

**Dashboards**:

1. **System Health**: CPU, memory, connections
2. **MCP Tools**: Invocation rates, latency, errors
3. **Node-RED Integration**: API call success/failure, latency
4. **SSE**: Connection count, event rates
5. **Errors**: Error rates, error types, stack traces

**Alerting Rules**:

- Error rate > 5% for 5 minutes
- Tool latency > 1s p95
- Memory usage > 80%
- SSE connection failures > 10/min

## Rationale

### Why Pino?

- **Performance**: Fastest Node.js logger (minimal overhead)
- **Structured**: Native JSON output for log aggregation
- **Ecosystem**: Excellent middleware (pino-http)
- **Standards**: Compatible with log aggregation tools
- **Already Used**: Dependency already in package.json

### Why OpenTelemetry?

- **Vendor Neutral**: Not locked into specific monitoring vendor
- **Comprehensive**: Logs, metrics, traces in one framework
- **Auto-instrumentation**: Minimal code changes needed
- **Industry Standard**: CNCF project with wide adoption
- **Future Proof**: Evolving standard with strong backing
- **Already Included**: Dependencies already in package.json

### Why Grafana + Jaeger?

- **Open Source**: No vendor lock-in
- **Powerful**: Professional-grade dashboards
- **Integration**: Works seamlessly with OpenTelemetry
- **Docker Support**: Easy local development setup
- **Familiar**: Widely known tools, easy onboarding

### Business Value

- **Faster Debugging**: Correlation IDs link logs to traces
- **Proactive Monitoring**: Alerts before users notice issues
- **Performance Insights**: Identify bottlenecks quickly
- **Capacity Planning**: Resource usage trends
- **SLA Compliance**: Track and prove uptime/performance

## Alternatives Considered

### Alternative 1: Winston for Logging

**Pros**:

- Popular and well-established
- Large ecosystem of transports

**Cons**:

- Slower than Pino
- More complex configuration
- Less efficient JSON serialization

**Verdict**: ❌ Rejected - Pino is faster and simpler

### Alternative 2: Prometheus + Custom Metrics

**Pros**:

- Industry standard for metrics
- Powerful query language

**Cons**:

- Requires separate instrumentation vs OpenTelemetry
- Pull-based model less suitable for ephemeral containers
- More complex setup

**Verdict**: ❌ Rejected - OpenTelemetry provides unified approach

### Alternative 3: Commercial APM (Datadog, New Relic)

**Pros**:

- Fully managed, batteries included
- Excellent UX and features
- Support and SLAs

**Cons**:

- Expensive ($50-200+/host/month)
- Vendor lock-in
- Privacy concerns (data sent to third party)
- Overkill for initial launch

**Verdict**: ❌ Rejected - Open source sufficient for now, can migrate later

### Alternative 4: ELK Stack (Elasticsearch, Logstash, Kibana)

**Pros**:

- Comprehensive log search
- Powerful querying

**Cons**:

- Heavy resource requirements
- Complex to operate
- Overkill for log aggregation
- High operational overhead

**Verdict**: ❌ Rejected - Too heavy, stdout + log aggregation simpler

## Consequences

### Positive

- ✅ **Production Ready**: Professional observability
- ✅ **Fast Debugging**: Correlation IDs and traces
- ✅ **Proactive Monitoring**: Know issues before users do
- ✅ **Performance Optimization**: Identify bottlenecks
- ✅ **Compliance**: Audit trails for security/compliance
- ✅ **Vendor Neutral**: Open standards, no lock-in
- ✅ **Low Overhead**: Pino and OpenTelemetry are efficient

### Negative

- ⚠️ **Infrastructure Complexity**: Need to run Grafana, Jaeger
- ⚠️ **Learning Curve**: Team needs to learn OpenTelemetry
- ⚠️ **Storage Costs**: Logs and traces require storage
- ⚠️ **Performance Impact**: Small overhead from instrumentation (~1-5%)
- ⚠️ **Operational Overhead**: Dashboard maintenance, alert tuning

### Mitigation Strategies

- Provide docker-compose setup for local development
- Document common queries and dashboard usage
- Set reasonable log retention policies (7-30 days)
- Use sampling for traces (not every request)
- Create runbooks for common alerts

## Implementation Notes

### Phase 1: Enhanced Logging (Week 1)

```typescript
// src/utils/logger.ts
import pino from 'pino';
import pinoHttp from 'pino-http';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  formatters: {
    level: label => ({ level: label }),
  },
  base: {
    service: 'mcp-nodered-server',
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// HTTP request logger middleware
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
});
```

### Phase 2: OpenTelemetry Setup (Week 1-2)

```typescript
// src/telemetry/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'mcp-nodered-server',
      [SemanticResourceAttributes.SERVICE_VERSION]:
        process.env.npm_package_version,
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('Telemetry terminated'))
      .catch(error => console.error('Error terminating telemetry', error));
  });
}
```

### Phase 3: Custom Metrics (Week 2)

```typescript
// src/telemetry/metrics.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('mcp-nodered-server');

export const toolInvocationCounter = meter.createCounter(
  'mcp.tool.invocations',
  {
    description: 'Number of MCP tool invocations',
  }
);

export const toolDuration = meter.createHistogram('mcp.tool.duration', {
  description: 'MCP tool execution duration',
  unit: 'ms',
});

export const sseConnections = meter.createUpDownCounter('sse.connections', {
  description: 'Active SSE connections',
});

// Usage
toolInvocationCounter.add(1, { tool: 'get_flows', status: 'success' });
toolDuration.record(45, { tool: 'get_flows' });
```

### Phase 4: Grafana Dashboards (Week 3)

```yaml
# docker-compose.yml additions
services:
  grafana:
    image: grafana/grafana:latest
    ports:
      - '3001:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./config/grafana/datasources:/etc/grafana/provisioning/datasources

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - '16686:16686' # Jaeger UI
      - '4318:4318' # OTLP HTTP receiver

  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
```

### Correlation ID Propagation

```typescript
// src/middleware/correlation.ts
import { v4 as uuidv4 } from 'uuid';

export function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('x-correlation-id', req.correlationId);

  // Add to logger context
  req.log = logger.child({ correlationId: req.correlationId });

  next();
}
```

### Environment Configuration

```bash
# .env
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces
OTEL_SERVICE_NAME=mcp-nodered-server
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10% of traces
```

## Related ADRs

- [ADR-001: MCP Transport Layer Selection](./001-mcp-transport-selection.md) -
  Transport affects tracing
- [ADR-006: Containerization and Deployment Strategy](./006-containerization-strategy.md) -
  Deployment affects log collection

## References

- [Pino Documentation](https://getpino.io/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/instrumentation/js/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Observability Best Practices (Honeycomb)](https://www.honeycomb.io/blog/observability-101)
- [Google SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
