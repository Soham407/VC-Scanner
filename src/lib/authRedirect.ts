import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLinking from 'expo-linking';

const AUTH_REDIRECT_STORAGE_KEY = 'auth-redirect-flows';
const AUTH_REDIRECT_TTL_MS = 15 * 60 * 1000;

export type AuthRedirectIntent = 'email' | 'oauth' | 'recovery';

type PendingAuthRedirectFlow = {
  expiresAt: number;
  intent: AuthRedirectIntent;
  token: string;
};

type PendingAuthRedirectFlowMap = Record<string, PendingAuthRedirectFlow>;

function createFlowToken(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto);
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function readFlowMap(): Promise<PendingAuthRedirectFlowMap> {
  const storedValue = await AsyncStorage.getItem(AUTH_REDIRECT_STORAGE_KEY);
  if (!storedValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(storedValue) as PendingAuthRedirectFlowMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeFlowMap(flows: PendingAuthRedirectFlowMap): Promise<void> {
  const activeEntries = Object.entries(flows).filter(([, flow]) => flow.expiresAt > Date.now());
  if (activeEntries.length === 0) {
    await AsyncStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(AUTH_REDIRECT_STORAGE_KEY, JSON.stringify(Object.fromEntries(activeEntries)));
}

export async function createAuthRedirectUrl(intent: AuthRedirectIntent): Promise<string> {
  const token = createFlowToken();
  const flows = await readFlowMap();

  flows[token] = {
    expiresAt: Date.now() + AUTH_REDIRECT_TTL_MS,
    intent,
    token
  };

  await writeFlowMap(flows);

  return ExpoLinking.createURL('auth/callback', {
    queryParams: {
      auth_flow: token,
      auth_intent: intent
    }
  });
}

export async function consumeAuthRedirectFlow(
  token: string | null,
  intent: AuthRedirectIntent
): Promise<boolean> {
  if (!token) {
    return false;
  }

  const flows = await readFlowMap();
  const flow = flows[token];
  delete flows[token];
  await writeFlowMap(flows);

  if (!flow) {
    return false;
  }

  return flow.intent === intent && flow.expiresAt > Date.now();
}
