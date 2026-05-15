import type { AppEnv } from "../config/env";
import type { WechatIncomingMessage } from "../wechat/types";

export async function createReply(
  message: WechatIncomingMessage,
  env: AppEnv
): Promise<string> {
  if (message.msgType === "event") {
    return handleEvent(message, env);
  }

  if (message.msgType !== "text") {
    return "我现在先支持文本消息，图片、语音和事件处理可以继续扩展。";
  }

  const content = message.content?.trim();

  if (!content) {
    return "我收到了空消息，可以换一句再试试。";
  }

  if (content === "帮助" || content.toLowerCase() === "help") {
    return `你好，我是 ${env.botName}。发送任意文本，我会先以回声模式回复；后续可以在 reply.ts 接入大模型。`;
  }

  return `收到：${content}`;
}

function handleEvent(message: WechatIncomingMessage, env: AppEnv): string {
  if (message.event === "subscribe") {
    return `欢迎关注，我是 ${env.botName}。发送“帮助”可以查看当前能力。`;
  }

  return "事件已收到。";
}
