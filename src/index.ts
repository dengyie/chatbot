import { loadEnv } from "./config/env";
import { createBot } from "./wechat/bot";
import { startWebServer, broadcastMessage } from "./web/server";

const env = loadEnv();

const bot = createBot(env.puppetType, env.puppetToken, env.botName, (msg) => {
  broadcastMessage(msg);
});

startWebServer(env.webPort ?? 3100);

bot.start()
  .then(() => console.log(`${env.botName} 启动中...`))
  .catch((e: unknown) => {
    console.error("启动失败:", e);
    process.exit(1);
  });
