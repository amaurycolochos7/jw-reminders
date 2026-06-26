import { MeetingProgramProvider, ProviderInfo } from "./types.js";
import { manualProvider } from "./manual.provider.js";
import { importProvider } from "./import.provider.js";
import { jwProvider } from "./jw.provider.js";

/**
 * Provider registry. Adding a new provider (e.g. a future JWProvider) is a
 * one-line registration here; nothing else in the system needs to change.
 */
const PROVIDERS: MeetingProgramProvider[] = [manualProvider, importProvider, jwProvider];

export function listProviders(): ProviderInfo[] {
  return PROVIDERS.map(({ id, name, description, available, inputHint }) => ({ id, name, description, available, inputHint }));
}

export function getProvider(id: string): MeetingProgramProvider {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Provider desconocido: ${id}`);
  if (!provider.available) throw new Error(`El provider '${id}' no esta disponible.`);
  return provider;
}
