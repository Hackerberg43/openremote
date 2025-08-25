import {css, html, LitElement, PropertyValues, unsafeCSS} from "lit";
import {customElement, property, state, query} from "lit/decorators.js";
import {translate} from "@openremote/or-translate";
import i18next from "i18next";
import {
    Asset,
    AssetDatapointIntervalQuery,
    AssetDatapointIntervalQueryFormula,
    AssetDatapointNearestQuery,
    AssetModelUtil,
    AttributeEvent,
    AttributeRef,
    ValueDatapoint
} from "@openremote/model";
import manager, {DefaultColor2, DefaultColor3, DefaultColor4, Util, subscribe} from "@openremote/core";
import "@openremote/or-components/or-loading-indicator";
import "@openremote/or-translate";
import "@openremote/or-icon";
import {OrIcon} from "@openremote/or-icon";
import {showTooltip, hideTooltip} from "@openremote/vdl-app-tooltip";
import * as echarts from "echarts/core";
import {LineChart, LineSeriesOption} from "echarts/charts";
import {GridComponent, TooltipComponent, GridComponentOption, TooltipComponentOption} from "echarts/components";
import {CanvasRenderer} from "echarts/renderers";
import moment from "moment";
import {when} from "lit/directives/when.js";
import {InputType, OrInputChangedEvent} from "@openremote/or-mwc-components/or-mwc-input";
import "@openremote/or-mwc-components/or-mwc-input";
import {getContentWithMenuTemplate} from "@openremote/or-mwc-components/or-mwc-menu";

echarts.use([GridComponent, TooltipComponent, LineChart, CanvasRenderer]);

// Additional Attribute Indicator Sub-component
@customElement("vdl-live-chart-additional-attribute")
export class VdlLiveChartAdditionalAttribute extends LitElement {
    
    static get styles() {
        return css`
            :host {
                display: contents;
            }
            .attribute-indicator {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                color: var(--internal-vdl-live-chart-text-color, #333);
                opacity: 0.8;
            }
            
            .attribute-icon {
                --or-icon-fill: #4CAF50;
                --or-icon-width: 14px;
                --or-icon-height: 14px;
            }
            
            .attribute-icon.warning {
                --or-icon-fill: #FF9800;
            }
            
            .attribute-icon.error {
                --or-icon-fill: #F44336;
            }
            
            .attribute-value {
                font-weight: 500;
            }
        `;
    }

    @property({type: String})
    public icon?: string;

    @property()
    public value?: number | string;

    @property({type: String})
    public status: StatusLevel = 'ok';

    @property({type: String})
    public unit?: string;

    render() {
        if (!this.icon) {
            return html``;
        }
        
        const displayValue = this.value !== undefined ? this.value : '--';
        
        return html`
            <div class="attribute-indicator">
                <or-icon class="attribute-icon ${this.status}" icon="${this.icon}"></or-icon>
                <span class="attribute-value">${displayValue}${typeof this.value === 'string' ? '' : (this.unit || '')}</span>
            </div>
        `;
    }
}

// Current Value Display Sub-component
@customElement("vdl-live-chart-current-value")
export class VdlLiveChartCurrentValue extends LitElement {
    
    static get styles() {
        return css`
            :host {
                display: contents;
            }
            .current-value-wrapper {
                display: flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
            }
            .current-value-number {
                color: var(--internal-vdl-live-chart-text-color, #333);
                font-size: var(--current-value-font-size, 32px);
                font-weight: bold;
            }
            .current-value-unit {
                color: var(--internal-vdl-live-chart-text-color, #333);
                font-size: var(--current-value-font-size, 32px);
                font-weight: 200;
                margin-left: 5px;
            }
        `;
    }

    @property({type: Number})
    public value?: number;

    @property({type: String})
    public unit?: string;

    @property({type: Object})
    public asset?: Asset;

    render() {
        if (this.value === undefined) return html``;
        
        return html`
            <div class="current-value-wrapper">
                <span class="current-value-number">${this.value}</span>
                ${this.unit ? html`
                    <span class="current-value-unit">${this.unit}</span>
                ` : ''}
            </div>
        `;
    }
}

export type ECChartOption = echarts.ComposeOption<
    | LineSeriesOption
    | TooltipComponentOption
    | GridComponentOption
>;

export interface LiveChartDataPoint {
    x: number;
    y: number | null;
}

export type TimeframeOption = "5minutes" | "30minutes" | "1hour";
export type RefreshIntervalOption = "1second" | "1minute";
export type OperatingStatus = "running" | "dischargingOnly";

export interface AdditionalAttribute {
    assetId: string;
    attributeName: string;
    icon: string;
    upperThreshold?: number;
    lowerThreshold?: number;
}

export type StatusLevel = "ok" | "info" | "warning" | "error";

