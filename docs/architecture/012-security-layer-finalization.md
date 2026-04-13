# ADR-012: Security Layer Finalization

- **Status**: Proposed
- **Date**: 2026-01-20
- **Authors**: Security Team, Development Team
- **Reviewers**: Tech Lead, Security Architect

## Context

Security layer is ~85% complete with basic authentication but lacks
production-grade authorization and security hardening:

### Current State

- ✅ **Authentication Foundation**: JWT and API key infrastructure exists
- ✅ **Middleware Setup**: Express authentication middleware configured
- ✅ **Claude Integration**: Flexible auth for Claude.ai compatibility
- 🔄 **Authorization**: Role-based access control not implemented
- ⏳ **Security Hardening**: Missing rate limiting, input validation, audit logs

### Security Requirements

1. **Authentication**: Verify identity (who you are)
2. **Authorization**: Control access (what you can do)
3. **Input Validation**: Prevent injection attacks
4. **Rate Limiting**: Prevent abuse
5. **Audit Logging**: Track security-relevant actions
6. **Secrets Management**: Secure credential storage
7. **HTTPS Enforcement**: Encrypted transport

### Threat Model

- **Unauthorized Access**: Non-authenticated users accessing MCP tools
- **Privilege Escalation**: Users accessing tools beyond their permissions
- **DoS Attacks**: Overwhelming server with requests
- **Injection Attacks**: SQL, command, XSS injection
- **Credential Theft**: Exposed API keys or JWT tokens
- **MITM Attacks**: Intercepted communications

## Decision

Implement comprehensive security with **RBAC (Role-Based Access Control)**,
**granular permissions**, and **defense-in-depth** strategy:

### Security Architecture

```
┌─────────────────────────────────────┐
│         Request Flow                │
├─────────────────────────────────────┤
│  1. HTTPS Enforcement               │
│  2. Rate Limiting                   │
│  3. Input Validation                │
│  4. Authentication                  │
│  5. Authorization (RBAC)            │
│  6. Tool Execution                  │
│  7. Audit Logging                   │
└─────────────────────────────────────┘
```

### Role Definitions

**Admin Role** (full access):

- All MCP tools
- Flow CRUD operations
- Module installation
- System configuration
- User management

**Operator Role** (operational access):

- Read flows
- Execute flows (deploy)
- Enable/disable flows
- View system status
- No module installation
- No system configuration

**Viewer Role** (read-only):

- Read flows
- View system status
- SSE event subscription (read-only events)
- No modifications allowed

**Integration Role** (automation access):

- Specific tool whitelist
- API key auth only (no JWT)
- Rate limits adjusted per integration
- Audit logged separately

### Permission Model

```typescript
// Granular permissions
type Permission =
  | 'flows:read'
  | 'flows:write'
  | 'flows:delete'
  | 'flows:deploy'
  | 'nodes:read'
  | 'nodes:write'
  | 'modules:install'
  | 'modules:uninstall'
  | 'system:config'
  | 'users:manage'
  | 'events:subscribe';

// Role-to-permission mapping
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [/* all permissions */],
  operator: ['flows:read', 'flows:write', 'flows:deploy', ...],
  viewer: ['flows:read', 'nodes:read', 'events:subscribe'],
  integration: [/* configurable per integration */]
};
```

### Authentication Methods

**JWT (Primary)** - For user sessions:

- Issued by auth service
- Short-lived (1 hour)
- Refresh token support
- Claims include: userId, role, permissions

**API Key (Secondary)** - For integrations:

- Long-lived (no expiration or 1 year)
- Per-integration keys
- Specific permission scopes
- Revocable

**Claude Desktop (Stdio)** - Special case:

- No authentication required for stdio mode
- Node-RED credentials passed via environment
- Single-user assumption

### Rate Limiting Strategy

**Per-Role Limits**:

- Admin: 1000 req/min
- Operator: 500 req/min
- Viewer: 100 req/min
- Integration: Configurable (default 200 req/min)

**Per-Tool Limits**:

- Read operations: More generous
- Write operations: Stricter
- Module install: Very strict (5/hour)

**IP-based Limits**:

