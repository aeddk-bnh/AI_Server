import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  ConsoleLogger,
  createGeminiWebClient,
  type GeminiMediaItem,
  type GeminiModelOption,
  type GeminiSessionInfo,
  type SendResult,
} from "../src";
import {
  readBooleanEnv,
  readNumberEnv,
  readStringEnv,
  resolveUserDataDir,
} from "./helpers";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const streamMode = args.includes("--stream") || readBooleanEnv("GEMINI_STREAM", false);
  const promptFromArgs = args.filter((arg) => !arg.startsWith("--")).join(" ").trim();
  const userDataDir = resolveUserDataDir(".profiles/chat-cli");
  const timeoutMs = readNumberEnv("GEMINI_TIMEOUT_MS", 420_000);
  const headless = readBooleanEnv("GEMINI_HEADLESS", true);
  const model = readStringEnv("GEMINI_MODEL", "");
  const cdpEndpointURL = readStringEnv("GEMINI_CDP_ENDPOINT_URL", "");
  const storageStatePath = readStringEnv("GEMINI_STORAGE_STATE_PATH", "");

  const client = await createGeminiWebClient({
    userDataDir,
    headless,
    logger: new ConsoleLogger(),
    ...(cdpEndpointURL
      ? { browserConnection: { cdpEndpointURL } }
      : {}),
    ...(storageStatePath
      ? { authState: { storageStatePath } }
      : {}),
  });
  const sessionInfo = await client.getSessionInfo();

  try {
    if (promptFromArgs) {
      await askOnce(client, promptFromArgs, {
        streamMode,
        timeoutMs,
        newChat: true,
        ...(model ? { model } : {}),
      });
      return;
    }

    await runInteractiveChat(client, {
      streamMode,
      timeoutMs,
      ...(model ? { model } : {}),
      sessionSource: describeSessionSource(
        sessionInfo,
        cdpEndpointURL,
        storageStatePath,
        userDataDir,
      ),
    });
  } finally {
    await client.close();
  }
}

async function runInteractiveChat(
  client: Awaited<ReturnType<typeof createGeminiWebClient>>,
  options: {
    streamMode: boolean;
    timeoutMs: number;
    model?: string;
    sessionSource: string;
  },
): Promise<void> {
  const readline = createInterface({ input, output });
  let nextPromptStartsNewChat = true;
  let streamMode = options.streamMode;
  let selectedModel = options.model;

  printHelp(streamMode, options.timeoutMs, selectedModel, options.sessionSource);

  try {
    while (true) {
      const question = await readline.question(nextPromptStartsNewChat ? "\nyou (new)> " : "\nyou> ");
      const prompt = question.trim();

      if (!prompt) {
        continue;
      }

      if (prompt === "/exit" || prompt === "/quit") {
        break;
      }

      if (prompt === "/help") {
        printHelp(streamMode, options.timeoutMs, selectedModel, options.sessionSource);
        continue;
      }

      if (prompt === "/new") {
        nextPromptStartsNewChat = true;
        output.write("Next message will start a new Gemini chat.\n");
        continue;
      }

      if (prompt === "/stream") {
        streamMode = !streamMode;
        output.write(`Stream mode is now ${streamMode ? "ON" : "OFF"}.\n`);
        continue;
      }

      if (prompt === "/models") {
        const models = await client.listModels(options.timeoutMs);
        output.write(`${formatModelList(models)}\n`);
        continue;
      }

      if (prompt === "/model") {
        const currentModel = await client.getSelectedModel(options.timeoutMs);
        output.write(
          currentModel
            ? `Current model: ${currentModel.label} (${currentModel.id})\n`
            : "Model picker is not available in the current Gemini UI.\n",
        );
        continue;
      }

      if (prompt.startsWith("/model ")) {
        const requestedModel = prompt.slice("/model ".length).trim();

        if (!requestedModel) {
          output.write("Usage: /model <name>\n");
          continue;
        }

        const model = await client.selectModel(requestedModel, options.timeoutMs);
        selectedModel = model.id;
        output.write(`Model is now ${model.label} (${model.id}).\n`);
        continue;
      }

      try {
        await askOnce(client, prompt, {
          streamMode,
          timeoutMs: options.timeoutMs,
          newChat: nextPromptStartsNewChat,
          ...(selectedModel ? { model: selectedModel } : {}),
        });
        nextPromptStartsNewChat = false;
      } catch (error) {
        output.write(`\nRequest failed:\n${formatError(error)}\n`);
      }
    }
  } finally {
    readline.close();
  }
}

