---
name: node-red-mcp
description:
  How to inspect, search, edit and debug Node-RED flows through the node-red-mcp
  server (get_flows, get_flow, update_flow, validate_flow, get_node_errors and
  the rest). Use whenever a task touches a Node-RED instance through this MCP
  server, before calling any of its write tools.
---

# Working with Node-RED through node-red-mcp

This server talks to Node-RED's admin HTTP API. Two facts shape everything
below:

- **Every write is live.** There is no separate deploy step. `create_flow`,
  `update_flow`, `enable_flow`, `disable_flow` and `delete_flow` change the
  running instance the moment they succeed.
- **`update_flow` replaces the whole flow tab.** Whatever you send becomes the
  flow. Nodes you leave out are deleted.

Every tool returns JSON text shaped like
`{ "success": true, "data": ..., "timestamp": ... }` or
`{ "success": false, "error": "...", "errorDetails": { code, statusCode, upstreamStatus?, upstreamResponse? } }`.
A failed call does not throw: always read `success`. The exceptions are
`create_flow`, `update_flow`, `enable_flow`, `disable_flow`, `search_modules`,
`install_module` and unfiltered `get_installed_modules`, which return plain text
or raw JSON on success.

## Which tool for which intent

| Intent                                  | Tool                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| List flows, find one by name            | `get_flows` with `labelContains` (summary only: id, label, disabled) |
| Read one flow's nodes                   | `get_flow` with `flowId`                                             |
| Find nodes by type, name or property    | `search_flows`                                                       |
| Find flows by topic in natural language | `semantic_search_flows` (BM25 unless `EMBEDDING_API_URL` is set)     |
| Change a flow                           | `get_flow`, edit, `update_flow` with `validate: true`                |
| Build a new flow                        | `create_flow` with `validate: true`                                  |
| Check a deployed flow's wiring          | `validate_flow` with `flowId`                                        |
| Find nodes showing red/yellow status    | `get_node_errors` (`includeWarnings: true` for yellow)               |
| Turn a flow on or off                   | `enable_flow` / `disable_flow`                                       |
| Remove a flow                           | `delete_flow` (dry run first)                                        |
| Read context variables                  | `get_context` (`scope: "global"` or `"flow"` with `flowId`)          |
| Write or delete context                 | `delete_context` (global only); `set_context` see Known issues       |
| Find or install palette modules         | `search_modules` (npm registry), `install_module`                    |
| Version, per-type node counts, modules  | `get_runtime_info`                                                   |
| Is the runtime started or stopped       | `get_flow_state`                                                     |
| HTTP root, logging and other settings   | `get_settings`                                                       |

Resources mirror the read tools: `nodered://flows`, `nodered://subflows`,
`nodered://nodes`, `nodered://context/global`, `flow://<id>`,
`system://runtime`. Prompts `debug_flow`, `explain_automation`, `audit_security`
and `document_flow` take a `flowId` and build a ready-made task for you.

If a required `flowId` or `query` is missing, the server may ask the user for it
(MCP elicitation) when the client supports that. Prefer passing it yourself.

## Safe edit workflow

1. **Locate.** `get_flows` with `labelContains`, then pick the `id`.
2. **Read.** `get_flow` with that `flowId`. The result has `nodes` (nodes on the
   canvas) and may have `configs` (flow-scoped config nodes, and any node that
   has no `x`/`y`).
3. **Edit a copy.** Keep every field you did not mean to change, including `id`,
   `label`, `nodes`, `configs`, and each node's `id`, `z`, `x`, `y` and `wires`.
4. **Confirm with the human.** Show what will change (nodes added, removed,
   rewired, properties changed) and get an explicit yes. The change goes live on
   success.
5. **Write.** `update_flow` with `flowId`, the full edited object as `flowData`,
   and `validate: true`. Validation rejects missing `id`/`type`, duplicate node
   ids and wires pointing at nodes that are not in `nodes`, before anything is
   sent to Node-RED.
6. **Verify.** `get_flow` again to see what Node-RED stored, then
   `get_node_errors`. A node only shows an error status after it has run, so an
   empty result right after a deploy is not proof the flow works.

`validate_flow` checks a flow that is already deployed. It cannot check a change
you have not sent yet; use `validate: true` on the write for that.

### Always ask the human first

