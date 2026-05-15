# WeChat Personal Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 wechat-chatbot 从公众号模式切换到 Wechaty 个人号模式，支持扫码和 Token 双登录。

**Architecture:** 新增 `src/wechat/bot.ts` 封装 Wechaty 事件循环，改造 `bot/reply.ts` 为纯文本接口，扩展 `config/env.ts` 支持 Puppet 配置，`index.ts` 从 HTTP Server 改为 Wechaty 启动入口。

**Tech Stack:** Bun, TypeScript, Wechaty 1.x, wechaty-puppet-padlocal

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add wechaty and puppet dependencies**

```bash
bun add wechaty wechaty-puppet-padlocal
```

Expected: `package.json` updated with `wechaty` and `wechaty-puppet-padlocal` in `dependencies`.

- [ ] **Step 2: Verify install**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add wechaty and wechaty-puppet-padlocal dependencies"
```

---

### Task 2: Update Environment Config

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend AppEnv type and loadEnv function**

Replace `src/config/env.ts`:

```ts
export type AppEnv = {
  port: number;
  wechatToken: string;
  wechatEncodingAesKey?: string;
  wechatAppId?: string;
  botName: string;
  puppetToken?: string;
  puppetType: string;
};

function readRequiredEnv(name: string): string {
  const value = Bun.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadEnv(): AppEnv {
  const port = Number(Bun.env.PORT ?? 3000);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    port,
    wechatToken: readRequiredEnv("WECHAT_TOKEN"),
    wechatEncodingAesKey: Bun.env.WECHAT_ENCODING_AES_KEY || undefined,
    wechatAppId: Bun.env.WECHAT_APP_ID || undefined,
    botName: Bun.env.BOT_NAME ?? "wechat-chatbot",
    puppetToken: Bun.env.PUPPET_TOKEN || undefined,
    puppetType: Bun.env.PUPPET_TYPE || "wechaty-puppet-padlocal",
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Update .env.example**

Replace `.env.example`:

```env
PORT=3000
WECHAT_TOKEN=replace-with-your-wechat-token
WECHAT_ENCODING_AES_KEY=
WECHAT_APP_ID=
BOT_NAME=wechat-chatbot
PUPPET_TYPE=wechaty-puppet-padlocal
PUPPET_TOKEN=
```

- [ ] **Step 4: Commit**

```bash
git add src/config/env.ts .env.example
git commit -m "feat: add puppetToken and puppetType to AppEnv"
```

---

### Task 3: Create Wechaty Bot Module

**Files:**
- Create: `src/wechat/bot.ts`

- [ ] **Step 1: Create bot.ts with Wechaty events**

Create `src/wechat/bot.ts`:

```ts
import { WechatyBuilder, ScanStatus } from "wechaty";
import type { Wechaty, Contact } from "wechaty";
import { createReplyLogic } from "../bot/reply";

export function createBot(
  puppetType: string,
  puppetToken?: string,
  botName?: string,
): Wechaty {
  const options: Record<string, unknown> = { puppet: puppetType };

  if (puppetToken) {
    options.puppetOptions = { token: puppetToken };
  }

  const bot = WechatyBuilder.build(options);

  bot.on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
      const qrUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
      console.log(`[Scan] 扫码登录: ${qrUrl}`);
    }
  });

  bot.on("login", (user: Contact) => {
    console.log(`[Login] ${user.name()} 登录成功`);
  });

  bot.on("logout", (user: Contact, reason: string) => {
    console.log(`[Logout] ${user.name()} 已登出: ${reason}`);
  });

  bot.on("message", async (message) => {
    if (message.self()) return;

    const text = message.text();
    if (!text) return;

    const reply = await createReplyLogic(text, botName ?? "wechat-chatbot");
    await message.say(reply);
  });

  bot.on("error", (error: Error) => {
    console.error("[Error]", error.message);
  });

  return bot;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
bun run typecheck
```

Expected: May report `createReplyLogic` not found (we haven't created it yet). That's expected — we fix it in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/wechat/bot.ts
git commit -m "feat: add Wechaty bot module with scan/login/message events"
```

---

### Task 4: Adapt Reply Logic

**Files:**
- Modify: `src/bot/reply.ts`

- [ ] **Step 1: Rewrite reply.ts to use plain text interface**

Replace `src/bot/reply.ts`:

```ts
export async function createReplyLogic(
  text: string,
  botName: string,
): Promise<string> {
  const content = text.trim();

  if (!content) {
    return "我收到了空消息，可以换一句再试试。";
  }

  if (content === "帮助" || content.toLowerCase() === "help") {
    return `你好，我是 ${botName}。发送任意文本，我会先以回声模式回复；后续可以在 reply.ts 接入大模型。`;
  }

  return `收到：${content}`;
}

import type { AppEnv } from "../config/env";
import type { WechatIncomingMessage } from "../wechat/types";

export async function createReply(
  message: WechatIncomingMessage,
  env: AppEnv,
): Promise<string> {
  if (message.msgType === "event") {
    return handleEvent(message, env);
  }

  if (message.msgType !== "text") {
    return "我现在先支持文本消息，图片、语音和事件处理可以继续扩展。";
  }

  return createReplyLogic(message.content ?? "", env.botName);
}

function handleEvent(message: WechatIncomingMessage, env: AppEnv): string {
  if (message.event === "subscribe") {
    return `欢迎关注，我是 ${env.botName}。发送"帮助"可以查看当前能力。`;
  }

  return "事件已收到。";
}
```

- [ ] **Step 2: Verify typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Run existing tests**

```bash
bun test
```

Expected: Existing tests still pass. `reply.ts` tests may need updating if they test `createReply` directly — verify they pass.

- [ ] **Step 4: Commit**

```bash
git add src/bot/reply.ts
git commit -m "refactor: extract createReplyLogic with plain text interface"
```

---

### Task 5: Rewrite Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace HTTP server with Wechaty entry**

Replace `src/index.ts`:

```ts
import { loadEnv } from "./config/env";
import { createBot } from "./wechat/bot";

const env = loadEnv();

const bot = createBot(env.puppetType, env.puppetToken, env.botName);

bot.start()
  .then(() => console.log(`${env.botName} 启动中...`))
  .catch((e: unknown) => {
    console.error("启动失败:", e);
    process.exit(1);
  });
```

- [ ] **Step 2: Remove unused import for createReply in index.ts**

(Already handled — the rewrite replaces the entire file.)

- [ ] **Step 3: Verify typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: replace HTTP server with Wechaty bot entry"
```

---

### Task 6: Update Scripts and Verify Build

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update dev script for Wechaty mode**

Edit `package.json` scripts. The `dev` script already uses `bun --watch src/index.ts`, which is now correct for Wechaty. But add a note:

```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "dev:official": "bun --watch src/index.ts",
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit"
  }
}
```

- [ ] **Step 2: Final typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Run all tests**

```bash
bun test
```

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: update scripts for Wechaty mode"
```

---

### Task 7: Integration Verification

- [ ] **Step 1: Dry-run startup (without real token)**

```bash
bun run start
```

Expected: Output shows "启动中..." and Wechaty attempts to connect (will fail/scan without real token, that's fine).

- [ ] **Step 2: Final commit**

```bash
git add -A
git diff --cached --stat
git commit -m "feat: complete Wechaty personal bot migration"
```

---

### Summary

| Task | Files Changed | New Code |
|------|--------------|----------|
| 1. Install deps | `package.json`, `bun.lock` | — |
| 2. Update env config | `src/config/env.ts`, `.env.example` | 2 fields |
| 3. Create bot module | `src/wechat/bot.ts` (NEW) | ~50 lines |
| 4. Adapt reply logic | `src/bot/reply.ts` | ~10 lines changed |
| 5. Rewrite entry | `src/index.ts` | ~15 lines |
| 6. Update scripts | `package.json` | 1 line |
