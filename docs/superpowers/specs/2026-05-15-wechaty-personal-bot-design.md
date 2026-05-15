# WeChat Personal Bot — Design Spec

> Status: Draft | 2026-05-15 | Target: 个人微信号自动回复服务

## 1. Overview

**Goal**: 在现有 `wechat-chatbot` 项目基础上重构，从"公众号被动回复模式"切换为"Wechaty 个人号长连接模式"。只需互联网接入 + 账号凭证即可收发消息。

**Non-Goal**: 不涉及公众号、企业微信、网页微信协议、多租户。

**Reuse**: `bot/reply.ts` 核心回复逻辑保持不变，其余模块按需替换。

---

## 2. Requirements

| ID | 需求 | 优先级 | 说明 |
|----|------|--------|------|
| R1 | 扫码登录 | P0 | 启动后输出二维码链接，手机扫码登录 |
| R2 | Token 登录 | P0 | 填入 Puppet Token 后无头运行，适合部署 |
| R3 | 收到文本消息 → 自动回复 | P0 | 复用 `bot/reply.ts` 回声逻辑 |
| R4 | 忽略自己发出的消息 | P0 | 防止 self-loop |
| R5 | 启动/登录状态日志 | P1 | 控制台输出扫码提示、登录成功、掉线等 |
| R6 | 掉线自动重连 | P1 | Puppet 层面已支持，仅需确认配置 |
| R7 | 环境变量驱动 | P1 | PUPPET_TOKEN、PUPPET_TYPE、BOT_NAME |
| R8 | 保持现有测试通过 | P1 | 不破坏 `wechat/signature` 和 `xml` 模块 |
| R9 | OpenAI 接入预留 | P2 | `reply.ts` 保持接口不变，后续替换实现 |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│             WeChat Cloud Servers                 │
└──────────────┬──────────────────────────────────┘
               │ proprietary protocol
               ▼
┌──────────────────────────────────────────────────┐
│           Puppet (padlocal / donut)               │
│  - 维持心跳 & 登录态                              │
│  - 收发消息（文本、图片、语音等）                  │
│  - 联系人/群列表管理                              │
└──────────────┬───────────────────────────────────┘
               │ Wechaty events
               ▼
┌──────────────────────────────────────────────────┐
│               Wechaty Bot 层                      │
│                                                   │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ onScan() │  │ onLogin()  │  │ onMessage()  │  │
│  │ 扫码处理  │  │ 登录成功    │  │  消息路由    │  │
│  └──────────┘  └────────────┘  └──────┬───────┘  │
│                                       │           │
│                          ┌────────────▼─────────┐ │
│                          │   bot/reply.ts       │ │
│                          │   createReplyLogic() │ │
│                          └──────────────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │           config/env.ts                       │ │
│  │ PUPPET_TOKEN | PUPPET_TYPE | BOT_NAME       │ │
│  └──────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

**关键变化**:

- ❌ 去掉 HTTP Server（`Bun.serve`） — 不再被动等微信回调
- ❌ 去掉签名校验（`signature.ts`） — Wechaty 不做签名
- ❌ 去掉 XML 解析/构造（`xml.ts`） — Wechaty SDK 已处理
- ✅ 新增 Wechaty 事件循环 — `src/wechat/bot.ts`
- 🔄 改造 `config/env.ts` — 新增 Puppet 相关环境变量
- ✅ 保留 `bot/reply.ts` — 核心逻辑不变

---

## 4. File Structure

```
src/
├── index.ts                    # 入口：启动 Wechaty bot
├── config/
│   └── env.ts                  # 环境变量（新增 PUPPET_TOKEN/PUPPET_TYPE）
├── wechat/
│   ├── bot.ts                  # [NEW] Wechaty bot 初始化 & 事件绑定
│   ├── signature.ts            # [KEEP] 保留，不删除（未来可能复用）
│   ├── types.ts                # [KEEP] 微信消息类型
│   ├── xml.ts                  # [KEEP] 保留
│   ├── signature.test.ts       # [KEEP] 测试保留
│   └── xml.test.ts             # [KEEP] 测试保留
├── bot/
│   └── reply.ts                # [MODIFY] 改为接收 string，接口微调
docs/
└── superpowers/
    └── specs/
        └── 2026-05-15-wechaty-personal-bot-design.md
```

---

## 5. Code Design

### 5.1 `config/env.ts` — 扩展环境变量

```ts
export type AppEnv = {
  // 旧字段保留
  port: number;
  wechatToken: string;
  wechatEncodingAesKey?: string;
  wechatAppId?: string;
  botName: string;
  // 新增字段
  puppetToken?: string;     // Token 登录用
  puppetType: string;       // "wechaty-puppet-padlocal" 等
};

export function loadEnv(): AppEnv {
  return {
    // ... old fields with defaults ...
    puppetToken: Bun.env.PUPPET_TOKEN || undefined,
    puppetType: Bun.env.PUPPET_TYPE || "wechaty-puppet-padlocal",
  };
}
```

