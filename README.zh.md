# dsh-stall-guard

[English](README.en.md) · [Русский](README.md) · **简体中文**

一个 DeepSeek Harness 插件，拒绝智能体给自己设定期限、空等或长时间阻塞的
工具调用。只在工具流水线上做一次检查，不改核心，也不改提示词。

## 为什么

智能体喜欢把命令包进 `timeout 25`，或者用 `sleep 1` 循环等待。前者会把操作
从中间截断：停 docker 停在半路，下一步面对半完成的状态，而退出码已经丢了。
后者把时间浪费在等待上，而不是检查结果。光在指令里劝说并不总是管用——在同一
步里给出带原因和替代做法的拒绝，才管用。

## 拦截什么

| 工具 | 条件 | 为什么拒绝 |
|---|---|---|
| `bash`、`pwsh` | `timeout N cmd` | 短期限把操作从中间截断，退出码丢失。 |
| `bash`、`pwsh` | `sleep N` | 用循环等待代替检查结果。 |
| `job_output` | `wait: true` 且 `timeout_ms` 大于 15000 | 阻塞等待就是拆成几段的十分钟。后台任务结束时 DSH 会自己报告。 |
| `wait_agent` | `timeout_ms` 大于 15000 | 完成通知会在下一轮到来，干等没有意义。 |

只匹配小写 `timeout` 是刻意的：ssh 的 `ConnectTimeout=5` 和 systemd 的
`TimeoutStopSec=` 会放行，因为字母不同且数字前没有空格。

## 安装

插件是本地包，没有发布到 npm。在 profile 补丁
（`~/.dsh/profiles/web/cordis.patch.yml`）里加一行：

```yaml
- insert:
    - id: stall-guard
      name: /home/dragon/Projects/dsh-stall-guard/index.js
```

重启 `dsh web` 后生效。不重启的话，用 `dsh_hot_reload` 以
`entryId: stall-guard` 重载正在运行的实例。

## 检查

不启动宿主也能验证命令解析：

```sh
node -e "import('./index.js').then(m => console.log(m.inspectCommand('docker ps -a')))"
```

实机验证：让智能体执行带自有期限包装的命令，应当收到带原因和替代做法的拒绝。

## 边界

- 不解析引号内的文本：`grep "timeout 5"` 同样会被拒绝，虽然那只是搜索。代价
  是一次改写调用。
- 插件不改模型传给 `bash` 的 `timeoutMs` 参数。这个上限在 profile 补丁里
  （`bash-sandbox.maxTimeoutMs`）。
- `promoteOnTimeout` 位于智能体预设内部，profile 补丁够不到：撞到上限的命令
  仍可能作为后台任务继续跑。

实现细节见 [docs/DETAIL.md](docs/DETAIL.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。
