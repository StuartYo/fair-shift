import OpenAI from "openai";
import { NEBIUS_BASE_URL } from "../config";
import type { ChatMessage, ChatOptions, ChatProvider, ChatResult } from "./provider";

// Nebius Token Factory is OpenAI-compatible:
// https://docs.tokenfactory.nebius.com/quickstart
// Each call walks the model chain (nano -> super -> ultra) and moves to the next
// model when one is missing, overloaded or errors.

/** The slice of the OpenAI client we use; lets tests inject a fake. */
export interface ChatCompletionsLike {
  chat: { completions: { create: (body: never) => Promise<unknown> } };
}

export class NebiusProvider implements ChatProvider {
  readonly kind = "nebius" as const;
  private client: ChatCompletionsLike;
  /** Models skipped during this provider's lifetime, for the trace. */
  public fallbacks: { from: string; reason: string }[] = [];

  constructor(apiKey = process.env.NEBIUS_API_KEY, client?: ChatCompletionsLike) {
    if (client) {
      this.client = client;
      return;
    }
    if (!apiKey) throw new Error("NEBIUS_API_KEY is not set");
    this.client = new OpenAI({ baseURL: NEBIUS_BASE_URL, apiKey, timeout: 60_000, maxRetries: 1 }) as unknown as ChatCompletionsLike;
  }

  async chat(models: string[], messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    let lastErr: unknown;
    for (const model of models) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
          model,
          messages,
          max_tokens: opts.maxTokens ?? 1200,
          temperature: opts.temperature ?? 0.2,
        };
        if (opts.tools?.length) {
          body.tools = opts.tools;
          body.tool_choice = "auto";
        }
        if (opts.jsonMode) body.response_format = { type: "json_object" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await this.client.chat.completions.create(body as never);
        const choice = res.choices?.[0];
        if (!choice) throw new Error("empty response");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg: any = choice.message;
        return {
          message: {
            content: typeof msg.content === "string" ? msg.content : null,
            tool_calls: Array.isArray(msg.tool_calls)
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                msg.tool_calls.filter((t: any) => t.type === "function")
              : undefined,
          },
          model,
          promptTokens: res.usage?.prompt_tokens ?? 0,
          completionTokens: res.usage?.completion_tokens ?? 0,
        };
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number }).status;
        // 402 = out of credits: do not burn through more expensive models.
        if (status === 402 || status === 401 || status === 403) throw err;
        this.fallbacks.push({ from: model, reason: status ? `HTTP ${status}` : (err as Error).message?.slice(0, 80) });
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("all models failed");
  }
}