- Global: 10,000 req/min per IP
- Prevents distributed attacks

### Input Validation

**All Inputs Validated** using Zod schemas:

- Tool parameters
- API request bodies
- Query parameters
- Headers

**Sanitization**:

- Strip HTML/scripts from text inputs
- Validate URLs before fetching
- Check file paths for traversal attacks
- Limit string lengths

## Rationale

### Why RBAC?

- **Standard**: Industry-standard authorization model
- **Flexible**: Easy to add/modify roles
- **Scalable**: Works for small and large teams
- **Clear**: Obvious what each role can do
- **Auditable**: Easy to verify permissions

### Why JWT + API Key?

- **JWT**: Standard for user sessions, widely supported
- **API Key**: Simple for service-to-service, long-lived
- **Both**: Flexibility for different use cases
- **Proven**: Battle-tested authentication methods

### Why Granular Permissions?

- **Principle of Least Privilege**: Users get minimum needed access
- **Flexibility**: Can create custom roles
- **Security**: Limits damage from compromised accounts
- **Compliance**: Meets audit requirements

### Why Rate Limiting?

- **DoS Protection**: Prevents resource exhaustion
- **Fair Usage**: Ensures availability for all users
- **Cost Control**: Prevents abuse of expensive operations
- **Detection**: Helps identify attacks or bugs

## Alternatives Considered

### Alternative 1: No Authorization (Auth only)

**Pros**:

- Simpler implementation
- Faster development

**Cons**:

- All authenticated users have full access
- No audit trail of who did what
- Violates least privilege
- Not suitable for multi-user scenarios

**Verdict**: ❌ Rejected - Insufficient for production

### Alternative 2: OAuth2/OIDC

**Pros**:

- Industry standard
- Centralized auth
- SSO support

**Cons**:

- Complex setup
- Requires auth server
- Overkill for initial version
- Can add later if needed

**Verdict**: ✅ Deferred - Add in future if needed

### Alternative 3: Attribute-Based Access Control (ABAC)

**Pros**:

- More flexible than RBAC
- Context-aware permissions
- Fine-grained control

**Cons**:

- Much more complex
- Harder to understand
- Overkill for current needs
- Difficult to audit

**Verdict**: ❌ Rejected - RBAC sufficient

### Alternative 4: No Authentication (Open Access)

**Pros**:

- Zero implementation
- Easy to use

**Cons**:

- Completely insecure
- Anyone can modify flows
- Not suitable for production
- No audit trail

**Verdict**: ❌ Rejected - Unacceptable

## Consequences

### Positive

- ✅ **Production Ready**: Secure by default
- ✅ **Multi-user**: Supports team environments
- ✅ **Least Privilege**: Users have minimal needed access
- ✅ **Audit Trail**: Track who did what
- ✅ **DoS Protection**: Rate limiting prevents abuse
- ✅ **Compliance**: Meets security standards
- ✅ **Flexible**: Can add roles as needed

### Negative

- ⚠️ **Complexity**: More complex auth/authz logic
- ⚠️ **User Management**: Need user admin interface
- ⚠️ **Performance**: Auth checks add latency (~5-10ms)
- ⚠️ **Testing**: More security tests needed
- ⚠️ **Migration**: Existing users need role assignment

### Mitigation Strategies

- Provide clear documentation for role setup
- Cache permission checks to minimize overhead
- Create admin tools for user management
- Comprehensive security test suite
- Migration script for existing deployments

## Implementation Notes

### Phase 1: RBAC Foundation (Week 1)

```typescript
// src/auth/rbac.ts
export enum Role {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
  INTEGRATION = 'integration',
}

export enum Permission {
  FLOWS_READ = 'flows:read',
  FLOWS_WRITE = 'flows:write',
  FLOWS_DELETE = 'flows:delete',
  FLOWS_DEPLOY = 'flows:deploy',
  NODES_READ = 'nodes:read',
  NODES_WRITE = 'nodes:write',
  MODULES_INSTALL = 'modules:install',
  MODULES_UNINSTALL = 'modules:uninstall',
  SYSTEM_CONFIG = 'system:config',
  USERS_MANAGE = 'users:manage',
  EVENTS_SUBSCRIBE = 'events:subscribe',
}

export class RBACService {
  private rolePermissions: Map<Role, Set<Permission>>;

  constructor() {
    this.initializeRoles();
  }

  hasPermission(role: Role, permission: Permission): boolean {
    const permissions = this.rolePermissions.get(role);
    return permissions?.has(permission) || false;
  }

  checkPermission(user: User, permission: Permission): void {
    if (!this.hasPermission(user.role, permission)) {
      throw new ForbiddenError(`User lacks permission: ${permission}`);
    }
  }
}
```

