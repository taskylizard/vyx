import consola from "consola";
import type { NitroFetchRequest } from "nitropack";

export function $api<
  T = unknown,
  R extends NitroFetchRequest = NitroFetchRequest,
>(
  request: Parameters<typeof $fetch<T, R>>[0],
  opts?: Partial<Parameters<typeof $fetch<T, R>>[1]>,
) {
  return $fetch<T, R>(request, {
    // add your custom options here
    ...opts,
  });
}

export const logger = consola.withTag("dashboard");