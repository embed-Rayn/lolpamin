import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { listBgmTracks } from "@/lib/draw/bgm";

// Reads the directory on every request; a track dropped into public/bgm shows up
// without a rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "bgm");
    const entries = await readdir(dir);
    return NextResponse.json({ tracks: listBgmTracks(entries) });
  } catch {
    // No bgm directory at all — the player renders its empty state.
    return NextResponse.json({ tracks: [] });
  }
}
