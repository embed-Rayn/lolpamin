// Where to land after logging in. `next` comes from the URL, so only a path on this site is
// taken: "//evil.com" and "/\evil.com" are protocol-relative to a browser, and /login itself
// would loop. Anything else lands on home.
export function safeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) return "/";
  return value;
}

// The login URL that brings the admin back to `path` afterwards.
export function loginPathFor(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}
