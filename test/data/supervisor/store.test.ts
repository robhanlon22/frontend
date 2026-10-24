import { describe, expect, it, vi } from "vitest";
import {
  addStoreRepository,
  removeStoreRepositoryCredentials,
  setStoreRepositoryCredentials,
} from "../../../src/data/supervisor/store";
import type { HomeAssistant } from "../../../src/types";

const repository = "https://github.com/example/apps#main";
const credentials = { username: "fixture-user", password: "fixture-token" };
const mockApi = () => ({
  // Vitest erases callWS's generic return type.
  callWS: vi
    .fn<HomeAssistant["callWS"]>()
    .mockResolvedValue(undefined) as HomeAssistant["callWS"],
});

describe("repository credentials", () => {
  it.each([
    { name: "public", authentication: undefined },
    { name: "private", authentication: credentials },
  ])("adds a $name repository", async ({ authentication }) => {
    const api = mockApi();

    await addStoreRepository(api, repository, authentication);

    expect(api.callWS).toHaveBeenCalledExactlyOnceWith({
      type: "supervisor/api",
      endpoint: "/store/repositories",
      method: "post",
      timeout: null,
      data: { repository, credentials: authentication },
    });
  });

  it("replaces credentials without changing the repository", async () => {
    const api = mockApi();

    await setStoreRepositoryCredentials(api, "fixture", credentials);

    expect(api.callWS).toHaveBeenCalledExactlyOnceWith({
      type: "supervisor/api",
      endpoint: "/store/repositories/fixture/credentials",
      method: "post",
      timeout: null,
      data: { credentials },
    });
  });

  it("removes credentials without removing the repository", async () => {
    const api = mockApi();

    await removeStoreRepositoryCredentials(api, "fixture");

    expect(api.callWS).toHaveBeenCalledExactlyOnceWith({
      type: "supervisor/api",
      endpoint: "/store/repositories/fixture/credentials",
      method: "delete",
      timeout: null,
      data: undefined,
    });
  });
});
