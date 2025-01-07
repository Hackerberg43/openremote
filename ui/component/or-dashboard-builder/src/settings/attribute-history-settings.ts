import {css, html, TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import {AttributeHistoryWidgetConfig} from "../widgets/attribute-history-widget";
import {AssetIdsSelectEvent, AssetTypeSelectEvent, AttributeNamesSelectEvent, AssetTypesFilterConfig} from "../panels/assettypes-panel";
import { InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";
import {AssetWidgetSettings} from "../util/or-asset-widget";
import {showSnackbar} from "@openremote/or-mwc-components/or-mwc-snackbar";

const styling = css`
  .switch-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
`;

@customElement("attribute-history-settings")
export class AttributeHistorySettings extends AssetWidgetSettings {

    protected readonly widgetConfig!: AttributeHistoryWidgetConfig;

    static get styles() {
        return [...super.styles, styling];
    }

    protected render(): TemplateResult {
        const config = {
            assets: {
                enabled: true
                }
            } as AssetTypesFilterConfig


        return html`
            <div>
                <!-- Panel where Asset type and the selected default attribute can be customized -->
                <settings-panel displayName="selectAsset" expanded="${true}">
                    <assettypes-panel .assetType="${this.widgetConfig.assetType}" .config="${config}"
                                      .assetIds="${this.widgetConfig.assetId}"
                                      @assettype-select="${(ev: AssetTypeSelectEvent) => this.onAssetTypeSelect(ev)}"
                                      @assetids-select="${(ev: AssetIdsSelectEvent) => this.onAssetIdsSelect(ev)}"
                    ></assettypes-panel>





                <!-- Other settings -->
                <settings-panel displayName="settings" expanded="${true}">
                    <div>
                        <!-- Toggle readonly -->
                        <div class="switch-container">
                            <span><or-translate value="dashboard.userCanEdit"></or-translate></span>
                            <or-mwc-input .type="${InputType.SWITCH}" style="margin: 0 -10px;" .value="${!this.widgetConfig.readonly}"
                                          @or-mwc-input-changed="${(ev: OrInputChangedEvent) => this.onReadonlyToggle(ev)}"
                            ></or-mwc-input>
                        </div>
                        <!-- Toggle helper text -->
                        <div class="switch-container">
                            <span><or-translate value="dashboard.showHelperText"></or-translate></span>
                            <or-mwc-input .type="${InputType.SWITCH}" style="margin: 0 -10px;" .value="${this.widgetConfig.showHelperText}"
                                          @or-mwc-input-changed="${(ev: OrInputChangedEvent) => this.onHelperTextToggle(ev)}"
                            ></or-mwc-input>
                        </div>
                    </div>
                </settings-panel>
            </div>
        `;
    }

    protected onReadonlyToggle(ev: OrInputChangedEvent) {
        this.widgetConfig.readonly = !ev.detail.value;
        this.notifyConfigUpdate();
    }

    protected onHelperTextToggle(ev: OrInputChangedEvent) {
        this.widgetConfig.showHelperText = ev.detail.value;
        this.notifyConfigUpdate();
    }

    protected onAssetTypeSelect(ev: AssetTypeSelectEvent) {
        this.widgetConfig.assetType = ev.detail;
        this.widgetConfig.assetId = "";
        this.notifyConfigUpdate();
    }

    protected onAssetIdsSelect(ev: AssetIdsSelectEvent) {
        this.widgetConfig.assetId = ev.detail as string;
        this.notifyConfigUpdate();
    }

}