Get an explicit yes before `update_flow`, `create_flow`, `enable_flow`,
`disable_flow`, `delete_flow` with `dryRun: false`, `set_context`,
`delete_context` and `install_module`. Name the flow (label and id) and say what
will happen. Never treat silence or an earlier general approval as a yes for a
destructive call.

`delete_flow` is a dry run by default and returns `wouldDelete`. Show that to
the human. Only after their yes, call it again with `dryRun: false` and
`confirm: true`.

## Building nodes that Node-RED accepts

- Give every canvas node a unique `id`, a `type`, an `x` and a `y`. Without
  `x`/`y` Node-RED files the node under `configs`, not `nodes`.
- `wires` is an array with one array of target ids per output, e.g.
  `[["n2"], []]` for two outputs. A node with no outputs uses `[]`.
- Wires can only point at nodes in the same flow. Use link nodes to cross flows.
- `create_flow` ignores a supplied flow `id`. Node-RED assigns one and the tool
  returns it as `Flow created: <id>`.
- Config nodes shared across flows (an MQTT broker, a Home Assistant server)
  live outside any tab. Reference them by id; do not copy them into `nodes`.

## Saving tokens

- `get_flows` returns summaries by default. Leave `includeDetails` off.
  `includeDetails: true` returns Node-RED's raw flat list of every tab, node and
  config node in the instance, which is large.
- Fetch one flow with `get_flow` rather than everything with `includeDetails`.
- Paginate long lists with `limit`/`offset` on `get_flows`, `search_flows`,
  `get_flow_state` and `get_installed_modules`. Passing either one switches the
  response to `{ items, total, limit, offset, hasMore }`; keep paging while
  `hasMore` is true.
- `get_flows` can filter (`disabled`, `labelContains`) and sort (`sortBy`
  `label` | `nodeCount` | `disabled`, `order`) on the server.
- `get_context` without `key` returns the whole scope; pass `key` when you know
  it.

## Common pitfalls

- Sending only the fields you changed to `update_flow` (for example just
  `{ "label": "new" }`) deletes every node in the flow.
- `get_context` returns `{ "msg": "(undefined)", "format": "undefined" }` for a
  key that does not exist. That is "not set", not an error.
- `semantic_search_flows` caches its index for about a minute. Pass
  `refresh: true` after an edit.
- `semantic_search_flows` scores are relative: the best hit is always `1`.
- Flows run in a shared runtime. Disabling or editing one flow can break others
  that use its link nodes or context.
- In read-only mode (`MCP_READ_ONLY=true`) the write tools are absent from the
  tool list. Do not try to work around that; tell the human.

## Known issues

Checked against Node-RED 4.1 and 5.0. Re-test after upgrading the server; remove
an entry once it is fixed.

- `enable_flow` and `disable_flow` apply the change, then report
  `success: false` with an HTTP 400 from `POST /flows`. Check the real state
  with `get_flows` before retrying.
- `set_context` cannot work on a standard Node-RED: its admin API has no
  endpoint for writing context, so the call fails with an error that says so. To
  change a value, edit the flow that sets it (for example a change node).
- `semantic_search_flows` only matches ASCII words. For labels in other
  languages use `get_flows` with `labelContains`.

## Connecting and authentication

The server reaches Node-RED with `NODERED_URL` plus one of:

- `NODERED_USERNAME`/`NODERED_PASSWORD` with `NODERED_ADMIN_AUTH_ENABLED=true`
  when they are Node-RED's own `adminAuth` credentials (exchanged for a bearer
  token, scope `NODERED_AUTH_SCOPE`, default `*` or `read` in read-only mode).
- `NODERED_USERNAME`/`NODERED_PASSWORD` alone when they belong to a reverse
  proxy in front of Node-RED (sent as HTTP Basic).
- `NODERED_API_TOKEN`, a bearer token you issued yourself.

Clients reach the server over stdio (default) or HTTP (`MCP_TRANSPORT=http`,
`POST /mcp`, optional Basic auth via `MCP_USERNAME`/`MCP_PASSWORD`). For an
agent that should only look, run with `MCP_READ_ONLY=true` and a Node-RED user
whose `adminAuth` permission is `read`.

On a 401 or 403, check `errorDetails.upstreamStatus`: it is Node-RED's own
status. An `invalid_grant` from the token exchange can mean a wrong password or
a scope the user's `adminAuth` permissions do not allow.
