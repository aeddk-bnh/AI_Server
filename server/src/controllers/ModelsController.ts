import type { FastifyReply, FastifyRequest } from "fastify";

import { ModelCatalogService } from "../services/ModelCatalogService";

export class ModelsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  listModels = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    reply.send(this.modelCatalogService.listModels());
  };
}
