import { describe, expect, test } from "bun:test";
import { buildTextReplyXml, parseIncomingMessage, parseWechatXml } from "./xml";

const incomingTextXml = `
<xml>
  <ToUserName><![CDATA[gh_app]]></ToUserName>
  <FromUserName><![CDATA[user_openid]]></FromUserName>
  <CreateTime>1710000000</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[你好]]></Content>
  <MsgId>123456</MsgId>
</xml>
`;

describe("wechat xml", () => {
  test("parses cdata and plain fields without swallowing root xml", () => {
    expect(parseWechatXml(incomingTextXml)).toEqual({
      ToUserName: "gh_app",
      FromUserName: "user_openid",
      CreateTime: "1710000000",
      MsgType: "text",
      Content: "你好",
      MsgId: "123456"
    });
  });

  test("parses incoming text message", () => {
    expect(parseIncomingMessage(incomingTextXml)).toMatchObject({
      toUserName: "gh_app",
      fromUserName: "user_openid",
      createTime: 1710000000,
      msgType: "text",
      content: "你好",
      msgId: "123456"
    });
  });

  test("builds text reply xml", () => {
    const xml = buildTextReplyXml({
      toUserName: "user_openid",
      fromUserName: "gh_app",
      content: "收到：你好"
    });

    expect(xml).toContain("<ToUserName><![CDATA[user_openid]]></ToUserName>");
    expect(xml).toContain("<FromUserName><![CDATA[gh_app]]></FromUserName>");
    expect(xml).toContain("<MsgType><![CDATA[text]]></MsgType>");
    expect(xml).toContain("<Content><![CDATA[收到：你好]]></Content>");
  });
});
