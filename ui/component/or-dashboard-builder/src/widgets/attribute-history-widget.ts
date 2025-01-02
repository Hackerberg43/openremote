import {css, html, PropertyValues, TemplateResult, LitElement } from "lit";
import {OrAssetWidget} from "../util/or-asset-widget";
import {WidgetConfig} from "../util/widget-config";
import {OrWidget, WidgetManifest} from "../util/or-widget";
import {WidgetSettings} from "../util/widget-settings";
import {TimePresetCallback} from "@openremote/or-chart";
import { customElement, query, queryAll, state } from "lit/decorators.js";
import {AttributeHistorySettings} from "../settings/attribute-history-settings";
import { when } from "lit/directives/when.js";
import {throttle} from "lodash";
import {Util} from "@openremote/core";
import "@openremote/or-attribute-input";
import {HistoryConfig, OrAttributeHistory} from "@openremote/or-attribute-history";
import {InputType, OrInputChangedEvent, OrMwcInput} from "@openremote/or-mwc-components/or-mwc-input";
import {Attribute, AttributeRef, AssetModelUtil, WellknownMetaItems} from "@openremote/model";
import i18next, {InitOptions, TOptions} from "i18next";

// Deze nog aanpassen met settings voor jouw widget
export interface AttributeHistoryWidgetConfig extends WidgetConfig {
    attributeRefs: AttributeRef[];
    readonly: boolean,
    showHelperText: boolean,
    // Asset type related values
    assetType?: string,
    attributeName?: string,
    assetId: string
}

function getDefaultWidgetConfig() {
    return {
        attributeRefs: [],
        readonly: false,
        showHelperText: true,
        assetType: undefined,
        attributeName: "",
        assetId: ""
    } as AttributeHistoryWidgetConfig;
}

const styling = css`
  #widget-wrapper {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }
    
  #error-txt {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  .attr-input {
    width: 100%;
    box-sizing: border-box;
  }
`

@customElement("attribute-history-widget")
export class AttributeHistoryWidget extends OrAssetWidget {

    protected widgetConfig!: AttributeHistoryWidgetConfig;

    @state()
    protected _loading = false;

    @query("#widget-wrapper")
    protected widgetWrapperElem?: HTMLElement;

    @queryAll(".attr-input")
    protected attributeInputElems?: NodeList;


    protected resizeObserver?: ResizeObserver;

    static getManifest(): WidgetManifest {
        return {
            displayName: "Attribute History",
            displayIcon: "chart-line",
            minColumnWidth: 4,
            minColumnHeight: 2,
            getContentHtml(config: AttributeHistoryWidgetConfig): OrWidget {
                return new AttributeHistoryWidget(config);
            },
            getSettingsHtml(config: AttributeHistoryWidgetConfig): WidgetSettings {
                const settings = new AttributeHistorySettings(config);
                //settings.setTimePresetOptions(getDefaultTimePresetOptions());
                //settings.setSamplingOptions(getDefaultSamplingOptions());
                return settings;
            },
            getDefaultConfig(): AttributeHistoryWidgetConfig {
                return getDefaultWidgetConfig();
            }
        }
    }

    // TODO: Improve this to be more efficient
    refreshContent(force: boolean): void {
        this.widgetConfig = JSON.parse(JSON.stringify(this.widgetConfig)) as AttributeHistoryWidgetConfig;
    }

    static get styles() {
        return [...super.styles, styling];
    }

    // Lit Lifecycle
    protected willUpdate(changedProps: PropertyValues) {
        if(changedProps.has('widgetConfig') && this.widgetConfig) {
            this.loadAsset();
        }

        return super.willUpdate(changedProps);
    }

    protected changeAttribute(attribute: string) {
        this.widgetConfig.attributeName = attribute;
        this.refreshContent(true);
    }

    protected loadAsset() {
        if(!this.isAssetLoaded(this.widgetConfig.assetId)) {
           this.queryAssets({
               ids: [this.widgetConfig.assetId]
           }).then((assets) => {
               this.loadedAssets = assets;
           })
        }
    }

    protected render(): TemplateResult {


        //Lege config, checken of dit instelbaar moet zijn
        const config : HistoryConfig = {};

        if (this.loadedAssets) {
            const historyAttrs = Object.values(this.loadedAssets[0].attributes!).filter((attr) =>
                    (attr.meta && (attr.meta.hasOwnProperty(WellknownMetaItems.STOREDATAPOINTS) ? attr.meta[WellknownMetaItems.STOREDATAPOINTS] : attr.meta.hasOwnProperty(WellknownMetaItems.AGENTLINK))));
        }

        if (historyAttrs.length === 0) {
            this._error = "noDatapointsAttributes";
            return html`<or-translate id="error-txt" .value="${this._error}"></or-translate>`;
        }



    


        const options = historyAttrs.map((attr) => {
            const descriptors = AssetModelUtil.getAttributeAndValueDescriptors(this.loadedAssets[0]?.type, attr.name, attr);
            const label = Util.getAttributeLabel(attr, descriptors[0], this.loadedAssets[0]?.type, true);
            return [attr.name, label];
            }).sort(Util.sortByString((item) => item[1] === undefined ? item[0]! : item[1]));

        let attrTemplate = html`
                <div id="attribute-picker">
                    <or-mwc-input .checkAssetWrite="${false}" .label="${i18next.t("attribute")}" @or-mwc-input-changed="${(ev: OrInputChangedEvent) => this.changeAttribute(ev.detail.value)}}" .type="${InputType.SELECT}" .options="${options}"></or-mwc-input>
                </div>`;

        return html`
            <style>
               #attribute-picker {
                   flex: 0;
                   margin: 0 0 10px 0;
                   position: unset;
               }

               #attribute-picker > or-mwc-input {
                   width: 250px;
               }

                or-attribute-history {
                    width: 100%;
                    --or-attribute-history-controls-margin: 0 0 10px -5px;
                    --or-attribute-history-controls-justify-content: flex-start;
                }

               @media screen and (min-width: 1900px) {
                   #attribute-picker {
                       position: absolute;
                   }

                   or-attribute-history {
                       --or-attribute-history-controls-margin: 0 0 10px 0;
                       --or-attribute-history-controls-justify-content: flex-end;
                       min-height: 70px;
                   }
               }
            </style>
            ${attrTemplate}
            <or-attribute-history id="attribute-history" .config="${config}" .assetType="${this.loadedAssets[0]?.type}" .assetId="${this.loadedAssets[0]?.id}"></or-attribute-history>
        `;
    }
}
