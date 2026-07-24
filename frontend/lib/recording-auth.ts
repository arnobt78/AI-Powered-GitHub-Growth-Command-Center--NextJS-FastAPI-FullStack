import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.RECORDING_AUTH_SECRET ?? "";
// Matches the recorder's actual single-page, one-navigation usage (see
// backend/app/recording_auth.py) — kept tight since this token is also the
// bypass's replay window (an empty SECRET would make this fail-closed
// instead, see the check below, but a short TTL still limits a leaked
// token's usefulness).
const TOKEN_TTL_SECONDS = 60;

function sign(payloadB64: string): string {
  return createHmac("sha256", SECRET).update(payloadB64).digest("hex");
}

// Test-side mint exists so tests can construct valid tokens without
// duplicating the HMAC scheme inline — mirrors internal_auth.py's own
// test-mint precedent in reverse. Production tokens are minted by the
// backend (backend/app/recording_auth.py), from a verified Auth.js-free
// server-side request, never by the browser.
export function mintRecordingToken(repoId: number, userId: number): string {
  const payload = JSON.stringify({
    repo_id: repoId,
    user_id: userId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  const payloadB64 = Buffer.from(payload, "utf-8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Verifies a recording_token minted by the backend and returns the repo it's
// scoped to, or null on any failure (malformed, tampered, expired, missing
// fields) — deliberately non-throwing since the caller (auth.ts's authorized
// callback) just needs a yes/no gate, not exception handling per request.
export function verifyRecordingToken(token: string): { repoId: number; userId: number } | null {
  // Fail closed, not open: an unset secret must never make every token's
  // signature trivially forgeable (createHmac("sha256", "") is still a
  // valid, predictable key). A misconfigured deploy should break the
  // recorder loudly, not silently open this app's global auth gate to
  // anyone who reads this file.
  if (!SECRET) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, signature] = parts;

  const expectedSignature = sign(payloadB64);
  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  let payload: { repo_id?: unknown; user_id?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return null;
  }

  if (typeof payload.repo_id !== "number" || typeof payload.user_id !== "number" || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return { repoId: payload.repo_id, userId: payload.user_id };
}

// Extracts the repo id from a /repos/{id}(...) pathname, or null if the path
// isn't a repo-detail page — used to bind a recording_token's repo_id to the
// actual page being requested, so a captured/logged token can't be replayed
// against a different repo the token wasn't minted for.
function repoIdFromPathname(pathname: string): number | null {
  const match = pathname.match(/^\/repos\/(\d+)\/?$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

// The single check auth.ts's authorized callback delegates to: does this
// request carry a valid, unexpired recording_token whose bound repo_id
// matches the repo-detail page it's actually requesting? userId is part of
// the signed payload (an audit trail of who triggered the recording) but
// deliberately not enforced here — repo_id is the only scope this gate
// grants or checks.
export function isAuthorizedRecordingRequest(request: { nextUrl: URL }): boolean {
  const token = request.nextUrl.searchParams.get("recording_token");
  if (!token) {
    return false;
  }
  const verified = verifyRecordingToken(token);
  if (!verified) {
    return false;
  }
  const pathRepoId = repoIdFromPathname(request.nextUrl.pathname);
  return pathRepoId !== null && pathRepoId === verified.repoId;
}
