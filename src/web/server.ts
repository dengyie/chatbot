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

const clients = new Set<ServerWebSocket<unknown>>();
let lastStatus: StatusMessage | null = null;
let currentQrDataUrl: string | null = null;

function sendJson(ws: ServerWebSocket<unknown>, data: unknown) {
  try { ws.send(JSON.stringify(data)); } catch { /* ignore */ }
}

export function broadcast(msg: WSMessage): void {
  if (msg.type === "status") {
    lastStatus = msg;
    if (msg.status === "scan" && msg.qrUrl) {
      // Extract the WeChat login URL from the Wechaty QR page URL
      const encoded = msg.qrUrl.replace(/^.*\/qrcode\//, "");
      const wechatUrl = decodeURIComponent(encoded);
      // Generate QR code data URL for the WeChat login URL
      QRCode.toDataURL(wechatUrl, { width: 200, margin: 1 })
        .then((dataUrl) => {
          currentQrDataUrl = dataUrl;
          // Send updated status with qrDataUrl
          const updated = { ...msg, qrDataUrl: dataUrl };
          const data = JSON.stringify(updated);
          for (const ws of clients) {
            try { ws.send(data); } catch { /* ignore */ }
          }
        })
        .catch((err) => console.error("[QR] 生成失败:", err));
      // Also broadcast immediately without QR image for fast feedback
    }
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
        if (lastStatus) {
          // Send cached status, with QR data URL if available
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
