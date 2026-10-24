import type { ContextType } from "@lit/context";
import { mdiClose } from "@mdi/js";
import { html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { consume } from "../../../../../common/decorators/consume";
import "../../../../../components/ha-alert";
import "../../../../../components/ha-button";
import "../../../../../components/ha-dialog";
import "../../../../../components/ha-dialog-footer";
import "../../../../../components/ha-form/ha-form";
import "../../../../../components/ha-icon-button";
import type { HaForm } from "../../../../../components/ha-form/ha-form";
import type {
  HaFormSchema,
  SchemaUnion,
} from "../../../../../components/ha-form/types";
import {
  apiContext,
  internationalizationContext,
} from "../../../../../data/context";
import { extractApiErrorMessage } from "../../../../../data/hassio/common";
import {
  addStoreRepository,
  removeStoreRepositoryCredentials,
  setStoreRepositoryCredentials,
} from "../../../../../data/supervisor/store";
import { DialogMixin } from "../../../../../dialogs/dialog-mixin";
import { showConfirmationDialog } from "../../../../../dialogs/generic/show-dialog-box";
import { haStyleDialog } from "../../../../../resources/styles";
import type { TranslationDict, ValueChangedEvent } from "../../../../../types";
import type { RepositoryDialogParams } from "./show-dialog-repository";

interface RepositoryInput {
  repository?: string;
  authenticate?: boolean;
  username?: string;
  password?: string;
}

const CREDENTIALS_SCHEMA = [
  { name: "username", required: true, selector: { text: {} } },
  {
    name: "password",
    required: true,
    selector: { text: { type: "password" } },
  },
] as const satisfies readonly HaFormSchema[];

const ADD_SCHEMA = [
  { name: "repository", required: true, selector: { text: { type: "url" } } },
  { name: "authenticate", selector: { boolean: {} } },
  {
    name: "credentials",
    type: "grid",
    flatten: true,
    visible: { field: "authenticate", value: true },
    schema: CREDENTIALS_SCHEMA,
  },
] as const satisfies readonly HaFormSchema[];

@customElement("dialog-apps-repository")
export class AppsRepositoryDialog extends DialogMixin<RepositoryDialogParams>(
  LitElement
) {
  @consume({ context: apiContext })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _input: RepositoryInput = {};

  @state() private _submitting = false;

  @state() private _error?: string;

  @query("ha-form") private _form?: HaForm;

  private _saved = false;

  public override closeDialog(
    historyState?: unknown
  ): Promise<boolean> | boolean {
    return this._submitting && !this._saved
      ? false
      : super.closeDialog(historyState);
  }

  public disconnectedCallback(): void {
    this._input = {};
    this.params?.closed(this._saved);
    super.disconnectedCallback();
  }

  protected render() {
    if (!this.params) {
      return nothing;
    }

    const repository = this.params.repository;
    return html`
      <ha-dialog
        open
        header-title=${this._localize(repository ? "credentials_title" : "add_title")}
        header-subtitle=${repository?.source || ""}
        .preventScrimClose=${this._submitting}
      >
        <ha-icon-button
          slot="headerNavigationIcon"
          .path=${mdiClose}
          .label=${this._i18n.localize("ui.common.close")}
          .disabled=${this._submitting}
          @click=${this.closeDialog}
        ></ha-icon-button>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        <ha-form
          autofocus
          .schema=${repository ? CREDENTIALS_SCHEMA : ADD_SCHEMA}
          .data=${{ repository: this.params.repositoryUrl, ...this._input }}
          .disabled=${this._submitting}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        <ha-dialog-footer slot="footer">
          ${
            repository?.has_credentials
              ? html`
                  <ha-button
                    slot="secondaryAction"
                    variant="danger"
                    appearance="plain"
                    .disabled=${this._submitting}
                    @click=${this._removeCredentials}
                  >
                    ${this._localize("remove_credentials")}
                  </ha-button>
                `
              : nothing
          }
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            .disabled=${this._submitting}
            @click=${this.closeDialog}
          >
            ${this._i18n.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .loading=${this._submitting}
            .disabled=${this._submitting}
            @click=${this._save}
          >
            ${
              repository
                ? this._i18n.localize("ui.common.save")
                : this._localize("add")
            }
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _localize(
    key: keyof TranslationDict["ui"]["panel"]["config"]["apps"]["repositories"]
  ): string {
    return this._i18n.localize(`ui.panel.config.apps.repositories.${key}`);
  }

  private _computeLabel = (schema: SchemaUnion<typeof ADD_SCHEMA>) =>
    this._localize(schema.name);

  private _computeHelper = (schema: HaFormSchema) =>
    schema.name === "password" ? this._localize("password_helper") : undefined;

  private _valueChanged(ev: ValueChangedEvent<RepositoryInput>): void {
    this._input = ev.detail.value;
    this._error = undefined;
  }

  private async _save(): Promise<void> {
    if (!this.params || !this._form?.reportValidity()) {
      return;
    }

    const credentials =
      this.params.repository || this._input.authenticate
        ? { username: this._input.username!, password: this._input.password! }
        : undefined;
    this._submitting = true;
    this._error = undefined;
    try {
      if (this.params.repository) {
        await setStoreRepositoryCredentials(
          this._api,
          this.params.repository.slug,
          credentials!
        );
      } else {
        await addStoreRepository(
          this._api,
          (this._input.repository ?? this.params.repositoryUrl)!,
          credentials
        );
      }
      this._saved = true;
      this.closeDialog();
    } catch (err: unknown) {
      this._error = extractApiErrorMessage(err);
    } finally {
      this._submitting = false;
    }
  }

  private async _removeCredentials(): Promise<void> {
    const repository = this.params?.repository;
    if (
      !repository ||
      !(await showConfirmationDialog(this, {
        title: this._localize("remove_credentials"),
        text: this._localize("confirm_remove_credentials"),
        destructive: true,
        confirmText: this._i18n.localize("ui.common.remove"),
      }))
    ) {
      return;
    }

    this._submitting = true;
    this._error = undefined;
    try {
      await removeStoreRepositoryCredentials(this._api, repository.slug);
      this._saved = true;
      this.closeDialog();
    } catch (err: unknown) {
      this._error = extractApiErrorMessage(err);
    } finally {
      this._submitting = false;
    }
  }

  static styles = haStyleDialog;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-apps-repository": AppsRepositoryDialog;
  }
}
