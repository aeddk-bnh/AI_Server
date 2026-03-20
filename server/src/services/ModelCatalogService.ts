import { ModelAliasRegistry } from "../domain/ModelAliasRegistry";
import type { ModelListResponse } from "../types/openai";
import { unixTimestampSeconds } from "../utils/time";

export class ModelCatalogService {
  constructor(private readonly registry: ModelAliasRegistry) {}

  listModels(): ModelListResponse {
    const created = unixTimestampSeconds(new Date(0));

    return {
      object: "list",
      data: this.registry.listPublicModels().map((model) => ({
        id: model.id,
        object: "model",
        created,
        owned_by: model.ownedBy,
      })),
    };
  }
}