// language=CSS
const style = css`
    :host {
        --internal-vdl-live-chart-background-color: var(--vdl-live-chart-background-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
        --internal-vdl-live-chart-border-color: var(--vdl-live-chart-border-color, rgba(76, 76, 76, 0.6));
        --internal-vdl-live-chart-text-color: var(--vdl-live-chart-text-color, var(--or-app-color3, ${unsafeCSS(DefaultColor3)}));
        --internal-vdl-live-chart-graph-line-color: var(--vdl-live-chart-graph-line-color, var(--or-app-color4, ${unsafeCSS(DefaultColor4)}));

        width: 100%;
        height: 100%;
        display: block;
    }

    :host([hidden]) {
        display: none;
    }

    .panel {
        position: relative;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 0px 15px 0px 15px;
        background: var(--internal-vdl-live-chart-background-color);
        border: 1px solid var(--internal-vdl-live-chart-border-color);
        border-radius: 20px;
    }

    .panel-content {
        display: flex;
        flex-direction: row;
        width: 100%;
        flex: 1;
        overflow: hidden;
    }

    .chart-container {
        flex: 1 1 0;
        position: relative;
        overflow: hidden;
        width: 100%;
    }

    #chart {
        width: 100% !important;
        height: 100% !important;
        max-width: 100%;
        max-height: 100%;
    }

    .additional-attributes-wrapper {
        display: flex;
        justify-content: flex-end;
        align-items: end;
        padding: 10px 5px;
        flex: 0 0 auto;
        border-top: 1px solid var(--internal-vdl-live-chart-border-color);
        gap: 10px;
    }

    .main-group {
        display: flex;
        align-items: end;
        padding-left: 5px;
        padding-top: 15px;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .main-group.expanded {
        flex: 1;
    }

    .main-group.expanded vdl-live-chart-current-value {
        --current-value-font-size: 40px;
    }

    .main-group.expanded .status-indicator {
        font-size: 16px;
        margin-bottom: 5px;
    }

    .main-group.expanded .status-message-container {
        margin-top: 10px;
    }

    .status-indicator {
        display: flex;
        align-items: center;
        font-size: 12px;
        color: var(--internal-vdl-live-chart-text-color);
        position: relative;
        cursor: help;
    }

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 5px;
    }

    .status-dot.live {
        background-color: #4CAF50;
        box-shadow: 0 0 4px #4CAF50;
    }

    .status-dot.loading {
        background-color: #FF9800;
        animation: pulse 2s infinite;
    }

    .status-dot.error {
        background-color: #F44336;
    }

    @keyframes pulse {
        0% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
        100% {
            opacity: 1;
        }
    }

    @keyframes flash {
        0% {
            border-color: var(--internal-vdl-live-chart-border-color);
            background-color: var(--internal-vdl-live-chart-background-color);
        }
        50% {
            border-color: rgba(244, 67, 54, 1);
            background-color: color-mix(in srgb, var(--internal-vdl-live-chart-background-color) 90%, rgba(244, 67, 54, 1) 10%);
        }
        100% {
            border-color: var(--internal-vdl-live-chart-border-color);
            background-color: var(--internal-vdl-live-chart-background-color);
        }
    }

    .panel.error {
        animation: flash 2.5s infinite;
    }

    .link-icon {
        position: absolute;
        bottom: 8px;
        left: 12px;
        --or-icon-width: 16px;
        --or-icon-height: 16px;
        --or-icon-fill: var(--internal-vdl-live-chart-text-color);
        opacity: 0;
        transition: opacity 0.2s ease;
        cursor: pointer;
        background: var(--internal-vdl-live-chart-background-color);
        border-radius: 3px;
        padding: 2px;
        z-index: 10;
    }

    .panel:hover .link-icon {
        opacity: 0.7;
    }

    .link-icon:hover {
        opacity: 1;
        background-color: color-mix(in srgb, var(--internal-vdl-live-chart-background-color) 85%, var(--internal-vdl-live-chart-text-color) 15%);
    }

    /* Always show link icon on mobile devices */
    @media (hover: none) and (pointer: coarse) {
        .link-icon {
            opacity: 0.7;
        }
    }

    /* Emphasize tooltip-enabled components on panel hover */
    .status-indicator,
    .status-message-container,
    .additional-attributes {
        transition: filter 0.2s ease;
    }

    .panel:hover .status-indicator,
    .panel:hover .status-message-container,
    .panel:hover .additional-attributes {
        filter: brightness(1.2) drop-shadow(0 0 3px rgba(0, 0, 0, 0.3));
    }

    .error-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        flex-direction: column;
        color: var(--internal-vdl-live-chart-text-color);
    }

    .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        flex-direction: column;
        color: var(--internal-vdl-live-chart-text-color);
        opacity: 0.6;
    }

    .additional-attributes {
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: flex-end;
    }

    .status-message-container {
        display: flex;
        align-items: center;
        margin-top: 8px;
        position: relative;
        cursor: help;
    }

    .icon-wrapper {
        position: relative;
        display: inline-block;
        overflow: visible;
    }

    .status-message-icon {
        --or-icon-width: 32px;
        --or-icon-height: 32px;
    }

    .overlay-info-icon {
        position: absolute;
        top: -2px;
        right: -2px;
        --or-icon-width: 14px;
        --or-icon-height: 14px;
        --or-icon-fill: rgb(33, 150, 243);
        background: var(--internal-vdl-live-chart-background-color);
        border-radius: 50%;
        padding: 1px;
        z-index: 1;
    }

    .status-message-icon.info {
        --or-icon-fill: rgba(33, 150, 243, 0.5);
    }

    .status-message-icon.warning {
        --or-icon-fill: #FF9800;
    }

    .status-message-icon.error {
        --or-icon-fill: #F44336;
    }

    .tooltip-title {
        font-weight: bold;
        font-size: 16px;
        margin-bottom: 8px;
        color: var(--internal-vdl-live-chart-text-color);
    }

    .tooltip-message {
        margin-bottom: 8px;
        line-height: 1.4;
    }

    .tooltip-note {
        font-size: 12px;
        opacity: 0.7;
        font-style: italic;
        border-top: 1px solid var(--internal-vdl-live-chart-border-color);
        padding-top: 8px;
        margin-top: 8px;
    }

    .tooltip-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
    }

    .tooltip-row:last-child {
        margin-bottom: 0;
    }

    .tooltip-label {
        margin-right: 16px;
    }

    .tooltip-value {
        text-align: right;
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .attr-unit {
        font-weight: normal;
    }

    .status-indicator {
        cursor: help;
    }

    .status-message-container {
        cursor: help;
    }

    .additional-attributes {
        cursor: help;
    }
`;

