import type { ServerWebSocket } from "bun";
import QRCode from "qrcode";

export type ChatMessage = {
  type: "incoming" | "outgoing";
  from: string;
  to: string;
  text: string;
  time: string;
};

export type StatusMessage = {
  type: "status";
  status: "scan" | "login" | "logout" | "error" | "reconnecting";
  text: string;
  qrUrl?: string;
  time: string;
};

export type WSMessage = ChatMessage | StatusMessage;

export type HistorySync = {
  type: "history";
  messages: ChatMessage[];
};

const MAX_HISTORY = 200;
const history: ChatMessage[] = [];
const clients = new Set<ServerWebSocket<unknown>>();
let lastStatus: StatusMessage | null = null;
let currentQrDataUrl: string | null = null;

function sendJson(ws: ServerWebSocket<unknown>, data: unknown) {
  try { ws.send(JSON.stringify(data)); } catch { /* ignore */ }
}

function broadcastRaw(data: string) {
  for (const ws of clients) {
    try { ws.send(data); } catch { /* ignore */ }
  }
}

export function broadcast(msg: WSMessage): void {
  if (msg.type === "status") {
    lastStatus = msg;
    if (msg.status === "scan" && msg.qrUrl) {
      const encoded = msg.qrUrl.replace(/^.*\/qrcode\//, "");
      const wechatUrl = decodeURIComponent(encoded);
      QRCode.toDataURL(wechatUrl, { width: 200, margin: 1 })
        .then((dataUrl) => {
          currentQrDataUrl = dataUrl;
          broadcastRaw(JSON.stringify({ ...msg, qrDataUrl: dataUrl }));
        })
        .catch((err) => console.error("[QR] 生成失败:", err));
    }
  }
  if (msg.type === "incoming" || msg.type === "outgoing") {
    history.push(msg);
    if (history.length > MAX_HISTORY) history.shift();
  }
  broadcastRaw(JSON.stringify(msg));
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
        console.log(`[Web] 客户端连接 (历史消息 ${history.length} 条)`);
        // Send history first, then current status
        sendJson(ws, { type: "history", messages: [...history] });
        if (lastStatus) {
          const msg = currentQrDataUrl && lastStatus.status === "scan"
            ? { ...lastStatus, qrDataUrl: currentQrDataUrl }
            : lastStatus;
          sendJson(ws, msg);
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
