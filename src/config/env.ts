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
    puppetType: Bun.env.PUPPET_TYPE || "wechaty-puppet-wechat4u",
  };
}
