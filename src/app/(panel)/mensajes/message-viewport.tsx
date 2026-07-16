"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function MessageViewport({ children, lastMessageId }: { children: ReactNode; lastMessageId?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lastMessageId]);

  return <div ref={ref} className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">{children}</div>;
}
