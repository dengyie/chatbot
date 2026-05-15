import { WechatyBuilder, ScanStatus } from "wechaty";
import type { Wechaty, Contact } from "wechaty";
import { createReplyLogic } from "../bot/reply";
import type { ChatMessage, StatusMessage } from "../web/server";

function now() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

export function createBot(
  puppetType: string,
  puppetToken?: string,
  botName?: string,
  onMessage?: (msg: ChatMessage) => void,
  onStatus?: (msg: StatusMessage) => void,
): Wechaty {
  const name = botName ?? "wechat-chatbot";
  const options: Record<string, unknown> = { name, puppet: puppetType };

  if (puppetToken) {
    options.puppetOptions = { token: puppetToken };
  }

  const bot = WechatyBuilder.build(options);

  let loggedIn = false;
  let hadScan = false;

  bot.on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
      hadScan = true;
      const qrUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
      console.log(`[Scan] 扫码登录: ${qrUrl}`);
      onStatus?.({ type: "status", status: "scan", text: "请用微信扫码登录", qrUrl, time: now() });
    }
  });

  bot.on("login", (user: Contact) => {
    loggedIn = true;
    const tag = hadScan ? "" : " (会话恢复)";
    const text = `${user.name()} 登录成功${tag}`;
    console.log(`[Login] ${text}`);
    onStatus?.({ type: "status", status: "login", text, time: now() });
  });

  bot.on("logout", (user: Contact, reason?: string) => {
    loggedIn = false;
    const text = `${user.name()} 已登出${reason ? `: ${reason}` : ""}`;
    console.log(`[Logout] ${text}`);
    onStatus?.({ type: "status", status: "logout", text, time: now() });
  });

  bot.on("message", async (message) => {
    if (message.self()) return;

    const text = message.text();
    if (!text) return;

    const talker = message.talker();
    const from = talker.name() || talker.id;

    onMessage?.({
      type: "incoming",
      from,
      to: name,
      text,
      time: now(),
    });

    const reply = await createReplyLogic(text, name);

    onMessage?.({
      type: "outgoing",
      from: name,
      to: from,
      text: reply,
      time: now(),
    });

    await message.say(reply);
  });

  bot.on("error", (error: Error) => {
    const msg = error.message || String(error);
    if (msg.includes("socket connection was closed")) {
      if (loggedIn) {
        console.log("[Reconnect] 连接断开，尝试重连…");
        onStatus?.({ type: "status", status: "reconnecting", text: "连接断开，自动重连中…", time: now() });
      }
      return;
    }
    console.error("[Error]", msg);
    onStatus?.({ type: "status", status: "error", text: msg, time: now() });
  });

  return bot;
}
