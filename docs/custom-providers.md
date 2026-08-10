# MCode 运行配置

YeMu AI Novel Desktop 不支持新增、继承或启用其他 Provider。`agents.providers` 中只允许配置内置的 `mcode` 项。

这样可以保证桌面端、daemon、权限模型和小说领域工具使用同一套 MCode 语义，避免重新引入多 Provider 兼容层。

## 自定义 MCode 命令和环境

配置文件位于应用数据目录中的 `config.json`：

```json
{
  "version": 1,
  "agents": {
    "providers": {
      "mcode": {
        "command": ["mcode", "--verbose"],
        "env": {
          "MCODE_CONFIG_DIR": "D:/YeMu/mcode-home"
        }
      }
    }
  }
}
```

不设置 `command` 时，服务端直接使用 monorepo 中 `@yemu/mcode/runtime` 提供的 Bun 和入口文件。

## 自定义模型显示

可以用 `models` 替换 MCode 的默认模型目录：

```json
{
  "version": 1,
  "agents": {
    "providers": {
      "mcode": {
        "models": [
          {
            "id": "novel-pro",
            "label": "Novel Pro",
            "description": "用于长篇小说写作",
            "isDefault": true
          }
        ]
      }
    }
  }
}
```

`additionalModels` 可以在内置目录后追加模型。模型 ID 最终仍由 MCode 解释。

以下配置会被拒绝：

- `claude`、`codex`、`copilot`、`opencode`、`pi` 或 `omp`；
- 任意自定义 Provider ID；
- `extends: "acp"`；
- `mcode` 上的任何 `extends`。