async function askOnce(
  client: Awaited<ReturnType<typeof createGeminiWebClient>>,
  prompt: string,
  options: {
    streamMode: boolean;
    timeoutMs: number;
    newChat: boolean;
    model?: string;
  },
): Promise<void> {
  output.write("\nGemini> ");

  if (options.streamMode) {
    let sawChunk = false;

    const result = await client.sendStream(
      prompt,
      (chunk) => {
        if (chunk.delta) {
          sawChunk = true;
          output.write(chunk.delta);
        }
      },
      {
        newChat: options.newChat,
        timeoutMs: options.timeoutMs,
        ...(options.model ? { model: options.model } : {}),
      },
    );

    if (!sawChunk) {
      output.write(formatResultBody(result));
    } else if (result.media.length > 0) {
      output.write(`\n${formatMediaSummary(result.media)}`);
    }

    if (result.archive?.manifestPath) {
      output.write(`\nSaved archive: ${result.archive.manifestPath}`);
    }

    output.write("\n");
    return;
  }

  const result = await client.send(prompt, {
    newChat: options.newChat,
    timeoutMs: options.timeoutMs,
    ...(options.model ? { model: options.model } : {}),
  });

  output.write(`${formatResultBody(result)}\n`);

  if (result.archive?.manifestPath) {
    output.write(`Saved archive: ${result.archive.manifestPath}\n`);
  }
}

function printHelp(
  streamMode: boolean,
  timeoutMs: number,
  selectedModel?: string,
  sessionSource?: string,
): void {
  output.write("Gemini CLI is ready.\n");
  output.write("Commands: /new, /stream, /models, /model, /help, /exit\n");
  output.write(`Stream mode: ${streamMode ? "ON" : "OFF"}\n`);
  output.write(`Model: ${selectedModel ?? "(current Gemini default)"}\n`);
  output.write(`Session: ${sessionSource ?? "(persistent profile)"}\n`);
  output.write(`Timeout: ${timeoutMs}ms (override with GEMINI_TIMEOUT_MS)\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatResultBody(result: Pick<SendResult, "text" | "media">): string {
  const text = result.text.trim();

  if (text && result.media.length === 0) {
    return text;
  }

  if (text && result.media.length > 0) {
    return `${text}\n${formatMediaSummary(result.media)}`;
  }

  if (result.media.length > 0) {
    return formatMediaSummary(result.media);
  }

  return "(empty response)";
}

function formatMediaSummary(media: GeminiMediaItem[]): string {
  const lines = media.map((item, index) => {
    const label = `${index + 1}. ${item.kind}`;
    const url = item.url ?? "(rendered inline)";
    return `${label}: ${url}`;
  });

  return lines.join("\n");
}

function formatModelList(models: GeminiModelOption[]): string {
  if (models.length === 0) {
    return "No Gemini models were found.";
  }

  return models
    .map((model) => {
      const status = model.selected
        ? "selected"
        : model.enabled
          ? "available"
          : "unavailable";
      const description = model.description ? ` - ${model.description}` : "";
      return `${model.label} (${model.id}) [${status}]${description}`;
    })
    .join("\n");
}

function describeSessionSource(
  sessionInfo: GeminiSessionInfo | null,
  cdpEndpointURL: string,
  storageStatePath: string,
  userDataDir: string,
): string {
  if (sessionInfo?.mode === "cdp-browser") {
    return `CDP attach (${sessionInfo.cdpEndpointURL ?? cdpEndpointURL})`;
  }

  if (sessionInfo?.mode === "storage-state") {
    const label = sessionInfo.storageStatePath ?? storageStatePath;
    return sessionInfo.fallbackFromCdp
      ? `storage state (${label}, fallback from CDP)`
      : `storage state (${label})`;
  }

  if (sessionInfo?.mode === "persistent-context") {
    return `persistent profile (${sessionInfo.userDataDir ?? userDataDir})`;
  }

  if (cdpEndpointURL) {
    return `CDP attach (${cdpEndpointURL})`;
  }

  if (storageStatePath) {
    return `storage state (${storageStatePath})`;
  }

  return `persistent profile (${userDataDir})`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
