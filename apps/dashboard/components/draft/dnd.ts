import type { DragEvent } from "react";
import type { SlotRef } from "@lolpamin/core";

// 다른 앱에서 끌어온 텍스트·파일을 무시하려고 전용 MIME을 쓴다.
const DRAG_TYPE = "application/x-lolpamin-draft";

export type DragPayload = { kind: "bench"; key: string } | { kind: "slot"; from: SlotRef };

export function setDragPayload(event: DragEvent, payload: DragPayload): void {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "move";
}

export function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_TYPE);
  if (raw === "") return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

// dragover에서 preventDefault를 해야 drop이 온다. 우리 페이로드일 때만 받는다.
export function acceptDrag(event: DragEvent): void {
  if (event.dataTransfer.types.includes(DRAG_TYPE)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }
}
