import { ConsoleLogger, GeminiWebClient } from "../src";
import {
  readBooleanEnv,
  readStringEnv,
  resolveUserDataDir,
} from "./helpers";

async function main(): Promise<void> {
  const userDataDir = resolveUserDataDir(".profiles/default");
  const cdpEndpointURL = readStringEnv("GEMINI_CDP_ENDPOINT_URL", "");
  const outputPath = readStringEnv("GEMINI_STORAGE_STATE_PATH", ".auth/gemini.json");
  const indexedDB = readBooleanEnv("GEMINI_STORAGE_STATE_INDEXED_DB", true);

  console.log(`Gemini profile path: ${userDataDir}`);
  console.log(
    cdpEndpointURL
      ? `CDP attach: ${cdpEndpointURL}`
      : "Session source: persistent profile",
  );
  console.log(`Saving auth state to: ${outputPath}`);

  const client = new GeminiWebClient({
    userDataDir,
    headless: false,
    logger: new ConsoleLogger(),
    ...(cdpEndpointURL
      ? { browserConnection: { cdpEndpointURL } }
      : {}),
  });

  try {
    await client.init();
    const savedPath = await client.saveAuthState(outputPath, {
      indexedDB,
    });
    console.log(`Saved auth state: ${savedPath}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
