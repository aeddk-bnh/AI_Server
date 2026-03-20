import type { Locator, Page } from "playwright";

import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type {
  GeminiMediaItem,
  GeminiResponseKind,
} from "../types/public";

import { getLastMatch } from "../selectors/selectors";

import { normalizeResponseText } from "./readLatestAssistantText";

export interface AssistantContentSnapshot {
  text: string;
  media: GeminiMediaItem[];
  kind: GeminiResponseKind | null;
  hasText: boolean;
  hasMedia: boolean;
  hasContent: boolean;
  signature: string;
}

export async function readLatestAssistantContent(
  page: Page,
  selectors: GeminiSelectorRegistry,
): Promise<AssistantContentSnapshot> {
  const latestAssistantMessage = await getLastMatch(
    page,
    selectors.assistantMessages,
  );

  if (!latestAssistantMessage) {
    return createEmptyAssistantContentSnapshot();
  }

  const target =
    (await resolveNestedContent(
      latestAssistantMessage.locator,
      selectors.assistantMessageContents,
    )) ?? latestAssistantMessage.locator;
  const rawText = (await target
    .innerText()
    .catch(() => target.textContent())) ?? "";
  const text = normalizeResponseText(rawText);
  const media = await readMediaFromLocator(target);

  return buildAssistantContentSnapshot(text, media);
}

export function createEmptyAssistantContentSnapshot(): AssistantContentSnapshot {
  return {
    text: "",
    media: [],
    kind: null,
    hasText: false,
    hasMedia: false,
    hasContent: false,
    signature: "",
  };
}

export function buildAssistantContentSnapshot(
  text: string,
  media: GeminiMediaItem[],
): AssistantContentSnapshot {
  const normalizedText = normalizeResponseText(text);
  const kind = classifyAssistantResponse(normalizedText, media);
  const hasText = normalizedText.length > 0;
  const hasMedia = media.length > 0;
  const hasContent = hasText || hasMedia;

  return {
    text: normalizedText,
    media,
    kind,
    hasText,
    hasMedia,
    hasContent,
    signature: createAssistantContentSignature(normalizedText, media),
  };
}

export function classifyAssistantResponse(
  text: string,
  media: GeminiMediaItem[],
): GeminiResponseKind | null {
  const hasText = text.trim().length > 0;
  const hasImage = media.some((item) => item.kind === "image");
  const hasVideo = media.some((item) => item.kind === "video");

  if (!hasText && !hasImage && !hasVideo) {
    return null;
  }

  if (hasText && !hasImage && !hasVideo) {
    return "text";
  }

  if (!hasText && hasImage && !hasVideo) {
    return "image";
  }

  if (!hasText && !hasImage && hasVideo) {
    return "video";
  }

  return "mixed";
}

export function createAssistantContentSignature(
  text: string,
  media: GeminiMediaItem[],
): string {
  const mediaSignature = media
    .map((item) =>
      [
        item.kind,
        item.url ?? "",
        item.posterUrl ?? "",
        item.renderer,
        item.width ?? "",
        item.height ?? "",
        item.alt ?? "",
      ].join("::"),
    )
    .join("||");

  return `${normalizeResponseText(text)}\n--MEDIA--\n${mediaSignature}`;
}

async function readMediaFromLocator(
  locator: Locator,
): Promise<GeminiMediaItem[]> {
  const rawItems =
    (await locator.evaluate((root) => {
      type SerializedMediaItem = {
        kind: "image" | "video";
        url: string | null;
        alt: string | null;
        posterUrl: string | null;
        renderer: "element" | "canvas";
        width: number | null;
        height: number | null;
      };

      function getTextAttribute(
        element: Element,
        name: string,
      ): string | null {
        const value = element.getAttribute(name);
        return value && value.trim().length > 0 ? value : null;
      }

      function shouldIgnoreMediaCandidate(element: Element): boolean {
        return (
          element.closest(
            [
              "message-actions",
              "response-container-footer",
              ".response-container-footer",
              ".avatar-gutter",
              "bard-avatar",
              "tts-control",
              "thumb-up-button",
              "thumb-down-button",
              "copy-button",
              "share-button",
            ].join(", "),
          ) !== null
        );
      }

      return Array.from(root.querySelectorAll("img, video, canvas")).reduce<
        SerializedMediaItem[]
      >((items, node) => {
        if (shouldIgnoreMediaCandidate(node)) {
          return items;
        }

        if (node instanceof HTMLImageElement) {
          items.push({
            kind: "image",
            url: node.currentSrc || getTextAttribute(node, "src"),
            alt: getTextAttribute(node, "alt"),
            posterUrl: null,
            renderer: "element",
            width:
              node.naturalWidth ||
              node.clientWidth ||
              Number(node.getAttribute("width")) ||
              null,
            height:
              node.naturalHeight ||
              node.clientHeight ||
              Number(node.getAttribute("height")) ||
              null,
          });

          return items;
        }

        if (node instanceof HTMLVideoElement) {
          const source = node.querySelector("source[src]");

          items.push({
            kind: "video",
            url:
              node.currentSrc ||
              getTextAttribute(node, "src") ||
              (source instanceof HTMLSourceElement
                ? getTextAttribute(source, "src")
                : null),
            alt: null,
            posterUrl: getTextAttribute(node, "poster"),
            renderer: "element",
            width:
              node.videoWidth ||
              node.clientWidth ||
              Number(node.getAttribute("width")) ||
              null,
            height:
              node.videoHeight ||
              node.clientHeight ||
              Number(node.getAttribute("height")) ||
              null,
          });

          return items;
        }

        if (node instanceof HTMLCanvasElement) {
          const width = node.width || node.clientWidth || null;
          const height = node.height || node.clientHeight || null;

          if (!width && !height) {
            return items;
          }

          items.push({
            kind: "image",
            url: null,
            alt: null,
            posterUrl: null,
            renderer: "canvas",
            width,
            height,
          });
        }

        return items;
      }, []);
    }))
      .filter((item): item is GeminiMediaItem => item !== null)
      .filter((item) => item.width !== 0 || item.height !== 0) ?? [];

  return dedupeMediaItems(rawItems);
}

function dedupeMediaItems(items: GeminiMediaItem[]): GeminiMediaItem[] {
  const seen = new Set<string>();
  const deduped: GeminiMediaItem[] = [];

  for (const item of items) {
    const key = [
      item.kind,
      item.url ?? "",
      item.posterUrl ?? "",
      item.renderer,
      item.width ?? "",
      item.height ?? "",
      item.alt ?? "",
    ].join("::");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function resolveNestedContent(
  container: Locator,
  selectors: string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = container.locator(selector).last();
    const count = await locator.count().catch(() => 0);

    if (count > 0) {
      return locator;
    }
  }

  return null;
}
