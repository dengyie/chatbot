import type { WechatIncomingMessage, WechatTextReply } from "./types";

const cdataFieldPattern = /<([A-Za-z0-9_]+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
const plainFieldPattern = /<([A-Za-z0-9_]+)>([^<>]*)<\/\1>/g;

function wrapCdata(value: string): string {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

export function parseWechatXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const match of xml.matchAll(cdataFieldPattern)) {
    const [, key, value] = match;
    result[key] = value ?? "";
  }

  for (const match of xml.matchAll(plainFieldPattern)) {
    const [, key, value] = match;
    result[key] = value ?? "";
  }

  return result;
}

export function parseIncomingMessage(xml: string): WechatIncomingMessage {
  const raw = parseWechatXml(xml);

  if (!raw.ToUserName || !raw.FromUserName || !raw.MsgType) {
    throw new Error("Invalid WeChat message XML");
  }

  return {
    toUserName: raw.ToUserName,
    fromUserName: raw.FromUserName,
    createTime: Number(raw.CreateTime ?? Date.now() / 1000),
    msgType: raw.MsgType as WechatIncomingMessage["msgType"],
    content: raw.Content,
    msgId: raw.MsgId,
    event: raw.Event,
    raw
  };
}

export function buildTextReplyXml(reply: WechatTextReply): string {
  const now = Math.floor(Date.now() / 1000);

  return [
    "<xml>",
    `<ToUserName>${wrapCdata(reply.toUserName)}</ToUserName>`,
    `<FromUserName>${wrapCdata(reply.fromUserName)}</FromUserName>`,
    `<CreateTime>${now}</CreateTime>`,
    `<MsgType>${wrapCdata("text")}</MsgType>`,
    `<Content>${wrapCdata(reply.content)}</Content>`,
    "</xml>"
  ].join("");
}