### Phase 2: Authorization Middleware (Week 1)

```typescript
// src/middleware/authorization.ts
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user; // Set by authentication middleware

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      rbacService.checkPermission(user, permission);
      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  };
}

// Usage
router.post(
  '/api/flows',
  authenticate,
  requirePermission(Permission.FLOWS_WRITE),
  createFlowHandler
);
```

### Phase 3: Rate Limiting (Week 1)

```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const createRateLimiter = (role: Role) => {
  const limits = {
    [Role.ADMIN]: 1000,
    [Role.OPERATOR]: 500,
    [Role.VIEWER]: 100,
    [Role.INTEGRATION]: 200,
  };

  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: limits[role],
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => {
      return req.user?.id || req.ip;
    },
  });
};

// Tool-specific rate limiting
export const toolRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  skip: req => {
    const tool = req.body.tool;
    return tool !== 'install_module'; // Only limit module installs
  },
});
```

### Phase 4: Audit Logging (Week 2)

```typescript
// src/middleware/audit-log.ts
export function auditLog(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      logger.info({
        type: 'audit',
        action,
        userId: req.user?.id,
        role: req.user?.role,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        correlationId: req.correlationId,
      });
    });

    next();
  };
}

// Usage
router.delete(
  '/api/flows/:id',
  authenticate,
  requirePermission(Permission.FLOWS_DELETE),
  auditLog('flow.delete'),
  deleteFlowHandler
);
```

### Phase 5: Input Validation (Week 2)

```typescript
// src/middleware/validation.ts
import { z } from 'zod';

export function validateBody<T>(schema: z.Schema<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  };
}

// Tool parameter schemas
const createFlowSchema = z.object({
  name: z.string().min(1).max(100),
  nodes: z.array(z.any()),
  connections: z.record(z.any()),
});

// Usage
router.post(
  '/api/flows',
  authenticate,
  requirePermission(Permission.FLOWS_WRITE),
  validateBody(createFlowSchema),
  auditLog('flow.create'),
  createFlowHandler
);
```

### Security Configuration

```bash
# .env
# JWT Configuration
JWT_SECRET=<strong-random-secret>
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

# API Key Configuration
API_KEY_HASH_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW=60000  # 1 minute
RATE_LIMIT_MAX_ADMIN=1000
RATE_LIMIT_MAX_OPERATOR=500
RATE_LIMIT_MAX_VIEWER=100

# Security Headers
HELMET_ENABLED=true
CORS_ORIGIN=https://your-domain.com

# Audit Logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_LEVEL=info
```

### User Management API

```typescript
// POST /api/users - Create user (admin only)
// PUT /api/users/:id/role - Update user role (admin only)
// DELETE /api/users/:id - Delete user (admin only)
// GET /api/users - List users (admin only)

router.post(
  '/api/users',
  authenticate,
  requirePermission(Permission.USERS_MANAGE),
  validateBody(createUserSchema),
  auditLog('user.create'),
  createUserHandler
);
```

## Related ADRs

- [ADR-005: Security Architecture and Validation](./005-security-architecture.md) -
  Initial security decisions
- [ADR-009: Production Observability Strategy](./009-production-observability-strategy.md) -
  Audit logging
- [ADR-011: SSE Implementation Completion](./011-sse-implementation-completion.md) -
  SSE security

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [RBAC Best Practices](https://csrc.nist.gov/publications/detail/sp/800-192/final)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [NIST Access Control Guidelines](https://csrc.nist.gov/publications/detail/sp/800-162/final)

---

_Created: 2026-01-20 | Last Updated: 2026-01-20_
