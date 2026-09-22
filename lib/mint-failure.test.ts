import { describe, expect, test } from "vitest";
import { CrossmintApiError } from "@/lib/crossmint-api";
import { CVC_RECOLLECTION_REQUIRED_CODE } from "@/lib/crossmint-types";
import { describeMintFailure } from "@/lib/mint-failure";

describe("describeMintFailure", () => {
  test.each([
    {
      name: "CVC recollection 409 hides the red error and opens the CVC form",
      err: new CrossmintApiError("Card security code must be collected again", CVC_RECOLLECTION_REQUIRED_CODE),
      expected: { message: "", cvcRecollectionRequired: true },
    },
    {
      name: "other API errors keep their message",
      err: new CrossmintApiError("Insufficient funds", "ORDER_INTENT_INSUFFICIENT_FUNDS"),
      expected: { message: "Insufficient funds", cvcRecollectionRequired: false },
    },
    {
      name: "API errors without a code keep their message",
      err: new CrossmintApiError("HTTP 500"),
      expected: { message: "HTTP 500", cvcRecollectionRequired: false },
    },
    {
      name: "plain errors keep their message",
      err: new Error("network down"),
      expected: { message: "network down", cvcRecollectionRequired: false },
    },
    {
      name: "non-Error throws fall back to a generic message",
      err: "boom",
      expected: { message: "Failed to reveal credentials", cvcRecollectionRequired: false },
    },
  ])("$name", ({ err, expected }) => {
    expect(describeMintFailure(err)).toEqual(expected);
  });
});
