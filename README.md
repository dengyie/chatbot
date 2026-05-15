# WeChat Chatbot

基于 Bun 和 TypeScript 的微信聊天机器人服务。当前版本面向微信公众号/测试号的服务器接入模式：微信服务器把用户消息 POST 到本服务，本服务完成签名校验、XML 解析，并返回文本回复。

## 项目执行流程

1. 准备运行环境：安装 Bun，复制 `.env.example` 为 `.env`，填写 `WECHAT_TOKEN`。
2. 启动本地服务：执行 `bun run dev`，服务默认监听 `http://localhost:3000`。
3. 暴露公网地址：本地调试可使用 ngrok、cloudflared tunnel 等内网穿透工具，把本机服务映射成 HTTPS 公网地址。
4. 配置微信后台：在微信公众号/测试号的“服务器配置”里填写 `URL` 为 `https://你的域名/wechat`，`Token` 与 `.env` 的 `WECHAT_TOKEN` 保持一致。
5. 接入验证：微信会用 GET 请求访问 `/wechat`，服务校验 `signature/timestamp/nonce/echostr` 后返回 `echostr`。
6. 接收消息：微信把用户消息用 XML POST 到 `/wechat`，服务再次验签并解析消息体。
7. 生成回复：`src/bot/reply.ts` 根据消息类型生成文本回复；后续可在这里接入大模型、数据库或业务系统。
8. 返回微信：服务把回复包装为微信要求的 XML，并在 5 秒内响应。
9. 部署上线：如果只是个人或小规模使用，也可以继续在本机运行 Bun 服务并保持内网穿透在线；如果要长期稳定运行，再考虑云服务器、域名、HTTPS、端口和防火墙配置。

## 快速开始

```bash
cp .env.example .env
bun install
bun run dev
```

健康检查：

```bash
curl http://localhost:3000/health
```

## 本地运行 + 内网穿透

如果你希望服务一直运行在自己的电脑上，可以按这个方式调试和使用：

1. 安装 cloudflared。如果已经安装过，可以跳过这一步：

```bash
brew install cloudflared
```

2. 启动本地 Bun 服务：

```bash
bun run dev
```

3. 用 Cloudflare Quick Tunnel 把本地 `3000` 端口暴露成 HTTPS 地址。如果你改了服务端口，把命令里的 `3000` 换成真实端口：

```bash
cloudflared tunnel --url http://localhost:3000
```

运行后它会输出一个类似这样的公网地址：

```text
https://example.trycloudflare.com
```

这个地址就是当前本机后端的公网 HTTPS 地址。

4. 在微信公众平台或测试号后台配置：

```text
URL: https://example.trycloudflare.com/wechat
Token: 与 .env 里的 WECHAT_TOKEN 一致
```

5. 保持两个进程都在运行：

- `bun run dev`
- `cloudflared tunnel --url http://localhost:3000`

注意：这种方式不需要购买服务器或域名，适合正式调试和临时展示；但电脑关机、休眠、网络断开、内网穿透进程退出后，微信就访问不到服务了。Quick Tunnel 的免费临时域名也可能变化，每次变化后都需要重新配置微信后台 URL。

以后如果项目做大，或者需要更稳定、专业的访问地址，可以把 Quick Tunnel 升级为 Cloudflare 托管隧道，并绑定自己的域名。域名可以使用付费域名，也可以尝试可用的免费域名；无论哪种方式，都建议把 DNS 托管到 Cloudflare 上，再把域名指向隧道。

## 目录结构

```text
src/
  bot/
    reply.ts          # 机器人回复逻辑
  config/
    env.ts            # 环境变量读取与校验
  wechat/
    signature.ts      # 微信签名校验
    types.ts          # 微信消息类型
    xml.ts            # XML 解析与回复生成
  index.ts            # HTTP 入口
```

## 下一步建议

- 在 `src/bot/reply.ts` 中接入 OpenAI、企业知识库或自有业务 API。
- 如需处理图片、语音、事件消息，可扩展 `WechatIncomingMessage` 类型和 `createReply`。
- 生产环境建议增加请求日志、错误监控、限流和消息去重。
