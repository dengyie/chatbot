import type { ServerWebSocket } from "bun";

export type ChatMessage = {
  type: "incoming" | "outgoing";
  from: string;
  to: string;
  text: string;
  time: string;
};

export type StatusMessage = {
  type: "status";
  status: "scan" | "login" | "logout" | "error";
  text: string;
  qrUrl?: string;
  time: string;
};

export type WSMessage = ChatMessage | StatusMessage;

const clients = new Set<ServerWebSocket<unknown>>();
let lastStatus: StatusMessage | null = null;

function sendJson(ws: ServerWebSocket<unknown>, data: unknown) {
  try {
    ws.send(JSON.stringify(data));
  } catch {
    // client disconnected, will be cleaned up on close
  }
}

export function broadcast(msg: WSMessage): void {
  if (msg.type === "status") {
    lastStatus = msg;
  }
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    try { ws.send(data); } catch { /* ignore */ }
  }
}

export function broadcastMessage(msg: ChatMessage): void {
  broadcast(msg);
}

export function broadcastStatus(status: StatusMessage): void {
  broadcast(status);
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
        // Immediately send current status so new clients see the latest state
        if (lastStatus) {
          sendJson(ws, lastStatus);
        }
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
