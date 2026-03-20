import type { ModelAliasConfig, PublicModelDefinition } from "../types/internal";
import { AppError } from "../utils/AppError";

export class ModelAliasRegistry {
  private readonly byId: Map<string, PublicModelDefinition>;
  private readonly defaultModelId: string;

  constructor(config: ModelAliasConfig) {
    this.byId = new Map(config.models.map((model) => [model.id, model]));
    this.defaultModelId = config.defaultModel;

    if (!this.byId.has(this.defaultModelId)) {
      throw new Error(
        `Default model "${this.defaultModelId}" is not present in model aliases`,
      );
    }

    if (this.byId.size !== config.models.length) {
      throw new Error("Duplicate model alias IDs detected");
    }
  }

  resolve(modelId?: string): PublicModelDefinition {
    const id = modelId ?? this.defaultModelId;
    const model = this.byId.get(id);

    if (!model) {
      throw new AppError(`Unknown model "${id}"`, {
        code: "MODEL_NOT_FOUND",
        statusCode: 400,
        type: "invalid_request_error",
        param: "model",
      });
    }

    if (!model.enabled) {
      throw new AppError(`Model "${id}" is disabled`, {
        code: "MODEL_DISABLED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "model",
      });
    }

    return model;
  }

  listPublicModels(): PublicModelDefinition[] {
    return [...this.byId.values()].filter((model) => model.enabled);
  }

  getDefaultModel(): PublicModelDefinition {
    return this.resolve(this.defaultModelId);
  }
}