@customElement("vdl-live-chart")
export class VdlLiveChart extends subscribe(manager)(translate(i18next)(LitElement)) {

    static get styles() {
        return [style];
    }

    @property({type: String})
    public assetId?: string;

    @property({type: String})
    public attributeName?: string;

    @property({type: String})
    public timeframe: TimeframeOption = "30minutes";

    @property({type: String})
    public refreshInterval: RefreshIntervalOption = "1minute";

    @property({type: Boolean})
    public disabled = false;

    @property({type: String})
    public realm?: string;

    @property({type: Array})
    public additionalAttributes: AdditionalAttribute[] = [];

    @property({type: String})
    public statusMessage?: string;

    @property({type: String})
    public operatingStatus?: OperatingStatus;

    @property({type: String})
    public linkUrl?: string;

    @property({type: Boolean})
    public showChart = true;

    @state()
    protected _loading = false;

    protected _data: LiveChartDataPoint[] = [];

    @state()
    protected _error?: string;

    @state()
    protected _asset?: Asset;

    protected _lastEventTime?: number;

    @state()
    protected _isLive = false;

    protected _additionalAttributeValues: Map<string, {value: number | string, status: StatusLevel, unit?: string}> = new Map();
    protected _hasErrorStatus = false;
    protected _messageErrorStatus = false;

    @query("#chart")
    protected _chartElem!: HTMLDivElement;
    
    @query("vdl-live-chart-current-value")
    protected _currentValueElem?: VdlLiveChartCurrentValue;

    @query(".panel")
    protected _panelElem?: HTMLDivElement;

    protected _chart?: echarts.ECharts;
    protected _style!: CSSStyleDeclaration;
    protected _resizeHandler?: () => void;
    protected _containerResizeObserver?: ResizeObserver;
    protected _dataAbortController?: AbortController;
    protected _refreshTimer?: ReturnType<typeof setInterval>;
    protected _lastReceivedValue?: number;
    protected _timeframeMs: number = 30 * 60 * 1000;
    protected _refreshIntervalMs: number = 60 * 1000;
    protected _mouseEnterHandler?: any;
    protected _mouseLeaveHandler?: any;
    protected _globalTouchHandler?: (e: TouchEvent) => void;
    protected _linkIconClickHandler?: (e: MouseEvent) => void;
    protected _isChartHovered = false;

    constructor() {
        super();
        this._updateTimeframeMs();
        this._updateRefreshIntervalMs();
    }

