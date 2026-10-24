import { mdiDelete, mdiDeleteOff, mdiKey, mdiPlus } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import "../../../components/data-table/ha-data-table";
import type { DataTableColumnContainer } from "../../../components/data-table/ha-data-table";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import type { HaIconButton } from "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tooltip";
import type {
  HassioAddonInfo,
  HassioAddonsInfo,
} from "../../../data/hassio/addon";
import { fetchHassioAddonsInfo } from "../../../data/hassio/addon";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import {
  fetchStoreRepositories,
  removeStoreRepository,
} from "../../../data/supervisor/store";
import type { StoreRepository } from "../../../data/supervisor/store";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { showRepositoryDialog } from "./dialogs/repositories/show-dialog-repository";

@customElement("ha-config-apps-repositories")
export class HaConfigAppsRepositories extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _repositories?: StoreRepository[];

  @state() private _addon?: HassioAddonsInfo;

  @state() private _error?: string;

  protected firstUpdated() {
    this._loadData();
  }

  private _columns = memoizeOne(
    (
      localize: HomeAssistant["localize"],
      usedRepositories: string[]
    ): DataTableColumnContainer<StoreRepository> => ({
      name: {
        title: localize("ui.panel.config.apps.store.repositories"),
        main: true,
        sortable: true,
        filterable: true,
        direction: "asc" as const,
        flex: 2,
      },
      maintainer: {
        title: localize("ui.panel.config.apps.repositories.maintainer"),
        sortable: true,
        filterable: true,
        flex: 1,
      },
      url: {
        title: localize("ui.panel.config.apps.repositories.url"),
        sortable: true,
        filterable: true,
        flex: 2,
      },
      credentials: {
        title: "",
        label: localize("ui.panel.config.apps.repositories.manage_credentials"),
        type: "icon-button",
        showNarrow: true,
        template: (row) => {
          const https = row.source.toLowerCase().startsWith("https://");
          return html`
            <ha-tooltip .for="credentials-btn-${row.slug}">
              ${localize(
                https
                  ? "ui.panel.config.apps.repositories.manage_credentials"
                  : "ui.panel.config.apps.repositories.credentials_require_https"
              )}
            </ha-tooltip>
            <ha-icon-button
              .id="credentials-btn-${row.slug}"
              .label=${localize("ui.panel.config.apps.repositories.manage_credentials")}
              .path=${mdiKey}
              .disabled=${!https}
              data-repository=${row.slug}
              @click=${this._showCredentialsDialog}
            ></ha-icon-button>
          `;
        },
      },
      actions: {
        title: "",
        label: localize("ui.panel.config.apps.repositories.remove"),
        type: "icon-button",
        showNarrow: true,
        lastFixed: true,
        template: (row) => {
          const used = usedRepositories.includes(row.slug);
          return html`
            <ha-tooltip .for="delete-btn-${row.slug}">
              ${localize(
                used
                  ? "ui.panel.config.apps.repositories.used"
                  : "ui.panel.config.apps.repositories.remove"
              )}
            </ha-tooltip>
            <ha-icon-button
              .id="delete-btn-${row.slug}"
              .disabled=${used}
              .slug=${row.slug}
              .path=${used ? mdiDeleteOff : mdiDelete}
              @click=${this._removeRepository}
              class="delete"
            ></ha-icon-button>
          `;
        },
      },
    })
  );

  private _filteredRepositories = memoizeOne((repos: StoreRepository[]) =>
    repos
      .filter(
        (repo) =>
          repo.slug !== "core" &&
          repo.slug !== "local" &&
          repo.slug !== "a0d7b954" &&
          repo.slug !== "5c53de3b" &&
          repo.slug !== "d5369777"
      )
      .sort((a, b) =>
        caseInsensitiveStringCompare(a.name, b.name, this.hass.locale.language)
      )
  );

  private _filteredUsedRepositories = memoizeOne(
    (repos: StoreRepository[], addons: HassioAddonInfo[]) =>
      repos
        .filter((repo) =>
          addons.some((addon) => addon.repository === repo.slug)
        )
        .map((repo) => repo.slug)
  );

  protected render() {
    if (this._error) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .error=${this._error}
        ></hass-error-screen>
      `;
    }

    if (!this._repositories || !this._addon) {
      return html`
        <hass-loading-screen
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></hass-loading-screen>
      `;
    }

    const repositories = this._filteredRepositories(this._repositories);
    const usedRepositories = this._filteredUsedRepositories(
      repositories,
      this._addon.addons
    );

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config/apps/available"
        .header=${this.hass.localize("ui.panel.config.apps.store.repositories")}
      >
        <ha-data-table
          .columns=${this._columns(this.hass.localize, usedRepositories)}
          .data=${repositories}
          .noDataText=${this.hass.localize(
            "ui.panel.config.apps.repositories.no_repositories"
          )}
          id="slug"
          has-fab
        ></ha-data-table>
        <ha-button size="l" @click=${this._showAddRepositoryDialog}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.apps.repositories.add")}
        </ha-button>
      </hass-subpage>
    `;
  }

  private async _showAddRepositoryDialog() {
    if (await showRepositoryDialog(this)) {
      await this._loadData();
      fireEvent(this, "apps-collection-refresh", { collection: "store" });
    }
  }

  private async _showCredentialsDialog(
    ev: HASSDomCurrentTargetEvent<HaIconButton>
  ) {
    const repository = this._repositories?.find(
      (repo) => repo.slug === ev.currentTarget.dataset.repository
    );
    if (repository && (await showRepositoryDialog(this, { repository }))) {
      await this._loadData();
    }
  }

  private _removeRepository = async (ev: Event) => {
    const slug = (ev.currentTarget as any).slug;
    const repo = this._repositories?.find((r) => r.slug === slug);

    showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.config.apps.repositories.remove"),
      text: this.hass.localize(
        "ui.panel.config.apps.repositories.confirm_remove",
        { name: repo?.name || slug }
      ),
      destructive: true,
      confirmText: this.hass.localize(
        "ui.panel.config.apps.repositories.remove"
      ),
      action: async () => {
        try {
          await removeStoreRepository(this.hass, slug);
          await this._loadData();
          fireEvent(this, "apps-collection-refresh", { collection: "store" });
        } catch (err: any) {
          showAlertDialog(this, {
            text: extractApiErrorMessage(err),
          });
          throw err;
        }
      },
    });
  };

  private async _loadData(): Promise<void> {
    try {
      const [repositories, addon] = await Promise.all([
        fetchStoreRepositories(this.hass),
        fetchHassioAddonsInfo(this.hass),
      ]);
      this._repositories = repositories;
      this._addon = addon;
    } catch (err: any) {
      this._error = extractApiErrorMessage(err);
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      height: 100%;
    }
    ha-data-table {
      width: 100%;
      height: 100%;
      --data-table-border-width: 0;
    }
    ha-icon-button.delete {
      color: var(--error-color);
    }
    ha-button[size="l"] {
      position: fixed;
      right: calc(var(--ha-space-4) + var(--safe-area-inset-right));
      bottom: calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
      inset-inline-end: calc(var(--ha-space-4) + var(--safe-area-inset-right));
      inset-inline-start: initial;
      z-index: 1;
      --ha-button-box-shadow: var(--ha-box-shadow-l);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-apps-repositories": HaConfigAppsRepositories;
  }
}
