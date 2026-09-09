// Client-facing Crossmint API. Same function names and signatures the
// components always used. Each call runs the matching server action in
// lib/crossmint-api.server.ts, records the returned traces in the API log,
// then hands back the data or throws the API error.

import {
  createNewOrderIntent as createNewOrderIntentAction,
  deleteOrderIntent as deleteOrderIntentAction,
  fetchAgenticTokenCredentials as fetchAgenticTokenCredentialsAction,
  fetchAllData as fetchAllDataAction,
  fetchEncryptedCardCredentials as fetchEncryptedCardCredentialsAction,
  fetchOrderIntent as fetchOrderIntentAction,
  fetchOrderIntents as fetchOrderIntentsAction,
  fetchPaymentMethods as fetchPaymentMethodsAction,
  fetchRegistration as fetchRegistrationAction,
  registerCard as registerCardAction,
  removePaymentMethod as removePaymentMethodAction,
  type ActionResult,
  type AllData,
} from "@/lib/crossmint-api.server";
import { addTraces } from "@/lib/api-log";
import type {
  AgenticTokenCredentialResponse,
  CreateOrderIntentInput,
  EncryptedCardCredentialResponse,
  Merchant,
  OrderIntentRegistration,
  OrderIntentResponse,
  PaymentMethodResponse,
  RailProvider,
  RsaPublicJwk,
} from "@/lib/crossmint-types";

export type { AllData };

/** Record traces, then unwrap the data or rethrow the server-side failure. */
async function unwrap<T>(pending: Promise<ActionResult<T>>): Promise<T> {
  const { data, traces } = await pending;
  addTraces(traces);
  const failure = data as unknown as { __error?: string } | null;
  if (failure && typeof failure === "object" && typeof failure.__error === "string") {
    throw new Error(failure.__error);
  }
  return data;
}

export const fetchPaymentMethods = (jwt: string): Promise<PaymentMethodResponse[]> =>
  unwrap(fetchPaymentMethodsAction(jwt));

export const removePaymentMethod = (jwt: string, paymentMethodId: string): Promise<void> =>
  unwrap(removePaymentMethodAction(jwt, paymentMethodId));

export const fetchRegistration = (jwt: string, paymentMethodId: string): Promise<OrderIntentRegistration | null> =>
  unwrap(fetchRegistrationAction(jwt, paymentMethodId));

export const registerCard = (jwt: string, paymentMethodId: string, email: string): Promise<OrderIntentRegistration> =>
  unwrap(registerCardAction(jwt, paymentMethodId, email));

export const fetchOrderIntents = (jwt: string): Promise<OrderIntentResponse[]> => unwrap(fetchOrderIntentsAction(jwt));

export const fetchOrderIntent = (jwt: string, orderIntentId: string): Promise<OrderIntentResponse> =>
  unwrap(fetchOrderIntentAction(jwt, orderIntentId));

export const createNewOrderIntent = (jwt: string, input: CreateOrderIntentInput): Promise<OrderIntentResponse> =>
  unwrap(createNewOrderIntentAction(jwt, input));

export const deleteOrderIntent = (jwt: string, orderIntentId: string): Promise<void> =>
  unwrap(deleteOrderIntentAction(jwt, orderIntentId));

export const fetchAllData = (jwt: string): Promise<AllData> => unwrap(fetchAllDataAction(jwt));

export const fetchAgenticTokenCredentials = (
  jwt: string,
  orderIntentId: string,
  input: { provider: RailProvider; amount: { value: string; currency: string }; merchant?: Merchant },
): Promise<AgenticTokenCredentialResponse> => unwrap(fetchAgenticTokenCredentialsAction(jwt, orderIntentId, input));

export const fetchEncryptedCardCredentials = (
  jwt: string,
  orderIntentId: string,
  publicKey: RsaPublicJwk,
): Promise<EncryptedCardCredentialResponse> => unwrap(fetchEncryptedCardCredentialsAction(jwt, orderIntentId, publicKey));
