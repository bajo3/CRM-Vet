"use client";

import { useEffect } from "react";
import { markConversationRead } from "@/lib/actions/messages";

export function ConversationReadMarker({ conversationId, unreadCount }: { conversationId: string; unreadCount: number }) {
  useEffect(() => {
    if (unreadCount > 0) void markConversationRead(conversationId);
  }, [conversationId, unreadCount]);
  return null;
}
