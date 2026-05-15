import type { ServerWebSocket } from "bun";
import QRCode from "qrcode";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "../../data");
const MESSAGES_FILE = join(DATA_DIR, "messages.json");

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

const MAX_HISTORY = 500;
let history: ChatMessage[] = [];
const clients = new Set<ServerWebSocket<unknown>>();
let lastStatus: StatusMessage | null = null;
let currentQrDataUrl: string | null = null;
let isLoggedIn = false;

function loadHistory(): ChatMessage[] {
  try {
    if (existsSync(MESSAGES_FILE)) {
      const raw = readFileSync(MESSAGES_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data.slice(-MAX_HISTORY);
    }
  } catch (err) {
    console.error("[Store] 加载历史失败:", err);
  }
  return [];
}

function saveHistory() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(MESSAGES_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (err) {
    console.error("[Store] 保存历史失败:", err);
  }
}

history = loadHistory();
if (history.length > 0) {
  console.log(`[Store] 已加载 ${history.length} 条历史消息`);
}

function sendJson(ws: ServerWebSocket<unknown>, data: unknown) {
  try { ws.send(JSON.stringify(data)); } catch { /* ignore */ }
}

function broadcastRaw(data: string) {
  for (const ws of clients) {
    try { ws.send(data); } catch { /* ignore */ }
  }
}

function sendHistoryToClient(ws: ServerWebSocket<unknown>) {
  sendJson(ws, { type: "history", messages: [...history] });
}

export function broadcast(msg: WSMessage): void {
  if (msg.type === "status") {
    lastStatus = msg;

    if (msg.status === "login") {
      isLoggedIn = true;
      // Push history to all connected clients on login
      for (const ws of clients) {
        sendHistoryToClient(ws);
      }
    } else if (msg.status === "logout") {
      isLoggedIn = false;
    }

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
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    saveHistory();
    // Only push to clients that have logged in
    if (isLoggedIn) {
      broadcastRaw(JSON.stringify(msg));
      return;
    }
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
        console.log("[Web] 客户端连接");
        // Only send status, NOT history until login
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
