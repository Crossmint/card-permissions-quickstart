// What Step 3 shows when POST /credentials fails. The CVC refusal is not an
// error to the user: the CVC form that fixes it takes over, so no red text.

import { apiErrorCode } from "@/lib/crossmint-api";
import { CVC_RECOLLECTION_REQUIRED_CODE } from "@/lib/crossmint-types";

export type MintFailure = {
  /** Red text under the allowance; empty when the UI explains the failure another way. */
  message: string;
  /** The vaulted CVC aged out between the last read and this mint. Re-read and show the CVC form. */
  cvcRecollectionRequired: boolean;
};

export function describeMintFailure(err: unknown): MintFailure {
  if (apiErrorCode(err) === CVC_RECOLLECTION_REQUIRED_CODE) {
    return { message: "", cvcRecollectionRequired: true };
  }
  return { message: err instanceof Error ? err.message : "Failed to reveal credentials", cvcRecollectionRequired: false };
}
