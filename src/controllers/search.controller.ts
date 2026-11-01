import type { Context } from "hono";
import { failure, success } from "../utils/response.ts";
import { omnibarSearch } from "../services/omnibarSearch.service.ts";
import type { SearchOmnibarInput } from "../schema/search.schema.ts";

export const omnibarSearchController = async (c: Context) => {
  const gymId = c.get("gymId");
  const { query, limit } = c.get("validData") as SearchOmnibarInput;

  const result = await omnibarSearch(gymId, query, limit);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};