    connectedCallback() {
        super.connectedCallback();
        this._style = window.getComputedStyle(this as unknown as Element);
        this.realm = this.realm || manager.getRealm();
        
        if (this._isMobileDevice()) {
            this._setupGlobalTouchHandler();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._cleanup();
    }

    updated(changedProperties: PropertyValues) {
        super.updated(changedProperties);

        if (changedProperties.has("timeframe")) {
            this._updateTimeframeMs();
        }

        if (changedProperties.has("refreshInterval")) {
            this._updateRefreshIntervalMs();
        }

        const reloadData = changedProperties.has("assetId") || 
                          changedProperties.has("attributeName") || 
                          changedProperties.has("realm") ||
                          changedProperties.has("timeframe") ||
                          changedProperties.has("refreshInterval") ||
                          changedProperties.has("additionalAttributes");
                          
        if (changedProperties.has("statusMessage") || changedProperties.has("operatingStatus")) {
            this._updateErrorStatus();
        }

        if (changedProperties.has("showChart")) {
            if (this.showChart && this._data.length > 0 && !this._chart && this._chartElem) {
                this._initializeChart();
            } else if (!this.showChart && this._chart) {
                this._chart.dispose();
                this._chart = undefined;
            }
        }

        if (reloadData) {
            this._cleanup();
            if (this.assetId && this.attributeName) {
                this._loadData();
            }
        } else if (!this._error && !this._chart && this._chartElem && this.showChart) {
            this._initializeChart();
        }
        
        this.updateComplete.then(() => {
            this._setupTooltipEventListeners();
            this._setupClickHandler();
        });
    }

    protected _updateTimeframeMs() {
        switch (this.timeframe) {
            case "5minutes":
                this._timeframeMs = 5 * 60 * 1000;
                break;
            case "30minutes":
                this._timeframeMs = 30 * 60 * 1000;
                break;
            case "1hour":
                this._timeframeMs = 60 * 60 * 1000;
                break;
        }
    }

    protected _updateRefreshIntervalMs() {
        switch (this.refreshInterval) {
            case "1second":
                this._refreshIntervalMs = 1000;
                break;
            case "1minute":
                this._refreshIntervalMs = 60 * 1000;
                break;
        }
    }

    protected async _loadData() {
        if (!this.assetId || !this.attributeName) {
            this._error = "noAttributeConnected";
            return;
        }

        this._loading = true;
        this._error = undefined;
        this._isLive = false;

        try {
            const assetResponse = await manager.rest.api.AssetResource.get(this.assetId);
            this._asset = assetResponse.data;

            await this._loadInitialData();
            await this._getCurrentValue();

            this._subscribeToAttributeEvents();
            this._loadAdditionalAttributes();
            this._startRefreshTimer();

            this._isLive = true;
            this._updateErrorStatus();

        } catch (ex) {
            this._error = "errorOccurred";
        } finally {
            this._loading = false;
        }
    }

    protected async _loadInitialData() {
        if (!this.assetId || !this.attributeName) return;

        const endTime = Date.now();
        const startTime = endTime - this._timeframeMs;
        this._dataAbortController = new AbortController();

        try {
            const intervalData = await this._fetchIntervalData(startTime, endTime);
            
            if (intervalData.length > 0) {
                const nearestStartValue = await this._fetchNearestData(startTime);
                this._data = this._combineDataWithNearestStart(intervalData, nearestStartValue, startTime);
            } else {
                const nearestEndValue = await this._fetchNearestData(endTime);
                this._data = this._generateSyntheticDataPoints(nearestEndValue, startTime, endTime);
            }
            
            if (!this._chart && this._chartElem && this.showChart) {
                this._initializeChart();
            } else if (this.showChart) {
                this._updateChart();
            }
        } catch (ex) {
            this._data = [];
        }
    }

    protected async _fetchIntervalData(startTime: number, endTime: number): Promise<LiveChartDataPoint[]> {
        const query: AssetDatapointIntervalQuery = {
            type: "interval",
            formula: AssetDatapointIntervalQueryFormula.AVG,
            interval: this._getIntervalString(),
            fromTimestamp: startTime,
            toTimestamp: endTime,
            gapFill: false
        };

        const response = await manager.rest.api.AssetDatapointResource.getDatapoints(
            this.assetId!,
            this.attributeName!,
            query,
            {signal: this._dataAbortController?.signal}
        );

        if (response.status === 200 && response.data) {
            return response.data.map((dp: ValueDatapoint<any>) => ({
                x: dp.x!,
                y: dp.y !== null && dp.y !== undefined ? dp.y : null
            }));
        }
        return [];
    }

    protected async _fetchNearestData(timestamp: number): Promise<any> {
        const nearestQuery: AssetDatapointNearestQuery = {
            type: "nearest",
            fromTimestamp: timestamp
        };

        const response = await manager.rest.api.AssetDatapointResource.getDatapoints(
            this.assetId!,
            this.attributeName!,
            nearestQuery,
            {signal: this._dataAbortController?.signal}
        );

        if (response.status === 200 && response.data && response.data.length > 0) {
            return response.data[0].y;
        }
        return null;
    }

    protected _combineDataWithNearestStart(intervalData: LiveChartDataPoint[], nearestStartValue: any, startTime: number): LiveChartDataPoint[] {
        if (!intervalData.length) return [];
        
        const oldestDataTimestamp = intervalData[0].x;
        const combinedData: LiveChartDataPoint[] = [];
        
        if (nearestStartValue !== null && oldestDataTimestamp > startTime) {
            const syntheticPoints = this._generateSyntheticDataPoints(nearestStartValue, startTime, oldestDataTimestamp - this._getIntervalMs());
            combinedData.push(...syntheticPoints);
        }
        
        combinedData.push(...intervalData);
        
        return combinedData;
    }

    protected _generateSyntheticDataPoints(value: any, startTime: number, endTime: number): LiveChartDataPoint[] {
        const dataPoints: LiveChartDataPoint[] = [];
        const intervalMs = this._getIntervalMs();
        
        for (let timestamp = startTime; timestamp <= endTime; timestamp += intervalMs) {
            dataPoints.push({
                x: timestamp,
                y: value !== null && value !== undefined ? value : null
            });
        }
        
        return dataPoints;
    }

    protected _getIntervalMs(): number {
        switch (this.refreshInterval) {
            case "1second":
                return 1000;
            case "1minute":
                return 60 * 1000;
            default:
                return 60 * 1000;
        }
    }

    protected _getIntervalString(): string {
        switch (this.refreshInterval) {
            case "1second":
                return "1 second";
            case "1minute":
                return "1 minute";
            default:
                return "1 minute";
        }
    }

    protected async _getCurrentValue() {
        if (!this.assetId || !this.attributeName) return;

        try {
            const currentValue: AttributeEvent = await manager.events!.sendEventWithReply({
                eventType: "read-asset-attribute",
                ref: {
                    id: this.assetId,
                    name: this.attributeName
                }
            });

            this._lastReceivedValue = currentValue.value;

            let units: string | undefined;
            if (this._asset && this._asset.attributes) {
                const attr = this._asset.attributes[this.attributeName];
                if (attr) {
                    const attributeDescriptor = AssetModelUtil.getAttributeDescriptor(attr.name!, this._asset.type!);
                    units = Util.resolveUnits(Util.getAttributeUnits(attr, attributeDescriptor, this._asset.type));
                }
            }

            if (this._currentValueElem) {
                this._currentValueElem.value = currentValue.value;
                this._currentValueElem.unit = units;
            } else {
                this.updateComplete.then(() => {
                    if (this._currentValueElem) {
                        this._currentValueElem.value = currentValue.value;
                        this._currentValueElem.unit = units;
                    }
                });
            }
        } catch (ex) {
            // Error handled silently
        }
    }

    protected _subscribeToAttributeEvents() {
        if (!this.assetId || !this.attributeName || !manager.events) {
            return;
        }

        this._unsubscribeFromAttributeEvents();

        const attributeRef: AttributeRef = {
            id: this.assetId,
            name: this.attributeName
        };

        (this as any).attributeRefs = [attributeRef];
    }

    protected _unsubscribeFromAttributeEvents() {
        (this as any).attributeRefs = undefined;
    }

    protected async _loadAdditionalAttributes() {
        if (!this.additionalAttributes || this.additionalAttributes.length === 0) {
            return;
        }

        const allAttributes = this.additionalAttributes;
        
        for (const attr of allAttributes) {
            try {
                const assetResponse = await manager.rest.api.AssetResource.get(attr.assetId);
                const asset = assetResponse.data;
                
                const currentValue: AttributeEvent = await manager.events!.sendEventWithReply({
                    eventType: "read-asset-attribute",
                    ref: {
                        id: attr.assetId,
                        name: attr.attributeName
                    }
                });

                let units: string | undefined;
                if (asset && asset.attributes) {
                    const attribute = asset.attributes[attr.attributeName];
                    if (attribute) {
                        const attributeDescriptor = AssetModelUtil.getAttributeDescriptor(attribute.name!, asset.type!);
                        units = Util.resolveUnits(Util.getAttributeUnits(attribute, attributeDescriptor, asset.type));
                    }
                }

                const status = this._determineStatus(currentValue.value, attr.upperThreshold, attr.lowerThreshold);
                const key = `${attr.assetId}_${attr.attributeName}`;
                this._additionalAttributeValues.set(key, { 
                    value: currentValue.value, 
                    status,
                    unit: units 
                });

                this._subscribeToAdditionalAttribute(attr);
            } catch (ex) {
                // Error handled silently
            }
        }

        this._updateErrorStatus();
        this.requestUpdate();
    }

    protected _subscribeToAdditionalAttribute(attr: AdditionalAttribute) {
        if (!manager.events) return;

        const attributeRef: AttributeRef = {
            id: attr.assetId,
            name: attr.attributeName
        };

        const currentRefs = (this as any).attributeRefs || [];
        (this as any).attributeRefs = [...currentRefs, attributeRef];
    }

    protected _unsubscribeFromAdditionalAttributes() {
        if (this.assetId && this.attributeName) {
            (this as any).attributeRefs = [{
                id: this.assetId,
                name: this.attributeName
            }];
        } else {
            (this as any).attributeRefs = undefined;
        }
    }

    protected _determineStatus(value: number | string, upperThreshold?: number, lowerThreshold?: number): StatusLevel {
        if (typeof value === 'string') {
            return "ok";
        }
        
        if (upperThreshold !== undefined && value > upperThreshold) {
            return "error";
        }
        if (lowerThreshold !== undefined && value < lowerThreshold) {
            return "error";
        }
        if (upperThreshold !== undefined && value > upperThreshold * 0.9) {
            return "warning";
        }
        if (lowerThreshold !== undefined && value < lowerThreshold * 1.1) {
            return "warning";
        }
        return "ok";
    }

    protected _determineMessageStatus(message?: string): StatusLevel | null {
        if (!message) return null;
        
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes("emergency")) {
            return "error";
        }
        if (lowerMessage.includes("warning")) {
            return "warning";
        }
        if (lowerMessage.includes("info")) {
            return "info";
        }
        
        return null;
    }

