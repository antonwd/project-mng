"use client";

import { useOptimistic, useTransition, useCallback } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/toast";

type Options<Item, K> = {
  initial: Item[];
  addAction: (item: Item) => Promise<ActionResult>;
  removeAction: (key: K) => Promise<ActionResult>;
  keyFn: (item: Item) => K;
  toastMessages: {
    addSuccess: string;
    addErrorPrefix: string;
    removeSuccess: string;
    removeErrorPrefix: string;
  };
};

type OptimisticOp<Item, K> =
  | { kind: "add"; item: Item }
  | { kind: "remove"; key: K };

export function useOptimisticAction<Item, K>({
  initial,
  addAction,
  removeAction,
  keyFn,
  toastMessages,
}: Options<Item, K>) {
  const [items, applyOptimistic] = useOptimistic<Item[], OptimisticOp<Item, K>>(
    initial,
    (current, op) => {
      if (op.kind === "add") return [...current, op.item];
      return current.filter((i) => keyFn(i) !== op.key);
    },
  );
  const [pending, startTransition] = useTransition();

  const add = useCallback(
    (item: Item) => {
      startTransition(async () => {
        applyOptimistic({ kind: "add", item });
        const result = await addAction(item);
        if (result.ok) {
          toast.success(toastMessages.addSuccess);
        } else {
          toast.error(`${toastMessages.addErrorPrefix}: ${result.error}`);
        }
      });
    },
    [addAction, applyOptimistic, toastMessages.addSuccess, toastMessages.addErrorPrefix],
  );

  const remove = useCallback(
    (key: K) => {
      startTransition(async () => {
        applyOptimistic({ kind: "remove", key });
        const result = await removeAction(key);
        if (result.ok) {
          toast.success(toastMessages.removeSuccess);
        } else {
          toast.error(`${toastMessages.removeErrorPrefix}: ${result.error}`);
        }
      });
    },
    [removeAction, applyOptimistic, toastMessages.removeSuccess, toastMessages.removeErrorPrefix],
  );

  return { items, add, remove, pending };
}
