# WebSocket Protocol: Local USB Agent ↔ Print Agent Server

## Connection Overview

```
Local USB Agent (Electron) ── WebSocket ── Print Agent Server
                                  │
                                  └─ Admin Server (REST) ── Browser UI
```

- URL: `wss://printer-hub.easyify.uk/print-agent`
- Transport: TLS WebSocket (`wss`); fallback to `ws://127.0.0.1:3000/print-agent` for local dev.
- Authentication: shared secret generated per shop (future); initial implementation trusts `shopId`.
- Reconnection: exponential backoff (2s → 30s) with jitter; `Agent` resends registration on resume.

## Message Envelope

All frames are JSON objects with the following top-level shape:

```json
{
  "type": "event-name",
  "id": "uuid-optional",
  "payload": { ... }
}
```

- `type`: string identifying message
- `id`: optional unique id for correlation (server requests expect reply with same id)
- `payload`: message-specific data

## Agent → Server Messages

| Type | Description | Payload |
| ---- | ----------- | ------- |
| `register` | Sent immediately after connection (and after reconnects) | `{ "shopId": "testclient", "version": "0.2.0", "platform": "darwin", "arch": "arm64", "hostname": "MacMini.local", "udpPort": null, "capabilities": ["usb", "remote-test"] }` |
| `heartbeat` | Periodic signal (default 30s) summarizing state | `{ "shopId": "testclient", "uptime": 1234, "devices": [ { "vendorId": 0x1234, "productId": 0x5678, "alias": "Kitchen", "role": "Kitchen", "isDefault": true, "lastTest": { "status": "success", "timestamp": "2025-11-09T21:23:54.000Z" } } ], "telemetry": { "logs": ["..."], "status": "online" } }` |
| `task_result` | Response to server-issued task | `{ "id": "<task-id>", "status": "success", "message": "Printed", "meta": { "bytesSent": 1234 } }` |
| `log_event` | Optional streaming log entry for debugging | `{ "level": "warn", "message": "USB reconnect", "timestamp": "..." }` |

## Server → Agent Messages

| Type | Description | Payload |
| ---- | ----------- | ------- |
| `ack` | Acknowledges registration/heartbeat | `{ "message": "ok" }` |
| `task_print` | Request agent to perform test or production print | `{ "id": "task-uuid", "shopId": "testclient", "printer": { "vendorId": 0xfe6, "productId": 0x811e }, "data": "base64-encoded ESC/POS", "encoding": "base64", "reason": "remote-test" }` |
| `task_config` | Push configuration changes | `{ "id": "task-uuid", "updates": { "defaultPrinter": { "vendorId": 0xfe6, "productId": 0x811e }, "telemetry": { "intervalSeconds": 30 } } }` |
| `task_ping` | Health check; agent replies with `task_result` status `pong` | `{ "id": "task-uuid" }` |

If agent cannot execute a task it should respond with `task_result` status `error` and a descriptive message.

## Task Lifecycle

1. Admin UI calls `POST /api/agent-tasks` (planned) with `shopId` + command.
2. Admin server delegates到 print-agent REST → print-agent enqueues命令 → 使用 WebSocket 将 `task_print` 或 `task_config` 发送给对应 Agent。
3. Agent 执行后返回 `task_result`。
4. print-agent 将结果回传给 Admin，落库到 heartbeats data，用于 UI 更新。

## Persistence & Replay

- Server应记录最近 N 次任务状态（成功/失败）到 Mongo/JSON，以便断线后恢复。
- 心跳广播中包含最新任务结果，Admin 在 `/api/agent-heartbeat` 返回。

## Failure Handling

- 如果 Agent 在任务执行时断开，服务器将任务标记为 `pending`，等待重连后重新派发（最多重试3次）。
- Admin UI 在等待执行期间显示“执行中…”，超时（默认 30s）后标记告警。

## Roadmap Notes

- **Auth**: 后续引入基于 token 的校验，通过部署脚本生成 `agentToken` 并保存于 Admin 数据库。
- **Binary 数据**: 当前采用 base64 编码的 ESC/POS 文本，后续可优化为 arraybuffer。
- **配置同步**: `task_config` 执行后，Agent 更新本地 store 并加一个 `config_push_at` 字段，在下一次 `heartbeat` 中回报，用于后台确认。
