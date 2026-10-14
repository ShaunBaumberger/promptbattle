/** Shared result shapes for all AI providers. */

export interface GeneratedMedia {
  bytes: Buffer;
  mimeType: string;
}

/**
 * One poll of a long-running video job:
 *   pending → still rendering, poll again later
 *   done    → bytes downloaded, ready to upload
 *   error   → failed / blocked by the provider's safety filter
 */
export type VideoPollResult =
  | { status: "pending" }
  | { status: "error"; error: string }
  | { status: "done"; bytes: Buffer; mimeType: string };
