"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Fires a one-off success toast on mount, then strips the query string so
 * a page reload doesn't re-toast. Used for post-redirect feedback from
 * server actions (e.g. "?copied=1" after duplicating a tournament) —
 * server actions can't toast directly, only client components can.
 */
export function FlashToast({ message }: { message: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast.success(message);
    router.replace(pathname, { scroll: false });
  }, [message, pathname, router]);

  return null;
}
