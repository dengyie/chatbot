import { loadEnv } from "./config/env";
import { createReply } from "./bot/reply";
import { verifyWechatSignature } from "./wechat/signature";
import { buildTextReplyXml, parseIncomingMessage } from "./wechat/xml";

const env = loadEnv();

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...init?.headers
    }
  });
}

function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}

function getWechatSignatureParams(url: URL) {
  return {
    signature: url.searchParams.get("signature"),
    timestamp: url.searchParams.get("timestamp"),
    nonce: url.searchParams.get("nonce")
  };
}

async function handleWechat(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const signatureParams = getWechatSignatureParams(url);
  const isVerified = verifyWechatSignature(env.wechatToken, signatureParams);

  if (!isVerified) {
    return textResponse("invalid signature", { status: 403 });
  }

  if (request.method === "GET") {
    return textResponse(url.searchParams.get("echostr") ?? "");
  }

  if (request.method !== "POST") {
    return textResponse("method not allowed", {
      status: 405,
      headers: { allow: "GET, POST" }
    });
  }

  try {
    const xml = await request.text();
    const message = parseIncomingMessage(xml);
    const content = await createReply(message, env);
    const replyXml = buildTextReplyXml({
      toUserName: message.fromUserName,
      fromUserName: message.toUserName,
      content
    });

    return xmlResponse(replyXml);
  } catch (error) {
    console.error(error);
    return textResponse("success");
  }
}

const server = Bun.serve({
  port: env.port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: env.botName });
    }

    if (url.pathname === "/wechat") {
      return handleWechat(request);
    }

    return textResponse("not found", { status: 404 });
  }
});

console.log(`${env.botName} listening on http://localhost:${server.port}`);
