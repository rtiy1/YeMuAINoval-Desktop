# MCode Provider

YeMu AI Novel Desktop 的生产智能运行时清单只包含 `mcode`。历史适配器源码不会注册、展示或启动，并将在依赖清理阶段删除。

## 代码位置

- `packages/server/src/server/agent/providers/mcode/agent.ts`：`AgentClient`、会话和事件映射；
- `packages/server/src/server/agent/providers/mcode/runtime.ts`：进程启动与 stream-json 参数；
- `packages/server/src/server/agent/providers/mcode/protocol.ts`：提示、工具和用量转换；
- `packages/protocol/src/provider-manifest.ts`：唯一生产 Provider 定义；
- `packages/mcode`：`@yemu/mcode` npm workspace。

## 运行协议

daemon 使用以下 MCode 模式启动长驻会话：

```text
--print
--input-format stream-json
--output-format stream-json
--verbose
--include-partial-messages
--replay-user-messages
```

适配层处理 `system`、`stream_event`、`assistant`、`user`、`control_request` 和 `result` 消息。权限请求必须使用原始 `request_id` 回传 `control_response`。

## 能力

- 文本与推理流；
- 工具调用及结果；
- 工具权限允许/拒绝；
- `plan`、`default`、`acceptEdits`、`bypassPermissions` 模式；
- 模型和思考强度动态切换；
- MCP Server 注入；
- 持久会话恢复。

目前 MCode 不声明精确 MCP 预授权能力，因此无人值守任务不能绕过单个 Novel MCP 工具的确认。后续只有在 MCode 能保证“精确到 server + tool 且不扩大原生工具权限”时才能开放。

## 测试

```powershell
cd packages/server
npx vitest run src/server/agent/providers/mcode/agent.test.ts src/server/agent/providers/mcode/runtime.test.ts src/server/agent/provider-registry.test.ts
```
