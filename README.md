# just-wishing

把模糊愿望砍到**一个 MVP 动作**，其余全部冻结到 `TODO.md`。

`just-wishing` 是 `stop-wishing` 的实验性分支，但**不依赖已安装的 `stop-wishing`**；仓库自带 `scripts/guard.js`，负责 preflight、备份和提交检查。

触发：

```text
/just-wishing
```

## 安装

需要 **Node.js 18+**。安装时请复制整个技能目录，不能只复制 `SKILL.md`。

### 方式一：npx skills（推荐）

```bash
npx -y skills add 2huy4n/just-wishing --copy
```

默认安装到当前项目；装到用户级加 `-g`：

```bash
npx -y skills add 2huy4n/just-wishing --copy -g
```

也可以指定工具：

```bash
npx -y skills add 2huy4n/just-wishing --copy -a claude-code
npx -y skills add 2huy4n/just-wishing --copy -a codex
```

`--copy` 会复制 `scripts/guard.js`、`LICENSE` 和包文件，避免只拿到 `SKILL.md`。

### 方式二：git clone + 复制目录

```bash
git clone https://github.com/2huy4n/just-wishing.git
mkdir -p ~/.agents/skills/just-wishing
cp -R just-wishing/{SKILL.md,scripts,LICENSE,README.md,package.json} \
  ~/.agents/skills/just-wishing/
```

Claude Code 用户把目标改成 `~/.claude/skills/just-wishing/`。

Windows PowerShell：

```powershell
git clone https://github.com/2huy4n/just-wishing.git
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills\just-wishing" | Out-Null
Copy-Item just-wishing\SKILL.md,just-wishing\scripts,just-wishing\LICENSE,just-wishing\README.md,just-wishing\package.json `
  "$env:USERPROFILE\.agents\skills\just-wishing\" -Recurse
```

### 方式三：让 AI 帮你安装

把下面这段直接发给你的 AI 助手：

> 请帮我安装这个 Skill：https://github.com/2huy4n/just-wishing
>
> - 先问我用的是 Claude Code、DSH、Codex 还是 TRAE，不要猜。
> - 优先执行 `npx -y skills add 2huy4n/just-wishing --copy`；如果 `npx` 不可用，再 `git clone` 后复制整个目录。
> - 必须保留 `scripts/guard.js`、`LICENSE` 和 `SKILL.md`，不要只复制 `SKILL.md`。
> - 安装后检查目标目录，并告诉我 `/just-wishing` 是否已经可用。
> - 如果你不能写文件，请给我可直接执行的命令，不要只给链接。

AI 安装时也应遵守上面的目标目录规则：

- Claude Code：`~/.claude/skills/just-wishing/`
- DSH / Codex / TRAE / 通用 Agent Skills：`~/.agents/skills/just-wishing/`

安装后重启工具或重新打开会话，`/just-wishing` 才会出现在技能列表中。

## 工作流程

1. **暴力降维**：只保留一个核心动作。
2. **强制宣告**：直接说明本期范围和被驳回项。
3. **范围冻结**：其他需求写入项目根目录 `TODO.md`。
4. **preflight**：运行本地环境检查。
5. **备份**：Git tag 或同级 `.bak` 目录。
6. **只建 MVP**：不加衍生功能。
7. **验证与提交**：测试通过、`commit-check` 通过后再提交。

## 本地 guard

```bash
# 环境预检
node scripts/guard.js preflight --dir . --use self

# 备份
node scripts/guard.js backup --dir . --label my-change

# 提交前检查
node scripts/guard.js commit-check --dir .

# 可选：安装 pre-commit 钩子
node scripts/guard.js install-hook --dir .
```

`--use` 可选：`self`、`free-closed`、`open-source`、`commercial`。

## 测试

```bash
npm test
```

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
