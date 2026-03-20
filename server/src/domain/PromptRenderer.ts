import type { NormalizedMessage } from "./MessageNormalizer";

export class PromptRenderer {
  render(messages: NormalizedMessage[]): string {
    const systemSection = messages
      .filter((message) => message.role === "system" && message.text)
      .map((message) => message.text)
      .join("\n\n");

    const conversationSection = messages
      .filter((message) => message.role !== "system")
      .map((message) => `${capitalize(message.role)}: ${message.text || "[empty]"}`)
      .join("\n\n");

    const sections = [
      systemSection ? `[System]\n${systemSection}` : "",
      conversationSection ? `[Conversation]\n${conversationSection}` : "",
      "[Instruction]\nRespond to the latest user message. Preserve useful formatting and keep prior context consistent.",
    ].filter(Boolean);

    return sections.join("\n\n");
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
