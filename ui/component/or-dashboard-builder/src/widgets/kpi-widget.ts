import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import {OrAssetWidget} from "../util/or-asset-widget";
import {OrWidget, WidgetManifest} from "../util/or-widget";
import {WidgetSettings} from "../util/widget-settings";
import {AssetWidgetConfig} from "../util/widget-config";
import {Attribute, AttributeRef} from "@openremote/model";
import {html, TemplateResult } from "lit";
import {KpiSettings} from "../settings/kpi-settings";
import "@openremote/or-attribute-card";
import "@openremote/or-live-chart";

export interface KpiWidgetConfig extends AssetWidgetConfig {
    period?: 'year' | 'month' | 'week' | 'day' | 'hour';
    decimals: number;
    deltaFormat: "absolute" | "percentage";
    showTimestampControls: boolean;
}

function getDefaultWidgetConfig(): KpiWidgetConfig {
    return {
        attributeRefs: [],
        period: "day",
        decimals: 0,
        deltaFormat: "absolute",
        showTimestampControls: false
    };
}

@customElement("kpi-widget")
export class KpiWidget extends OrAssetWidget {

    protected widgetConfig!: KpiWidgetConfig;

    @state()
    protected _loading = false;

    static getManifest(): WidgetManifest {
        return {
            displayName: "KPI",
            displayIcon: "label",
            minColumnWidth: 1,
            minColumnHeight: 1,
            getContentHtml(config: KpiWidgetConfig): OrWidget {
                return new KpiWidget(config);
            },
            getSettingsHtml(config: KpiWidgetConfig): WidgetSettings {
                return new KpiSettings(config);
            },
            getDefaultConfig(): KpiWidgetConfig {
                return getDefaultWidgetConfig();
            }
        }
    }

    refreshContent(force: boolean): void {
        this.loadAssets(this.widgetConfig.attributeRefs);
    }

    protected willUpdate(changedProps: Map<string, any>) {

        // If widgetConfig, and the attributeRefs of them have changed...
        if(changedProps.has("widgetConfig") && this.widgetConfig) {
            const attributeRefs = this.widgetConfig.attributeRefs;

            // Check if list of attributes has changed, based on the cached assets
            const loadedRefs: AttributeRef[] = attributeRefs?.filter((attrRef: AttributeRef) => this.isAttributeRefLoaded(attrRef));
            if (loadedRefs?.length !== (attributeRefs ? attributeRefs.length : 0)) {

                // Fetch the new list of assets
                this.loadAssets(attributeRefs);

            }
        }
        return super.willUpdate(changedProps);
    }

    protected loadAssets(attributeRefs: AttributeRef[]) {
        if(attributeRefs.length === 0) {
            this._error = "noAttributesConnected";
            return;
        }
        this._loading = true;
        this._error = undefined;
        this.fetchAssets(attributeRefs).then((assets) => {
            this.loadedAssets = assets;
            this.assetAttributes = attributeRefs?.map((attrRef: AttributeRef) => {
                const assetIndex = assets.findIndex((asset) => asset.id === attrRef.id);
                const foundAsset = assetIndex >= 0 ? assets[assetIndex] : undefined;
                return foundAsset && foundAsset.attributes ? [assetIndex, foundAsset.attributes[attrRef.name!]] : undefined;
            }).filter((indexAndAttr: any) => !!indexAndAttr) as [number, Attribute<any>][];
        }).catch(e => {
            this._error = e.message;
        }).finally(() => {
            this._loading = false;
        });
    }

    protected render(): TemplateResult {
        return html`
            <div style="position: relative; height: 100%; overflow: hidden; padding-bottom: 10px">
                ${when(this._loading || this._error, () => {
                    // Have to use `position: absolute` with white background due to rendering inconsistencies in or-attribute-card
                    return html`
                        <div style="position: absolute; top: -5%; width: 100%; height: 105%; background: white; z-index: 1; display: flex; justify-content: center; align-items: center; text-align: center;">
                            ${when(this._loading, () => html`
                                <or-loading-indicator></or-loading-indicator>
                            `, () => html`
                                <or-translate .value="${this._error}"></or-translate>
                            `)}
                        </div>
                    `;
                })}
                <!-- Example using or-flow-grid component -->
                <or-flow-grid
                        .flowValues="${{
                            storage: -30,
                            grid: 0,
                            producers: 100,
                            consumers: -70
                        }}"
                        .maxFlowValue="100"
                        .charts="${[
                        {
                            position: 'producers',
                            assetId: '5ydJLbMubRRyPnZMJEU97v',
                            attributeName: 'power',
                            timeframe: '5minutes',
                            refreshInterval: '1second',
                            operatingStatus: 'running',
                            linkUrl: 'http://localhost:9000/manager/#/assets/false/5ydJLbMubRRyPnZMJEU97v',
                            statusMessage: 'Solar panels producing energy',
                            additionalAttributes: [
                                {
                                    assetId: '5ydJLbMubRRyPnZMJEU97v',
                                    attributeName: 'temperature',
                                    icon: 'thermometer',
                                    upperThreshold: 50,
                                    lowerThreshold: 45
                                }
                            ]
                        },
                        {
                            position: 'storage',
                            assetId: '5ydJLbMubRRyPnZMJEU97v',
                            attributeName: 'efficiencyExport',
                            timeframe: '5minutes',
                            refreshInterval: '1second',
                            operatingStatus: 'running',
                            linkUrl: 'http://localhost:9000/manager/#/assets/false/5ydJLbMubRRyPnZMJEU97v',
                            statusMessage: 'Emergency: Battery exploded.',
                            additionalAttributes: [
                                {
                                    assetId: '5ydJLbMubRRyPnZMJEU97v',
                                    attributeName: 'status',
                                    icon: 'battery'
                                }
                            ]
                        },
                        {
                            position: 'consumers',
                            assetId: '5ydJLbMubRRyPnZMJEU97v',
                            attributeName: 'energyExportTotal',
                            timeframe: '5minutes',
                            refreshInterval: '1second',
                            operatingStatus: 'running',
                            linkUrl: 'http://localhost:9000/manager/#/assets/false/5ydJLbMubRRyPnZMJEU97v',
                            statusMessage: 'Info: Consuming energy for heating',
                            additionalAttributes: [
                                {
                                    assetId: '5ydJLbMubRRyPnZMJEU97v',
                                    attributeName: 'temperature',
                                    icon: 'thermometer'
                                }
                            ]
                        },
                        {
                            position: 'grid',
                            assetId: '5ydJLbMubRRyPnZMJEU97v',
                            attributeName: 'power',
                            timeframe: '5minutes',
                            refreshInterval: '1second',
                            operatingStatus: 'running',
                            linkUrl: 'http://localhost:9000/manager/#/assets/false/5ydJLbMubRRyPnZMJEU97v',
                            statusMessage: 'Warning: Connected to main grid',
                            additionalAttributes: [
                                {
                                    assetId: '5ydJLbMubRRyPnZMJEU97v',
                                    attributeName: 'status',
                                    icon: 'connection'
                                }
                            ]
                        }
                    ]}"
                    style="height: 100%; width: 100%;">
                </or-flow-grid>

            </div>
        `;
    }

}
