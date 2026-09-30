"use server";

import { revalidatePath } from "next/cache";
import type { EventImageKind } from "@lolpamin/db";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import {
  addEventImage,
  createEventPost,
  deleteEventImage,
  deleteEventPost,
  EventPostValidationError,
  moveEventImage,
  setEventPostRevealed,
  updateEventPost,
} from "@/lib/mutations/event-posts";

interface EventActionResult {
  error: string | null;
}

// Validation messages are written for the operator; anything else (a Prisma error in
// English) is replaced by a short Korean fallback.
function toMessage(error: unknown, fallback: string): string {
  return error instanceof EventPostValidationError ? error.message : fallback;
}

function revalidatePost(postId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${postId}`);
  revalidatePath(`/events/${postId}/edit`);
}

function readInput(formData: FormData) {
  return { title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? "") };
}

// Returns the new id instead of calling redirect(): a redirecting action resolves the
// client's promise with undefined, which the form would then read as a result.
export async function createEventPostAction(formData: FormData): Promise<EventActionResult & { id?: string }> {
  const acting = await requireAdmin();
  let id: string;
  try {
    id = (await createEventPost(prisma, readInput(formData), acting.id)).id;
  } catch (error) {
    return { error: toMessage(error, "글을 저장하지 못했습니다.") };
  }
  revalidatePath("/events");
  return { error: null, id };
}

export async function updateEventPostAction(id: string, formData: FormData): Promise<EventActionResult> {
  const acting = await requireAdmin();
  try {
    await updateEventPost(prisma, id, readInput(formData), acting.id);
  } catch (error) {
    return { error: toMessage(error, "글을 저장하지 못했습니다.") };
  }
  revalidatePost(id);
  return { error: null };
}

export async function deleteEventPostAction(id: string): Promise<EventActionResult> {
  await requireAdmin();
  try {
    await deleteEventPost(prisma, id);
  } catch (error) {
    return { error: toMessage(error, "글을 삭제하지 못했습니다.") };
  }
  revalidatePost(id);
  return { error: null };
}

export async function setEventPostRevealedAction(id: string, revealed: boolean): Promise<EventActionResult> {
  const acting = await requireAdmin();
  try {
    await setEventPostRevealed(prisma, id, revealed === true, acting.id);
  } catch (error) {
    return { error: toMessage(error, revealed ? "공개하지 못했습니다." : "숨기지 못했습니다.") };
  }
  revalidatePost(id);
  return { error: null };
}

// One file per call: each stays under the 20mb server-action body limit.
export async function addEventImageAction(formData: FormData): Promise<EventActionResult> {
  await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라주세요." };
  try {
    await addEventImage(prisma, postId, String(formData.get("kind")) as EventImageKind, {
      bytes: Buffer.from(await file.arrayBuffer()),
      type: file.type,
    });
  } catch (error) {
    return { error: toMessage(error, "사진을 올리지 못했습니다.") };
  }
  revalidatePost(postId);
  return { error: null };
}

export async function deleteEventImageAction(imageId: string): Promise<EventActionResult> {
  await requireAdmin();
  let postId: string | null;
  try {
    postId = await deleteEventImage(prisma, imageId);
  } catch (error) {
    return { error: toMessage(error, "사진을 삭제하지 못했습니다.") };
  }
  if (postId) revalidatePost(postId);
  return { error: null };
}

export async function moveEventImageAction(imageId: string, direction: "up" | "down"): Promise<EventActionResult> {
  await requireAdmin();
  let postId: string | null;
  try {
    postId = await moveEventImage(prisma, imageId, direction);
  } catch (error) {
    return { error: toMessage(error, "사진 순서를 바꾸지 못했습니다.") };
  }
  if (postId) revalidatePost(postId);
  return { error: null };
}
