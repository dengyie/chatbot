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
