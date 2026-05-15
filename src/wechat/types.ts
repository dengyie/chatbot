export type WechatMessageType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "shortvideo"
  | "location"
  | "link"
  | "event";

export type WechatIncomingMessage = {
  toUserName: string;
  fromUserName: string;
  createTime: number;
  msgType: WechatMessageType;
  content?: string;
  msgId?: string;
  event?: string;
  raw: Record<string, string>;
};

export type WechatTextReply = {
  toUserName: string;
  fromUserName: string;
  content: string;
};