**Login Strategy**:

- `PUPPET_TOKEN` 存在 → 用 Token 无头登录
- `PUPPET_TOKEN` 为空 → 用扫码登录

### 5.2 `src/wechat/bot.ts` — Wechaty Bot 本体

```ts
import { WechatyBuilder, ScanStatus, log } from "wechaty";
import { createReplyLogic } from "../bot/reply";

export function createBot(puppetType: string, puppetToken?: string) {
  const options: any = { puppet: puppetType };

  // Token 登录
  if (puppetToken) {
    options.puppetOptions = { token: puppetToken };
  }

  const bot = WechatyBuilder.build(options);

  bot
    .on("scan", (qrcode, status) => {
      if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
        const qrUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
        console.log(`[Scan] 扫码登录: ${qrUrl}`);
      }
    })
    .on("login", (user) => {
      console.log(`[Login] ${user.name()} 登录成功`);
    })
    .on("logout", (user, reason) => {
      console.log(`[Logout] ${user.name()} 已登出: ${reason}`);
    })
    .on("message", async (message) => {
      // 忽略自己的消息
      if (message.self()) return;

      const text = message.text();
      if (!text) return;

      const reply = await createReplyLogic(text);
      await message.say(reply);
    })
    .on("error", (error) => {
      console.error("[Error]", error);
    });

  return bot;
}
```

### 5.3 `src/bot/reply.ts` — 回复逻辑适配

```ts
// 改造前：接收 WechatIncomingMessage 对象
// 改造后：只接收纯文本，减少耦合

export async function createReplyLogic(text: string): Promise<string> {
  const content = text.trim();

  if (!content) {
    return "我收到了空消息，可以换一句再试试。";
  }

  if (content === "帮助" || content.toLowerCase() === "help") {
    return `你好，我是个人号助手。发送任意文本我会回复。`;
  }

  // 未来在这里接入 OpenAI
  return `收到：${content}`;
}

// 保留旧函数供公众号模式使用（向后兼容）
export { createReply } from "./reply";
```

实际上更简单的做法是保留 `createReply` 签名不变，在 `bot.ts` 中构造一个最小化的 `WechatIncomingMessage` 传入。**两种方式都行，推荐第一种（字符串接口），更干净。**

### 5.4 `src/index.ts` — 新入口

```ts
import { loadEnv } from "./config/env";
import { createBot } from "./wechat/bot";

const env = loadEnv();

const bot = createBot(env.puppetType, env.puppetToken);

bot.start()
  .then(() => console.log(`${env.botName} 启动中...`))
  .catch((e) => {
    console.error("启动失败:", e);
    process.exit(1);
  });
```

---

## 6. Puppet Selection

| Puppet | Protocol | Recommended |
|--------|----------|-------------|
| `wechaty-puppet-padlocal` | iPad (7-day free trial) | ✅ Default |
| `wechaty-puppet-donut` | Windows Hook | Fallback |

**Environment**:

```env
# .env
PUPPET_TYPE=wechaty-puppet-padlocal

# 两种方式二选一：
# 方式 A: Token 登录（无头运行）
PUPPET_TOKEN=your-padlocal-token

# 方式 B: 扫码登录（留空即可）
# PUPPET_TOKEN=
```

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 账号被限制/封禁 | Low-Medium | High | 控制消息频率，不做群发/爆粉操作 |
| Puppet 服务中断 | Medium | High | Token 服务商 SLA 保障，备选 puppet |
| Token 过期 | Medium | Medium | 环境变量替换即可恢复 |
| 协议升级微信封堵 | Low | High | 关注 Wechaty 社区及时升级 |
| Bun 兼容性 | Low | Medium | Wechaty 主要测试 Node，Bun 需验证 |

---

## 8. Open Questions

1. 是否保留公众号模式的旧代码（HTTP Server + 签名）？当前方案保留。
2. OpenAI 接入是否在本期实现？P2 预留接口。
3. 群聊消息是否处理？当前只处理单聊文本。

---

## Dependencies

```json
// package.json 新增
{
  "dependencies": {
    "wechaty": "^1.20.0",
    "wechaty-puppet-padlocal": "^1.20.0"
  }
}
```

## 9. Acceptance Criteria

- [ ] `bun run dev` 启动后输出扫码链接
- [ ] 扫码成功后在终端打印 "登录成功"
- [ ] 发送消息收到回声 "收到：xxx"
- [ ] 设置 `PUPPET_TOKEN` 后无扫码直接登录
- [ ] 自己的消息不被回复
- [ ] `bun test` 现有测试全部通过
