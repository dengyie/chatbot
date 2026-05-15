import { WechatyBuilder, ScanStatus } from "wechaty";
import type { Wechaty, Contact } from "wechaty";
import { createReplyLogic } from "../bot/reply";
import type { ChatMessage, StatusMessage } from "../web/server";

type Callbacks = {
  onMessage?: (msg: ChatMessage) => void;
  onStatus?: (msg: StatusMessage) => void;
};

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
  const options: Record<string, unknown> = { puppet: puppetType };

  if (puppetToken) {
    options.puppetOptions = { token: puppetToken };
  }

  const bot = WechatyBuilder.build(options);

  bot.on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
      const qrUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
      console.log(`[Scan] 扫码登录: ${qrUrl}`);
      onStatus?.({ type: "status", status: "scan", text: "请用微信扫码登录", qrUrl, time: now() });
    }
  });

  bot.on("login", (user: Contact) => {
    const text = `${user.name()} 登录成功`;
    console.log(`[Login] ${text}`);
    onStatus?.({ type: "status", status: "login", text, time: now() });
  });

  bot.on("logout", (user: Contact, reason?: string) => {
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
      to: botName ?? "wechat-chatbot",
      text,
      time: now(),
    });

    const reply = await createReplyLogic(text, botName ?? "wechat-chatbot");

    onMessage?.({
      type: "outgoing",
      from: botName ?? "wechat-chatbot",
      to: from,
      text: reply,
      time: now(),
    });

    await message.say(reply);
  });

  bot.on("error", (error: Error) => {
    console.error("[Error]", error.message);
    onStatus?.({ type: "status", status: "error", text: error.message, time: now() });
  });

  return bot;
}
