import type { ServerWebSocket, Server } from "bun";

export type ChatMessage = {
  type: "incoming" | "outgoing";
  from: string;
  to: string;
  text: string;
  time: string;
};

const clients = new Set<ServerWebSocket<unknown>>();

export function broadcastMessage(msg: ChatMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    ws.send(data);
  }
}

export function startWebServer(port: number): void {
  if (!port || port <= 0) {
    console.log("[Web] 未配置端口，跳过 Web 服务");
    return;
  }

  Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 });
        return undefined;
      }

      return new Response(Bun.file("./src/web/index.html"));
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        console.log("[Web] 客户端连接");
      },
      close(ws) {
        clients.delete(ws);
        console.log("[Web] 客户端断开");
      },
      message(_ws, _message) {},
    },
  });

  console.log(`[Web] 消息面板: http://localhost:${port}`);
}
