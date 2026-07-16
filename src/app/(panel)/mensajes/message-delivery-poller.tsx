"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MessageDeliveryPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += 3_000;
      if (elapsed >= 2 * 60_000) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return null;
}