    protected _getStatusIcon(status: StatusLevel): string {
        switch (status) {
            case "error":
                return "alert-circle";
            case "warning":
                return "alert";
            case "info":
            default:
                return "information";
        }
    }

    protected _getOperatingStatusIcon(operatingStatus?: OperatingStatus): string {
        switch (operatingStatus) {
            case "running":
                return "lightning-bolt";
            case "dischargingOnly":
                return "battery";
            default:
                return "help-circle";
        }
    }

    protected _getOperatingStatusColor(operatingStatus?: OperatingStatus): string {
        switch (operatingStatus) {
            case "running":
                return "#4CAF50";
            case "dischargingOnly":
                return "#bfff00";
            default:
                return "#9E9E9E";
        }
    }

    protected _getTimeframeDisplay(timeframe: TimeframeOption): string {
        switch (timeframe) {
            case "5minutes":
                return "5 minutes";
            case "30minutes":
                return "30 minutes";
            case "1hour":
                return "1 hour";
            default:
                return timeframe;
        }
    }

    protected _getRefreshIntervalDisplay(refreshInterval: RefreshIntervalOption): string {
        switch (refreshInterval) {
            case "1second":
                return "1 second";
            case "1minute":
                return "1 minute";
            default:
                return refreshInterval;
        }
    }

    protected _shouldShowIcon(): boolean {
        return this.operatingStatus !== undefined || (this.statusMessage !== undefined && this._determineMessageStatus(this.statusMessage) !== null);
    }

    protected _getPrimaryIcon(): { icon: string; color: string } {
        const messageStatus = this._determineMessageStatus(this.statusMessage);
        
        if (messageStatus === "error" || messageStatus === "warning") {
            return {
                icon: this._getStatusIcon(messageStatus),
                color: messageStatus === "error" ? "#F44336" : "#FF9800"
            };
        }
        
        return {
            icon: this._getOperatingStatusIcon(this.operatingStatus),
            color: this._getOperatingStatusColor(this.operatingStatus)
        };
    }

    protected _shouldShowInfoOverlay(): boolean {
        const messageStatus = this._determineMessageStatus(this.statusMessage);
        return messageStatus === "info" && this.operatingStatus !== undefined;
    }

