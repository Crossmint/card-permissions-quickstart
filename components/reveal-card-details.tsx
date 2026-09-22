"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, CreditCard, Eye, EyeOff, KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { type Merchant, type OrderIntentResponse, type RailName, type RevealedCredentials, type RsaPublicJwk } from "@/lib/crossmint-types";
import { revealCardCredentials } from "@/lib/card-credentials";
import { decryptCardJwe, generateRsaKeyPairPem, importRsaPrivateKeyPem, importRsaPublicKeyPem } from "@/lib/encrypted-card";
import { errors as joseErrors } from "jose";
import { activeCardRails, activeSptRail, clampDelay, pendingCvcRecollectionRail } from "@/lib/rails";
import { RailBadge, RailRow, RailSelect } from "./rail-badge";
import { allowanceLimit, ExhaustedPill, isExhausted } from "./order-intents-list";
import { CvcRecollection } from "./cvc-recollection";
import { fetchOrderIntent } from "@/lib/crossmint-api";
import type { TraceContext } from "@/lib/api-trace";
import { describeMintFailure } from "@/lib/mint-failure";

// The encrypted-card rail returns no expiry. Hide those details after a fixed time.
const FALLBACK_HIDE_MS = 5 * 60 * 1000;

function formatCardNumber(number: string) {
  return number.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function hideAt(credentials: RevealedCredentials) {
  if (credentials.expiresAt) {
    const at = new Date(credentials.expiresAt).getTime();
    if (Number.isFinite(at)) return at;
  }
  return Date.now() + FALLBACK_HIDE_MS;
}

const inputClass =
  "w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20";
const pemClass = `${inputClass} font-mono text-[11px] leading-snug resize-y`;

// Per allowance: the RSA keys for the encrypted-card rail. Reveal sends the
// public key and returns a JWE. Decrypt is a separate step with the private key.
type KeyState = { publicPem: string; privatePem: string; decryptError: string };
const DEFAULT_KEY_STATE: KeyState = { publicPem: "", privatePem: "", decryptError: "" };
type EncryptionMode = "generated" | "custom";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#00150d]/60 hover:text-[#00150d]"
    >
      {copied ? <Check className="size-3 text-[#05B959]" /> : <Copy className="size-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function RevealCardDetails({
  orderIntents,
  loading,
  getJwt,
  onUpdated,
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  getJwt: () => string;
  /** Called with the re-read allowance after a card is minted, so the balance updates. */
  onUpdated?: (orderIntent: OrderIntentResponse) => void;
}) {
  const [expandedOrderIntentId, setExpandedOrderIntentId] = useState<string | null>(null);
  const [selectedRailByOrderIntentId, setSelectedRailByOrderIntentId] = useState<Record<string, RailName>>({});
  const [amount, setAmount] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
  const [networkBusinessProfile, setNetworkBusinessProfile] = useState("");
  const [revealingOrderIntentId, setRevealingOrderIntentId] = useState<string | null>(null);
  const [credentialsByOrderIntentId, setCredentialsByOrderIntentId] = useState<Record<string, RevealedCredentials>>({});
  const [encryptedJweByOrderIntentId, setEncryptedJweByOrderIntentId] = useState<Record<string, string>>({});
  // Keyed by orderIntentId so a failure shows under the allowance it belongs to.
  const [errorByOrderIntentId, setErrorByOrderIntentId] = useState<Record<string, string>>({});
  const [keyStateByOrderIntentId, setKeyStateByOrderIntentId] = useState<Record<string, KeyState>>({});
  const [encryptionModeByOrderIntentId, setEncryptionModeByOrderIntentId] = useState<Record<string, EncryptionMode>>({});
  const [decryptingOrderIntentId, setDecryptingOrderIntentId] = useState<string | null>(null);
  // Allowances whose last mint was refused with ORDER_INTENT_CVC_RECOLLECTION_REQUIRED.
  const [cvcRefusedOrderIntentIds, setCvcRefusedOrderIntentIds] = useState<ReadonlySet<string>>(new Set());
  // Re-reads of one allowance can overlap (rail selected, then Reveal). Only the
  // most recently started read may update the parent, so an older snapshot cannot
  // overwrite a newer one.
  const readSeqByOrderIntentId = useRef<Record<string, number>>({});

  const refreshAllowance = async (orderIntentId: string, context?: TraceContext) => {
    if (!onUpdated) return;
    const seq = (readSeqByOrderIntentId.current[orderIntentId] ?? 0) + 1;
    readSeqByOrderIntentId.current[orderIntentId] = seq;
    const latest = await fetchOrderIntent(getJwt(), orderIntentId, context);
    if (readSeqByOrderIntentId.current[orderIntentId] === seq) onUpdated(latest);
  };

  const updateKeyState = (orderIntentId: string, patch: Partial<KeyState>) =>
    setKeyStateByOrderIntentId((current) => ({
      ...current,
      [orderIntentId]: { ...(current[orderIntentId] ?? DEFAULT_KEY_STATE), ...patch },
    }));

  const setError = (orderIntentId: string, message: string) =>
    setErrorByOrderIntentId((current) => {
      const next = { ...current };
      if (message) next[orderIntentId] = message;
      else delete next[orderIntentId];
      return next;
    });

  const hideDetails = (orderIntentId: string) => {
    setCredentialsByOrderIntentId((current) => {
      const next = { ...current };
      delete next[orderIntentId];
      return next;
    });
  };

  useEffect(() => {
    const timers = Object.entries(credentialsByOrderIntentId).map(([orderIntentId, credentials]) =>
      window.setTimeout(() => hideDetails(orderIntentId), clampDelay(hideAt(credentials) - Date.now())),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [credentialsByOrderIntentId]);

  const revealDetails = async (
    orderIntent: OrderIntentResponse,
    options: { rail: RailName; amount?: string; merchant?: Merchant; networkBusinessProfile?: string; publicPem?: string; autoDecryptPrivatePem?: string },
  ) => {
    setError(orderIntent.orderIntentId, "");
    setRevealingOrderIntentId(orderIntent.orderIntentId);
    try {
      let publicKey: RsaPublicJwk | undefined;
      if (options.publicPem !== undefined) publicKey = await importRsaPublicKeyPem(options.publicPem);
      const credentials = await revealCardCredentials(getJwt(), orderIntent, { ...options, publicKey });
      if (credentials.kind === "jwe") {
        setEncryptedJweByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: credentials.jwe }));
      }
      if (credentials.kind === "jwe" && options.autoDecryptPrivatePem) {
        const privateKey = await importRsaPrivateKeyPem(options.autoDecryptPrivatePem);
        const card = await decryptCardJwe(credentials.jwe, privateKey);
        setCredentialsByOrderIntentId((current) => ({
          ...current,
          [orderIntent.orderIntentId]: {
            kind: "card",
            rail: "encrypted-card",
            number: String(card.number),
            expirationMonth: String(card.expirationMonth),
            expirationYear: String(card.expirationYear),
            cvc: String(card.cvc),
          },
        }));
      } else {
        setCredentialsByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: credentials }));
      }
      setExpandedOrderIntentId(null);
      // Minting reserves the amount. Re-read so the balance shown goes down.
      try {
        await refreshAllowance(orderIntent.orderIntentId);
      } catch (err) {
        console.error("Could not refresh the allowance after minting:", err);
      }
    } catch (err) {
      const failure = describeMintFailure(err);
      setError(orderIntent.orderIntentId, failure.message);
      // The 409 alone opens the CVC form; the re-read only syncs the rail badge.
      if (failure.cvcRecollectionRequired) {
        setCvcRefusedOrderIntentIds((current) => new Set(current).add(orderIntent.orderIntentId));
        setSelectedRailByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: "encrypted-card" }));
        setExpandedOrderIntentId(null);
        try {
          await refreshAllowance(orderIntent.orderIntentId);
        } catch (refreshErr) {
          console.error("Could not refresh the allowance after the CVC refusal:", refreshErr);
        }
      }
    } finally {
      setRevealingOrderIntentId(null);
    }
  };

  // Rail status is a read-time snapshot: the vaulted CVC can age out while the
  // page is open. Re-read before the user generates a key and clicks Reveal.
  const refreshBeforeMint = async (orderIntentId: string) => {
    try {
      await refreshAllowance(orderIntentId, "rail-selected");
    } catch (err) {
      console.error("Could not refresh the allowance before minting:", err);
    }
  };

  const revealEncryptedCard = async (orderIntent: OrderIntentResponse, mode: EncryptionMode, keyState: KeyState) => {
    if (mode === "custom") {
      await revealDetails(orderIntent, { rail: "encrypted-card", publicPem: keyState.publicPem });
      return;
    }

    try {
      const keys = await generateRsaKeyPairPem();
      updateKeyState(orderIntent.orderIntentId, { ...keys, decryptError: "" });
      await revealDetails(orderIntent, {
        rail: "encrypted-card",
        publicPem: keys.publicPem,
        autoDecryptPrivatePem: keys.privatePem,
      });
    } catch (err) {
      setError(orderIntent.orderIntentId, err instanceof Error ? err.message : "Could not create a temporary encryption key");
    }
  };

  // Decrypt the JWE in this tab with the pasted private key. Nothing leaves the browser.
  const decryptJwe = async (orderIntentId: string, jwe: string, privatePem: string) => {
    updateKeyState(orderIntentId, { decryptError: "" });
    setDecryptingOrderIntentId(orderIntentId);
    try {
      const privateKey = await importRsaPrivateKeyPem(privatePem);
      const card = await decryptCardJwe(jwe, privateKey);
      setCredentialsByOrderIntentId((current) => ({
        ...current,
        [orderIntentId]: {
          kind: "card",
          rail: "encrypted-card",
          number: String(card.number),
          expirationMonth: String(card.expirationMonth),
          expirationYear: String(card.expirationYear),
          cvc: String(card.cvc),
        },
      }));
    } catch (err) {
      updateKeyState(orderIntentId, {
        decryptError:
          err instanceof joseErrors.JWEDecryptionFailed
            ? "Decryption failed. This private key does not match the public key that was sent."
            : err instanceof Error
              ? err.message
              : "Failed to decrypt",
      });
    } finally {
      setDecryptingOrderIntentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 animate-pulse">
        <div className="size-5 rounded bg-black/[0.08] shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-36 rounded bg-black/[0.08]" />
          <div className="h-3 w-20 rounded bg-black/[0.05]" />
        </div>
      </div>
    );
  }

  if (orderIntents.length === 0) {
    return (
      <div className="rounded-lg bg-[#F6F6F6] px-4 py-3 text-sm text-[#00150d]/50">
        Create and verify an allowance in Step 2 before revealing card details.
      </div>
    );
  }

  return (
    <div className="space-y-[14px]">
      {orderIntents.map((orderIntent) => {
        const cardRails = activeCardRails(orderIntent);
        const spt = activeSptRail(orderIntent);
        // A rail waiting for its CVC is listed so the user can fix it here, but it cannot mint yet.
        const pendingCvc = pendingCvcRecollectionRail(orderIntent);
        const options = [...cardRails, ...(pendingCvc ? [pendingCvc] : []), ...(spt ? [spt] : [])];
        if (options.length === 0) return null;
        const selectedRail = options.find((rail) => rail.rail === selectedRailByOrderIntentId[orderIntent.orderIntentId]);
        const credentials = credentialsByOrderIntentId[orderIntent.orderIntentId];
        const deliveredRail = credentials && options.find((rail) => rail.rail === credentials.rail);
        const isExpanded = expandedOrderIntentId === orderIntent.orderIntentId;
        const isRevealing = revealingOrderIntentId === orderIntent.orderIntentId;
        const isEncrypted = selectedRail?.rail === "encrypted-card";
        const needsCvc =
          isEncrypted &&
          (selectedRail?.status === "pending_cvc_recollection" || cvcRefusedOrderIntentIds.has(orderIntent.orderIntentId));
        const keyState = keyStateByOrderIntentId[orderIntent.orderIntentId] ?? DEFAULT_KEY_STATE;
        const encryptedJwe = encryptedJweByOrderIntentId[orderIntent.orderIntentId];
        const encryptionMode = encryptionModeByOrderIntentId[orderIntent.orderIntentId] ?? "generated";
        const needsMerchant = !orderIntent.merchant;
        const error = errorByOrderIntentId[orderIntent.orderIntentId] ?? "";
        const exhausted = isExhausted(orderIntent);
        const availableLabel = `${orderIntent.amount.available} ${orderIntent.amount.currency.toUpperCase()}`;
        const missingPublicKey = isEncrypted && encryptionMode === "custom" && keyState.publicPem.trim() === "";
        const canReveal = Boolean(selectedRail) && !exhausted && !missingPublicKey && !needsCvc;
        const isDecrypting = decryptingOrderIntentId === orderIntent.orderIntentId;

        return (
          <div
            key={orderIntent.orderIntentId}
            // No overflow-hidden: the rail menu opens past this border.
            className="rounded-lg border border-[rgba(0,0,0,0.08)]"
          >
            <div className="bg-[#F6F6F6] px-4 py-3 rounded-t-[7px]">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-[#2377FF] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[#00150d] truncate">{orderIntent.description || "Agent card allowance"}</div>
                  <div className="text-xs text-[#00150d]/50">
                    {allowanceLimit(orderIntent)}
                    {orderIntent.merchant ? ` · ${orderIntent.merchant.name}` : ""}
                  </div>
                </div>
                {exhausted && !credentials ? (
                  <ExhaustedPill orderIntent={orderIntent} />
                ) : credentials ? (
                  <button
                    type="button"
                    onClick={() => hideDetails(orderIntent.orderIntentId)}
                    className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[#00150d]/60 hover:text-[#00150d]"
                  >
                    <EyeOff className="size-3.5" />
                    Hide details
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canReveal || isRevealing}
                    title={
                      canReveal
                        ? undefined
                        : needsCvc
                          ? "Enter the card's CVC again first"
                          : missingPublicKey
                            ? "Paste or generate a public key first"
                            : "Choose a rail first"
                    }
                    onClick={() => {
                      if (!selectedRail) return;
                      if (isEncrypted) {
                        void revealEncryptedCard(orderIntent, encryptionMode, keyState);
                        return;
                      }
                      setExpandedOrderIntentId(isExpanded ? null : orderIntent.orderIntentId);
                      setAmount(orderIntent.amount.available);
                      setError(orderIntent.orderIntentId, "");
                    }}
                    className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[#05B959] hover:text-[#049d4c] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRevealing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                    {isEncrypted && encryptionMode === "generated" ? "Reveal and decrypt" : "Reveal details"}
                  </button>
                )}
              </div>
              <div className="mt-2 pl-8">
                {exhausted && !credentials ? (
                  <RailRow rails={options} muted />
                ) : (
                  <RailSelect
                    rails={options}
                    selected={selectedRail?.rail}
                    onSelect={(rail) => {
                      setSelectedRailByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: rail }));
                      if (rail === "encrypted-card") {
                        setExpandedOrderIntentId((current) => (current === orderIntent.orderIntentId ? null : current));
                        void refreshBeforeMint(orderIntent.orderIntentId);
                      }
                      setError(orderIntent.orderIntentId, "");
                    }}
                  />
                )}
              </div>
            </div>

            {exhausted && !credentials && (
              <p className="px-4 py-3 text-xs text-[#00150d]/60">Each credential reserves its amount. Create a new allowance to mint another.</p>
            )}

            {needsCvc && !exhausted && !credentials && (
              <>
                {error && revealingOrderIntentId === null && <p className="px-4 pt-3 text-xs text-red-600 break-words">{error}</p>}
                <CvcRecollection
                  afterRefusedMint={cvcRefusedOrderIntentIds.has(orderIntent.orderIntentId)}
                  orderIntent={orderIntent}
                  jwt={getJwt()}
                  onRecollected={(latest) => {
                    setError(orderIntent.orderIntentId, "");
                    setCvcRefusedOrderIntentIds((current) => {
                      const next = new Set(current);
                      next.delete(orderIntent.orderIntentId);
                      return next;
                    });
                    // Newest snapshot: an older in-flight read must not overwrite it.
                    readSeqByOrderIntentId.current[orderIntent.orderIntentId] =
                      (readSeqByOrderIntentId.current[orderIntent.orderIntentId] ?? 0) + 1;
                    onUpdated?.(latest);
                  }}
                />
              </>
            )}

            {isEncrypted && !needsCvc && !exhausted && !credentials && (
              <div className="space-y-3 p-4">
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-xs font-medium text-[#00150d]/60">How should the card be encrypted?</legend>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${encryptionMode === "generated" ? "border-[#05B959] bg-[#F2FBF6]" : "border-[rgba(0,0,0,0.1)] hover:bg-[#F6F6F6]"}`}>
                    <input
                      type="radio"
                      name={`encryption-mode-${orderIntent.orderIntentId}`}
                      checked={encryptionMode === "generated"}
                      onChange={() => setEncryptionModeByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: "generated" }))}
                      className="mt-0.5 accent-[#05B959]"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[#00150d]">Generate a temporary key</span>
                      <span className="block text-xs leading-5 text-[#00150d]/55">Fastest. The card is decrypted automatically and the private key never leaves this tab.</span>
                    </span>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${encryptionMode === "custom" ? "border-[#05B959] bg-[#F2FBF6]" : "border-[rgba(0,0,0,0.1)] hover:bg-[#F6F6F6]"}`}>
                    <input
                      type="radio"
                      name={`encryption-mode-${orderIntent.orderIntentId}`}
                      checked={encryptionMode === "custom"}
                      onChange={() => setEncryptionModeByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: "custom" }))}
                      className="mt-0.5 accent-[#05B959]"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[#00150d]">Use my own public key</span>
                      <span className="block text-xs leading-5 text-[#00150d]/55">For testing a backend integration or decrypting elsewhere.</span>
                    </span>
                  </label>
                </fieldset>

                {encryptionMode === "custom" && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#00150d]/60">Public key (PEM, RSA 2048-bit)</label>
                    <textarea
                      value={keyState.publicPem}
                      onChange={(event) => updateKeyState(orderIntent.orderIntentId, { publicPem: event.target.value, privatePem: "" })}
                      placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
                      rows={5}
                      spellCheck={false}
                      className={pemClass}
                    />
                    <p className="text-[11px] text-[#00150d]/50">Crossmint encrypts the response to this key. Keep the matching private key available to decrypt it.</p>
                  </div>
                )}

                {error && revealingOrderIntentId === null && <p className="text-xs text-red-600 break-words">{error}</p>}
              </div>
            )}

            {isExpanded && selectedRail && !credentials && !isEncrypted && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void revealDetails(orderIntent, {
                    rail: selectedRail.rail,
                    amount,
                    merchant: needsMerchant ? { name: merchantName, url: merchantUrl, countryCode: "US" } : undefined,
                    networkBusinessProfile: selectedRail.rail === "spt" ? networkBusinessProfile : undefined,
                  });
                }}
                className="p-4 space-y-3"
              >
                {needsMerchant && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMerchantName("Whole Foods");
                        setMerchantUrl("https://www.wholefoodsmarket.com");
                      }}
                      className="text-xs text-[#05B959] hover:text-[#049d4c] underline underline-offset-2"
                    >
                      Fill example merchant
                    </button>
                  </div>
                )}
                <p className="text-xs text-[#00150d]/60">
                  This amount is reserved from the allowance. {availableLabel} available.
                </p>
                <div>
                  <label className="text-xs font-medium text-[#00150d]/60 block mb-1">
                    Charge amount ({orderIntent.amount.currency.toUpperCase()})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="^\d+(\.\d{1,2})?$"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                {needsMerchant && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant name</label>
                      <input
                        type="text"
                        value={merchantName}
                        onChange={(event) => setMerchantName(event.target.value)}
                        placeholder="e.g. Whole Foods"
                        required
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant URL</label>
                      <input
                        type="url"
                        value={merchantUrl}
                        onChange={(event) => setMerchantUrl(event.target.value)}
                        placeholder="e.g. https://www.wholefoodsmarket.com"
                        required
                        className={inputClass}
                      />
                    </div>
                  </>
                )}
                {selectedRail.rail === "spt" && (
                  <div>
                    <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Stripe Network Business Profile ID</label>
                    <input type="text" value={networkBusinessProfile} onChange={(event) => setNetworkBusinessProfile(event.target.value)} required className={inputClass} />
                  </div>
                )}
                {error && <p className="text-xs text-red-600 break-words">{error}</p>}
                <button
                  type="submit"
                  disabled={isRevealing}
                  className="flex items-center gap-2 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] disabled:opacity-60 px-4 py-2 rounded-md transition-colors"
                >
                  {isRevealing && <Loader2 className="size-3.5 animate-spin" />}
                  {selectedRail.rail === "spt" ? "Mint shared payment token" : "Mint one-time card"}
                </button>
              </form>
            )}

            {credentials && (
              <div className="border-t border-[rgba(0,0,0,0.08)] p-4 space-y-3">
                <div className="flex items-center gap-3 text-[11px] text-[#00150d]/60">
                  <span>Delivered on</span>
                  <RailBadge
                    rail={credentials.rail}
                    provider={
                      deliveredRail?.rail === "agentic-token"
                        ? deliveredRail.provider
                        : deliveredRail?.rail === "spt"
                          ? "stripe"
                          : undefined
                    }
                    compact
                  />
                  {credentials.rail === "encrypted-card" && selectedRail && selectedRail.rail !== "encrypted-card" && (
                    <span>after {selectedRail.rail} failed</span>
                  )}
                </div>
                {credentials.kind === "jwe" ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="text-xs text-[#00150d]/50">Encrypted card (compact JWE, RSA-OAEP-256 + A256GCM)</div>
                        <CopyButton text={credentials.jwe} label="Copy JWE" />
                      </div>
                      <div className="max-h-28 overflow-y-auto rounded-md bg-[#F6F6F6] px-3 py-2 font-mono text-[11px] leading-snug text-[#00150d] break-all">
                        {credentials.jwe}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#00150d]/45">
                      <LockKeyhole className="size-3 text-[#05B959]" />
                      Encrypted to your public key. Only the matching private key can read it.
                    </div>
                    <div className="rounded-md border border-[rgba(0,0,0,0.08)]">
                      <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#00150d]/70">
                        <KeyRound className="size-3.5" />
                        Decrypt in this browser
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void decryptJwe(orderIntent.orderIntentId, credentials.jwe, keyState.privatePem);
                        }}
                        className="space-y-2 border-t border-[rgba(0,0,0,0.08)] p-3"
                      >
                        <label className="text-xs font-medium text-[#00150d]/60 block">Private key (PEM, PKCS#8)</label>
                        <textarea
                          value={keyState.privatePem}
                          onChange={(event) => updateKeyState(orderIntent.orderIntentId, { privatePem: event.target.value, decryptError: "" })}
                          placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                          rows={5}
                          spellCheck={false}
                          required
                          className={pemClass}
                        />
                        <p className="text-[11px] text-[#00150d]/45">The key is used with WebCrypto in this tab and never sent anywhere.</p>
                        {keyState.decryptError && <p className="text-xs text-red-600 break-words">{keyState.decryptError}</p>}
                        <button
                          type="submit"
                          disabled={isDecrypting}
                          className="flex items-center gap-2 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] disabled:opacity-60 px-4 py-2 rounded-md transition-colors"
                        >
                          {isDecrypting && <Loader2 className="size-3.5 animate-spin" />}
                          Decrypt
                        </button>
                      </form>
                    </div>
                  </>
                ) : credentials.kind === "spt" ? (
                  <>
                    <div>
                      <div className="text-xs text-[#00150d]/50 mb-1">Stripe shared payment token</div>
                      <div className="font-mono text-base text-[#00150d] break-all">{credentials.token}</div>
                    </div>
                    <div className="text-xs">
                      <div className="text-[#00150d]/50">Expires</div>
                      <div className="font-mono text-[#00150d]">{new Date(credentials.expiresAt).toLocaleTimeString()}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-[#00150d]/50 mb-1">
                        {credentials.rail === "encrypted-card" ? "Card number (decrypted in your browser)" : "One-time agent card number"}
                      </div>
                      <div className="font-mono text-base text-[#00150d] tracking-wide">{formatCardNumber(credentials.number)}</div>
                    </div>
                    <div className="flex gap-8 text-xs">
                      <div>
                        <div className="text-[#00150d]/50">Expires</div>
                        <div className="font-mono text-[#00150d]">
                          {credentials.expirationMonth.padStart(2, "0")}/{credentials.expirationYear.slice(-2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#00150d]/50">CVC</div>
                        <div className="font-mono text-[#00150d]">{credentials.cvc}</div>
                      </div>
                    </div>
                    {credentials.rail === "encrypted-card" && (
                      <>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#00150d]/45">
                          <LockKeyhole className="size-3 text-[#05B959]" />
                          {selectedRail?.rail === "encrypted-card"
                            ? "Delivered as a JWE and decrypted in this tab with your private key."
                            : "Delivered as a JWE and decrypted with a one-time key that never left this tab."}
                        </div>
                        {encryptionMode === "generated" && encryptedJwe && (
                          <details className="rounded-lg border border-[rgba(0,0,0,0.08)] px-3 py-2 text-xs text-[#00150d]/60">
                            <summary className="cursor-pointer font-medium text-[#00150d]/70">View encryption details</summary>
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="mb-1 flex items-center justify-between"><span>Encrypted response</span><CopyButton text={encryptedJwe} label="Copy JWE" /></div>
                                <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-[#F6F6F6] p-2 font-mono text-[10px] leading-snug">{encryptedJwe}</pre>
                              </div>
                              <div>
                                <div className="mb-1 flex items-center justify-between"><span>Public key</span><CopyButton text={keyState.publicPem} label="Copy" /></div>
                                <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-[#F6F6F6] p-2 font-mono text-[10px] leading-snug">{keyState.publicPem}</pre>
                              </div>
                              <p className="text-[11px] leading-4">RSA-OAEP-256 + A256GCM · the private key remained in this tab.</p>
                            </div>
                          </details>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
