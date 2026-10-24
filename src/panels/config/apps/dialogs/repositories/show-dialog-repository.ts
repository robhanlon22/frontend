import { fireEvent } from "../../../../../common/dom/fire_event";
import type { StoreRepository } from "../../../../../data/supervisor/store";

export type RepositoryDialogOptions =
  | { repository: StoreRepository; repositoryUrl?: never }
  | { repository?: never; repositoryUrl?: string };

export type RepositoryDialogParams = RepositoryDialogOptions & {
  closed: (saved: boolean) => void;
};

export const showRepositoryDialog = (
  element: HTMLElement,
  params: RepositoryDialogOptions = {}
): Promise<boolean> =>
  new Promise((resolve) => {
    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-apps-repository",
      dialogImport: () => import("./dialog-repository"),
      dialogParams: { ...params, closed: resolve },
    });
  });