    protected _formatAttributeName(camelCaseName: string): string {
        return camelCaseName
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/^./, str => str.toUpperCase());
    }

    protected _updateErrorStatus() {
        const hadError = this._hasErrorStatus;
        const additionalAttributeError = Array.from(this._additionalAttributeValues.values())
            .some(attr => attr.status === "error");
        this._messageErrorStatus = this._determineMessageStatus(this.statusMessage) === "error";
        this._hasErrorStatus = additionalAttributeError || this._messageErrorStatus;
        
        if (hadError !== this._hasErrorStatus && this._panelElem) {
            if (this._hasErrorStatus) {
                this._panelElem.classList.add('error');
            } else {
                this._panelElem.classList.remove('error');
            }
        }
    }

    protected _updateAdditionalAttributeSubComponent(key: string, value: number | string, status: StatusLevel, unit?: string) {
        const subComponent = this.shadowRoot?.querySelector(`vdl-live-chart-additional-attribute[data-key="${key}"]`) as VdlLiveChartAdditionalAttribute;
        if (subComponent) {
            subComponent.value = value;
            subComponent.status = status;
            if (unit !== undefined) {
                subComponent.unit = unit;
            }
        }
    }

    public _onEvent(event: any) {
        if (event.eventType === "attribute") {
            const attributeEvent = event as AttributeEvent;
            
            if (attributeEvent.ref?.id === this.assetId && attributeEvent.ref?.name === this.attributeName) {
                this._lastEventTime = Date.now();
                this._lastReceivedValue = attributeEvent.value;
                
                if (this._currentValueElem) {
                    this._currentValueElem.value = attributeEvent.value;
                    
                    if (!this._currentValueElem.unit && this._asset && this._asset.attributes && this.attributeName) {
                        const attr = this._asset.attributes[this.attributeName];
                        if (attr) {
                            const attributeDescriptor = AssetModelUtil.getAttributeDescriptor(attr.name!, this._asset.type!);
                            const units = Util.resolveUnits(Util.getAttributeUnits(attr, attributeDescriptor, this._asset.type));
                            this._currentValueElem.unit = units;
                        }
                    }
                }
            }
            else {
                const key = `${attributeEvent.ref?.id}_${attributeEvent.ref?.name}`;
                const additionalAttr = this.additionalAttributes.find(
                    attr => attr.assetId === attributeEvent.ref?.id && attr.attributeName === attributeEvent.ref?.name
                );
                
                if (additionalAttr) {
                    const status = this._determineStatus(
                        attributeEvent.value,
                        additionalAttr.upperThreshold,
                        additionalAttr.lowerThreshold
                    );
                    
                    const existingData = this._additionalAttributeValues.get(key);
                    const unit = existingData?.unit;
                    
                    this._additionalAttributeValues.set(key, {
                        value: attributeEvent.value,
                        status,
                        unit
                    });
                    
                    this._updateAdditionalAttributeSubComponent(key, attributeEvent.value, status, unit);
                    this._updateErrorStatus();
                }
            }
        }
    }

    protected _startRefreshTimer() {
        this._stopRefreshTimer();
        
        this._refreshTimer = setInterval(() => {
            const now = Date.now();
            let valueToAdd = this._lastReceivedValue;

            if (!this._lastEventTime || (now - this._lastEventTime) > this._refreshIntervalMs) {
                valueToAdd = this._lastReceivedValue;
            }

            if (valueToAdd !== undefined && valueToAdd !== null) {
                const newDataPoint: LiveChartDataPoint = {
                    x: now,
                    y: valueToAdd
                };

                const cutoffTime = now - this._timeframeMs;
                this._data = [...this._data.filter(dp => dp.x >= cutoffTime), newDataPoint];

                if (this.showChart) {
                    this._updateChart();
                }
            }
        }, this._refreshIntervalMs);
    }

    protected _stopRefreshTimer() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = undefined;
        }
    }

    protected _initializeChart() {
        if (!this._chartElem || !this.showChart) return;

        this._chart = echarts.init(this._chartElem);

        const chartOptions: ECChartOption = {
            animation: false,
            grid: {
                show: false,
                left: 10,
                right: 10,
                top: 10,
                bottom: 0,
                containLabel: true
            },
            tooltip: {
                trigger: "axis",
                confine: true,
                axisPointer: {
                    type: "line"
                },
                formatter: (params: any) => {
                    if (params && params.length > 0) {
                        const point = params[0];
                        const time = moment(point.axisValue).format("HH:mm:ss");
                        const value = point.value[1];
                        const unit = this._currentValueElem?.unit || "";
                        return `${time}<br/><strong>${value}${unit}</strong>`;
                    }
                    return "";
                }
            },
            xAxis: {
                type: "time",
                show: false,
                min: () => Date.now() - this._timeframeMs,
                max: () => Date.now()
            },
            yAxis: {
                type: "value",
                show: false,
                scale: true
            },
            series: []
        };

        this._chart.setOption(chartOptions);
        this._updateChart();

        this._setupResizeHandler();
        this._toggleChartEventListeners(true);
        this._setupTooltipEventListeners();
    }

    protected _updateChart() {
        if (!this._chart || !this.showChart) return;

        const seriesData = this._data.map(dp => [dp.x, dp.y]);
        const now = Date.now();

        this._chart.setOption({
            xAxis: {
                min: now - this._timeframeMs,
                max: now
            },
            series: [{
                type: "line",
                data: seriesData,
                smooth: true,
                symbol: this._isChartHovered ? "circle" : "none",
                symbolSize: this._isChartHovered ? 2 : 0,
                lineStyle: {
                    color: this._style.getPropertyValue("--internal-vdl-live-chart-graph-line-color"),
                    width: 2
                },
                itemStyle: {
                    color: this._style.getPropertyValue("--internal-vdl-live-chart-graph-line-color")
                }
            }]
        });
    }

    protected _setupResizeHandler() {
        if (!this._resizeHandler) {
            this._resizeHandler = () => {
                if (this._chart) {
                    this._chart.resize();
                }
            };
            window.addEventListener("resize", this._resizeHandler);
            
            this._containerResizeObserver = new ResizeObserver(() => {
                if (this._chart) {
                    this._chart.resize();
                }
            });
            
            const chartContainer = this.shadowRoot?.querySelector('.chart-container') as HTMLElement;
            if (chartContainer) {
                this._containerResizeObserver.observe(chartContainer);
            }
        }
    }

    protected _cleanup() {
        this._stopRefreshTimer();

        if (this._dataAbortController) {
            this._dataAbortController.abort();
            this._dataAbortController = undefined;
        }

        this._unsubscribeFromAttributeEvents();
        this._unsubscribeFromAdditionalAttributes();

        if (this._chart) {
            this._chart.dispose();
            this._chart = undefined;
        }

        if (this._resizeHandler) {
            window.removeEventListener("resize", this._resizeHandler);
            this._resizeHandler = undefined;
        }

        if (this._containerResizeObserver) {
            this._containerResizeObserver.disconnect();
            this._containerResizeObserver = undefined;
        }

        this._removeTooltipEventListeners();
        this._removeGlobalTouchHandler();
        this._removeClickHandler();

        this._data = [];
        this._lastReceivedValue = undefined;
        this._lastEventTime = undefined;
        this._isLive = false;
        
        if (this._currentValueElem) {
            this._currentValueElem.value = undefined;
            this._currentValueElem.unit = undefined;
        }
        
        this._additionalAttributeValues.clear();
        this._hasErrorStatus = false;
        this._messageErrorStatus = false;
        
        if (this._panelElem) {
            this._panelElem.classList.remove('error');
        }
    }

    protected _onTimeframeChanged(event: OrInputChangedEvent) {
        this.timeframe = event.detail.value as TimeframeOption;
    }

    protected _onRefreshIntervalChanged(event: OrInputChangedEvent) {
        this.refreshInterval = event.detail.value as RefreshIntervalOption;
    }

    render() {
        if (!this.assetId || !this.attributeName) {
            return html`
                <div class="panel">
                    <div class="panel-content">
                        <div class="empty-state">
                            <span>No asset or attribute configured</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this._loading) {
            return html`
                <div class="panel">
                    <div class="panel-content">
                        <or-loading-indicator></or-loading-indicator>
                    </div>
                </div>
            `;
        }

        if (this._error) {
            return html`
                <div class="panel">
                    <div class="panel-content">
                        <div class="error-container">
                            <or-translate .value="${this._error}"></or-translate>
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="panel ${this._hasErrorStatus ? 'error' : ''}">
                ${this.linkUrl ? html`
                    <or-icon class="link-icon" icon="open-in-new"></or-icon>
                ` : ''}
                <div class="panel-content">
                    ${this.showChart ? html`
                        <div class="chart-container">
                            <div id="chart"></div>
                        </div>
                    ` : ''}
                    <div class="main-group ${!this.showChart ? 'expanded' : ''}">
                        <div class="status-indicator">
                            <div class="status-dot ${this._isLive ? 'live' : this._loading ? 'loading' : this._error ? 'error' : ''}"></div>
                            <span>${this._isLive ? 'Connected' : this._loading ? 'Loading' : this._error ? 'Error' : 'Disconnected'}</span>
                        </div>
                    <vdl-live-chart-current-value 
                        .asset="${this._asset}"
                    ></vdl-live-chart-current-value>
                    ${this._shouldShowIcon() ? html`
                        <div class="status-message-container">
                            <div class="icon-wrapper">
                                <or-icon 
                                    class="status-message-icon" 
                                    icon="${this._getPrimaryIcon().icon}"
                                    style="--or-icon-fill: ${this._getPrimaryIcon().color}">
                                </or-icon>
                                ${this._shouldShowInfoOverlay() ? html`
                                    <or-icon class="overlay-info-icon" icon="information"></or-icon>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    </div>
                </div>
                <div class="additional-attributes-wrapper">
                    ${this._renderAdditionalAttributes()}
                </div>
            </div>
        `;
    }

    protected _renderAdditionalAttributes() {
        if (!this.additionalAttributes || this.additionalAttributes.length === 0) {
            return html``;
        }

        const visibleAttributes = this.additionalAttributes.slice(0, 3);
        
        return html`
            <div class="additional-attributes">
                ${visibleAttributes.map(attr => {
                    const key = `${attr.assetId}_${attr.attributeName}`;
                    const attrData = this._additionalAttributeValues.get(key);
                    
                    return html`
                        <vdl-live-chart-additional-attribute 
                            data-key="${key}"
                            .icon="${attr.icon}"
                            .value="${attrData?.value}"
                            .status="${attrData?.status || 'ok'}"
                            .unit="${attrData?.unit}">
                        </vdl-live-chart-additional-attribute>
                    `;
                })}
            </div>
        `;
    }

    protected _toggleChartEventListeners(connect: boolean){
        if (connect) {
            this._mouseEnterHandler = this._chartElem.addEventListener('mouseenter', () => {
                this._isChartHovered = true;
                this._chart!.setOption({
                    yAxis: {show: true},
                    series: [{
                        symbol: "circle",
                        symbolSize: 2
                    }]
                });
            });

            this._mouseLeaveHandler = this._chartElem.addEventListener('mouseleave', () => {
                this._isChartHovered = false;
                this._chart!.setOption({
                    yAxis: { show: false},
                    series: [{
                        symbol: "none"
                    }]
                });
            });
        }
        else if (!connect) {
            this._chartElem?.removeEventListener('mouseenter', this._mouseEnterHandler);
            this._chartElem?.removeEventListener('mouseleave', this._mouseLeaveHandler);
        }
    }

    protected _setupTooltipEventListeners() {
        const container = this.shadowRoot?.querySelector('.status-message-container') as HTMLElement;
        
        if (container) {
            const mouseEnterHandler = (e: MouseEvent) => {
                const content = this._getStatusMessageTooltipContent();
                showTooltip(content, e.clientX, e.clientY);
            };
            
            const mouseLeaveHandler = () => {
                hideTooltip();
            };
            
            const touchHandler = (e: TouchEvent) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touch) {
                    const content = this._getStatusMessageTooltipContent();
                    showTooltip(content, touch.clientX, touch.clientY);
                }
            };
            
            container.addEventListener('mouseenter', mouseEnterHandler);
            container.addEventListener('mouseleave', mouseLeaveHandler);
            container.addEventListener('touchstart', touchHandler);
        }

        const statusIndicator = this.shadowRoot?.querySelector('.status-indicator') as HTMLElement;
        
        if (statusIndicator) {
            const statusMouseEnterHandler = (e: MouseEvent) => {
                const content = this._getStatusIndicatorTooltipContent();
                showTooltip(content, e.clientX, e.clientY);
            };
            
            const statusMouseLeaveHandler = () => {
                hideTooltip();
            };
            
            const statusTouchHandler = (e: TouchEvent) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touch) {
                    const content = this._getStatusIndicatorTooltipContent();
                    showTooltip(content, touch.clientX, touch.clientY);
                }
            };
            
            statusIndicator.addEventListener('mouseenter', statusMouseEnterHandler);
            statusIndicator.addEventListener('mouseleave', statusMouseLeaveHandler);
            statusIndicator.addEventListener('touchstart', statusTouchHandler);
        }

        const attributesContainer = this.shadowRoot?.querySelector('.additional-attributes') as HTMLElement;
        
        if (attributesContainer) {
            const attributesMouseEnterHandler = (e: MouseEvent) => {
                const content = this._getAdditionalAttributesTooltipContent();
                showTooltip(content, e.clientX, e.clientY);
            };
            
            const attributesMouseLeaveHandler = () => {
                hideTooltip();
            };
            
            const attributesTouchHandler = (e: TouchEvent) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touch) {
                    const content = this._getAdditionalAttributesTooltipContent();
                    showTooltip(content, touch.clientX, touch.clientY);
                }
            };
            
            attributesContainer.addEventListener('mouseenter', attributesMouseEnterHandler);
            attributesContainer.addEventListener('mouseleave', attributesMouseLeaveHandler);
            attributesContainer.addEventListener('touchstart', attributesTouchHandler);
        }
    }

    protected _getStatusMessageTooltipContent() {
        return html`
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">
                Message
            </div>
            ${this.statusMessage ? html`
                <div style="margin-bottom: 8px; line-height: 1.4;">
                    ${this.statusMessage}
                </div>
            ` : ''}
            ${this.operatingStatus ? html`
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="margin-right: 16px;">Operating Status:</span>
                    <span style="text-align: right; display: flex; align-items: center; justify-content: flex-end;">
                        <or-icon 
                            icon="${this._getOperatingStatusIcon(this.operatingStatus)}"
                            style="--or-icon-fill: ${this._getOperatingStatusColor(this.operatingStatus)}; --or-icon-width: 14px; --or-icon-height: 14px; margin-right: 4px;">
                        </or-icon>
                        ${this.operatingStatus}
                    </span>
                </div>
            ` : ''}
            ${this.statusMessage ? html`
                <div style="font-size: 12px; opacity: 0.7; font-style: italic; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 8px; margin-top: 8px;">
                    You can only clear this message in the machine.
                </div>
            ` : ''}
        `;
    }

    protected _getStatusIndicatorTooltipContent() {
        return html`
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">
                Connection
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="margin-right: 16px;">Chart Timeframe:</span>
                    <span style="text-align: right;">${this._getTimeframeDisplay(this.timeframe)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="margin-right: 16px;">Refresh Interval:</span>
                    <span style="text-align: right;">${this._getRefreshIntervalDisplay(this.refreshInterval)}</span>
                </div>
            </div>
        `;
    }

    protected _getAdditionalAttributesTooltipContent() {
        return html`
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">
                Device Attributes
            </div>
            <div>
                ${this.additionalAttributes.map(attr => {
                    const key = `${attr.assetId}_${attr.attributeName}`;
                    const attrData = this._additionalAttributeValues.get(key);
                    const value = attrData?.value !== undefined ? attrData.value.toString() : '--';
                    const unit = (typeof attrData?.value === 'string') ? '' : (attrData?.unit || '');
                    const status = attrData?.status || 'ok';
                    const color = status === 'error' ? '#F44336' : status === 'warning' ? '#FF9800' : '#4CAF50';
                    
                    return html`
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="margin-right: 16px; display: flex; align-items: center;">
                                <or-icon 
                                    icon="${attr.icon}" 
                                    style="--or-icon-fill: ${color}; --or-icon-width: 14px; --or-icon-height: 14px; margin-right: 4px;">
                                </or-icon>
                                ${this._formatAttributeName(attr.attributeName)}:
                            </span>
                            <span style="text-align: right; display: flex; align-items: center; justify-content: flex-end;">
                                ${value}${unit}
                            </span>
                        </div>
                    `;
                })}
            </div>
        `;
    }

    protected _isMobileDevice(): boolean {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    protected _setupGlobalTouchHandler() {
        if (this._globalTouchHandler) return;
        
        this._globalTouchHandler = (e: TouchEvent) => {
            const componentElement = this.shadowRoot?.host as HTMLElement;
            if (componentElement && !componentElement.contains(e.target as Node)) {
                hideTooltip();
            }
        };
        
        document.addEventListener('touchstart', this._globalTouchHandler);
    }

    protected _removeGlobalTouchHandler() {
        if (this._globalTouchHandler) {
            document.removeEventListener('touchstart', this._globalTouchHandler);
            this._globalTouchHandler = undefined;
        }
    }

    protected _setupClickHandler() {
        if (!this.linkUrl) return;

        const linkIcon = this.shadowRoot?.querySelector('.link-icon') as HTMLElement;
        if (!linkIcon) return;

        this._removeClickHandler();

        this._linkIconClickHandler = (e: MouseEvent) => {
            e.stopPropagation();
            if (confirm('Browse to this asset?')) {
                window.open(this.linkUrl, '_blank');
            }
        };

        linkIcon.addEventListener('click', this._linkIconClickHandler);
    }

    protected _removeClickHandler() {
        const linkIcon = this.shadowRoot?.querySelector('.link-icon') as HTMLElement;
        if (linkIcon && this._linkIconClickHandler) {
            linkIcon.removeEventListener('click', this._linkIconClickHandler);
        }
    }

    protected _removeTooltipEventListeners() {
        hideTooltip();
    }
}
