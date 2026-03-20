import { ConsoleLogger, GeminiWebClient } from "../src";
import {
  readBooleanEnv,
  readNumberEnv,
  readStringEnv,
  resolveUserDataDir,
} from "./helpers";

async function main(): Promise<void> {
  const userDataDir = resolveUserDataDir(".profiles/default");
  const timeoutMs = readNumberEnv("GEMINI_BOOTSTRAP_TIMEOUT_MS", 10 * 60_000);
  const browserChannel = readStringEnv("GEMINI_BROWSER_CHANNEL", "");
  const cdpEndpointURL = readStringEnv("GEMINI_CDP_ENDPOINT_URL", "");
  const storageStatePath = readStringEnv("GEMINI_STORAGE_STATE_PATH", "");
  const storageStateIndexedDB = readBooleanEnv("GEMINI_STORAGE_STATE_INDEXED_DB", true);
  const stealthEnabled = readBooleanEnv("GEMINI_STEALTH", true);
  const stealthLocale = readStringEnv("GEMINI_STEALTH_LOCALE", "");
  const stealthLanguages = readStringEnv("GEMINI_STEALTH_LANGUAGES", "");
  const stealthTimezoneId = readStringEnv("GEMINI_STEALTH_TIMEZONE_ID", "");
  const stealthUserAgent = readStringEnv("GEMINI_STEALTH_USER_AGENT", "");

  console.log(`Gemini profile path: ${userDataDir}`);
  console.log(
    cdpEndpointURL
      ? `CDP attach: ${cdpEndpointURL}`
      : `Browser channel: ${browserChannel || "(bundled chromium)"}`,
  );
  console.log(`Stealth mode: ${stealthEnabled ? "ON" : "OFF"}`);
  if (storageStatePath) {
    console.log(`Storage state output: ${storageStatePath}`);
  }
  console.log(
    cdpEndpointURL
      ? "Complete Google sign-in in the externally opened browser window."
      : "Complete Google sign-in in the opened browser window.",
  );

  const client = new GeminiWebClient({
    userDataDir,
    headless: false,
    logger: new ConsoleLogger(),
    ...(cdpEndpointURL
      ? { browserConnection: { cdpEndpointURL } }
      : {}),
    stealth: {
      enabled: stealthEnabled,
      ...(stealthLocale ? { locale: stealthLocale } : {}),
      ...(stealthLanguages
        ? { languages: parseCommaSeparatedList(stealthLanguages) }
        : {}),
      ...(stealthTimezoneId ? { timezoneId: stealthTimezoneId } : {}),
      ...(stealthUserAgent ? { userAgent: stealthUserAgent } : {}),
    },
    launchOptions: {
      ...(browserChannel ? { channel: browserChannel } : {}),
    },
  });

  try {
    await client.waitForManualLogin(timeoutMs);
    console.log("Manual login detected and Gemini session is ready.");

    if (storageStatePath) {
      const savedPath = await client.saveAuthState(storageStatePath, {
        indexedDB: storageStateIndexedDB,
      });
      console.log(`Saved storage state: ${savedPath}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
