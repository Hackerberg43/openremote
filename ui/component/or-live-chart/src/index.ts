import {css, html, LitElement, PropertyValues, unsafeCSS} from "lit";
import {customElement, property, state, query} from "lit/decorators.js";
import {translate} from "@openremote/or-translate";
import i18next from "i18next";
import {
    Asset,
    AssetEvent,
    AssetDatapointIntervalQuery,
    AssetDatapointIntervalQueryFormula,
    AssetModelUtil,
    Attribute,
    AttributeEvent,
    AttributeRef,
    ReadAssetEvent,
    ValueDatapoint
} from "@openremote/model";
import manager, {DefaultColor2, DefaultColor3, DefaultColor4, Util, subscribe} from "@openremote/core";
import "@openremote/or-components/or-loading-indicator";
import "@openremote/or-translate";
import "@openremote/or-icon";
import {OrIcon} from "@openremote/or-icon";
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

// String Attribute Indicator Sub-component
@customElement("or-live-chart-string-attribute")
export class OrLiveChartStringAttribute extends LitElement {
    
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
                color: var(--internal-or-live-chart-text-color, #333);
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

    @property({type: String})
    public value?: string;

    @property({type: String})
    public status: StatusLevel = 'ok';

    render() {
        if (this.value === undefined || !this.icon) {
            return html``;
        }
        
        return html`
            <div class="attribute-indicator">
                <or-icon class="attribute-icon ${this.status}" icon="${this.icon}"></or-icon>
                <span class="attribute-value">${this.value}</span>
            </div>
        `;
    }
}

// Numeric Additional Attribute Indicator Sub-component
@customElement("or-live-chart-additional-attribute")
export class OrLiveChartAdditionalAttribute extends LitElement {
    
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
                color: var(--internal-or-live-chart-text-color, #333);
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

    @property({type: Number})
    public value?: number;

    @property({type: String})
    public status: StatusLevel = 'ok';

    @property({type: String})
    public unit?: string;

    render() {
        if (this.value === undefined || !this.icon) {
            return html``;
        }
        
        return html`
            <div class="attribute-indicator">
                <or-icon class="attribute-icon ${this.status}" icon="${this.icon}"></or-icon>
                <span class="attribute-value">${this.value}${this.unit || ''}</span>
            </div>
        `;
    }
}

// Current Value Display Sub-component
@customElement("or-live-chart-current-value")
export class OrLiveChartCurrentValue extends LitElement {
    
    static get styles() {
        return css`
            :host {
                display: contents;
            }
            .current-value-wrapper {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 10px;
                flex: 0 0 auto;
            }
            .current-value-number {
                color: var(--internal-or-live-chart-text-color, #333);
                font-size: 32px;
                font-weight: bold;
            }
            .current-value-unit {
                color: var(--internal-or-live-chart-text-color, #333);
                font-size: 32px;
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
                ${this.asset ? html`
                ` : ''}
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

export interface NumericAdditionalAttribute {
    assetId: string;
    attributeName: string;
    icon: string;
    upperThreshold?: number;
    lowerThreshold?: number;
}

export interface StringAdditionalAttribute {
    assetId: string;
    attributeName: string;
    icon: string;
    okValues?: string[];
    warningValues?: string[];
    errorValues?: string[];
}

export type AdditionalAttribute = NumericAdditionalAttribute | StringAdditionalAttribute;

export type StatusLevel = "ok" | "warning" | "error";

// language=CSS
const style = css`
    :host {
        --internal-or-live-chart-background-color: var(--or-live-chart-background-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
        --internal-or-live-chart-border-color: var(--or-live-chart-border-color, rgba(76, 76, 76, 0.6));
        --internal-or-live-chart-text-color: var(--or-live-chart-text-color, var(--or-app-color3, ${unsafeCSS(DefaultColor3)}));
        --internal-or-live-chart-graph-line-color: var(--or-live-chart-graph-line-color, var(--or-app-color4, ${unsafeCSS(DefaultColor4)}));

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
        background: var(--internal-or-live-chart-background-color);
        border: 1px solid var(--internal-or-live-chart-border-color);
        border-radius: 25px;
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

    .controls-wrapper {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: repeat(3, auto);
        padding: 10px 15px;
        flex: 0 0 auto;
        border-top: 1px solid var(--internal-or-live-chart-border-color);
        gap: 8px;
        align-items: center;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .status-indicator {
        grid-column: 1;
        grid-row: 1;
    }

    .string-attributes {
        grid-column: 1;
        grid-row: 2 / 4;
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: flex-start;
    }

    .numeric-attributes {
        grid-column: 2;
        grid-row: 1 / 4;
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: flex-end;
        justify-self: end;
    }

    .status-indicator {
        display: flex;
        align-items: center;
        font-size: 12px;
        color: var(--internal-or-live-chart-text-color);
        opacity: 0.7;
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
            border-color: var(--internal-or-live-chart-border-color);
            background-color: var(--internal-or-live-chart-background-color);
        }
        50% {
            border-color: rgba(244, 67, 54, 1);
            background-color: rgba(244, 67, 54, 0.05);
        }
        100% {
            border-color: var(--internal-or-live-chart-border-color);
            background-color: var(--internal-or-live-chart-background-color);
        }
    }

    .panel.error {
        animation: flash 2.5s infinite;
    }

    .error-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        flex-direction: column;
        color: var(--internal-or-live-chart-text-color);
    }

    .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        flex-direction: column;
        color: var(--internal-or-live-chart-text-color);
        opacity: 0.6;
    }

`;

@customElement("or-live-chart")
export class OrLiveChart extends subscribe(manager)(translate(i18next)(LitElement)) {

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

    @property({type: Array})
    public numericAttributes: NumericAdditionalAttribute[] = [];

    @property({type: Array})
    public stringAttributes: StringAdditionalAttribute[] = [];

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

    @query("#chart")
    protected _chartElem!: HTMLDivElement;
    
    @query("or-live-chart-current-value")
    protected _currentValueElem?: OrLiveChartCurrentValue;

    @query(".panel")
    protected _panelElem?: HTMLDivElement;

    protected _chart?: echarts.ECharts;
    protected _style!: CSSStyleDeclaration;
    protected _attributeEventSubscriptionId?: string;
    protected _additionalAttributeSubscriptions: Map<string, string> = new Map();
    protected _resizeHandler?: () => void;
    protected _containerResizeObserver?: ResizeObserver;
    protected _dataAbortController?: AbortController;
    protected _refreshTimer?: ReturnType<typeof setInterval>;
    protected _lastReceivedValue?: number;
    protected _timeframeMs: number = 30 * 60 * 1000; // 30 minutes default
    protected _refreshIntervalMs: number = 60 * 1000; // 1 minute default
    protected _mouseEnterHandler?: any;
    protected _mouseLeaveHandler?: any;

    constructor() {
        super();
        console.log('or-live-chart constructor called');
        this._updateTimeframeMs();
        this._updateRefreshIntervalMs();
    }

    connectedCallback() {
        super.connectedCallback();
        console.log('or-live-chart connectedCallback called');
        this._style = window.getComputedStyle(this as unknown as Element);
        this.realm = this.realm || manager.getRealm();
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
                          changedProperties.has("additionalAttributes") ||
                          changedProperties.has("numericAttributes") ||
                          changedProperties.has("stringAttributes");

        if (reloadData) {
            this._cleanup();
            if (this.assetId && this.attributeName) {
                this._loadData();
            }
        } else if (!this._error && this._data.length > 0 && !this._chart && this._chartElem) {
            this._initializeChart();
        }
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
            // Load asset information
            const assetResponse = await manager.rest.api.AssetResource.get(this.assetId);
            this._asset = assetResponse.data;

            // Load initial historical data
            await this._loadInitialData();

            // Get current value
            await this._getCurrentValue();

            // Subscribe to attribute events
            this._subscribeToAttributeEvents();

            // Load and subscribe to additional attributes
            this._loadAdditionalAttributes();

            // Start refresh timer for fixed interval updates
            this._startRefreshTimer();

            this._isLive = true;

        } catch (ex) {
            console.error("Failed to load data:", ex);
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

        const query: AssetDatapointIntervalQuery = {
            type: "interval",
            formula: AssetDatapointIntervalQueryFormula.AVG,
            interval: this._getIntervalString(),
            fromTimestamp: startTime,
            toTimestamp: endTime,
            gapFill: false
        };

        const response = await manager.rest.api.AssetDatapointResource.getDatapoints(
            this.assetId,
            this.attributeName,
            query,
            {signal: this._dataAbortController.signal}
        );

        if (response.status === 200 && response.data) {
            this._data = response.data.map((dp: ValueDatapoint<any>) => ({
                x: dp.x!,
                y: dp.y !== null && dp.y !== undefined ? dp.y : null
            }));
            console.log("Data queried:", this._data);
            // Initialize chart if not already done
            if (!this._chart && this._chartElem) {
                this._initializeChart();
            } else {
                this._updateChart();
            }
        }
    }

    protected _getIntervalString(): string {
        // Convert refresh interval to appropriate database interval
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

            // Get units from asset attribute
            let units: string | undefined;
            if (this._asset && this._asset.attributes) {
                const attr = this._asset.attributes[this.attributeName];
                if (attr) {
                    const attributeDescriptor = AssetModelUtil.getAttributeDescriptor(attr.name!, this._asset.type!);
                    units = Util.resolveUnits(Util.getAttributeUnits(attr, attributeDescriptor, this._asset.type));
                }
            }

            // Update the current value sub-component
            if (this._currentValueElem) {
                this._currentValueElem.value = currentValue.value;
                this._currentValueElem.unit = units;
            } else {
                // If sub-component isn't ready yet, wait for next update cycle
                this.updateComplete.then(() => {
                    if (this._currentValueElem) {
                        this._currentValueElem.value = currentValue.value;
                        this._currentValueElem.unit = units;
                    }
                });
            }
        } catch (ex) {
            console.error("Failed to get current value:", ex);
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
        // Combine all attribute types and limit total to 6 (3 per column)
        const allAttributes = [...this.additionalAttributes, ...this.numericAttributes, ...this.stringAttributes];
        if (allAttributes.length === 0) {
            return;
        }

        // Limit to maximum 6 total attributes (3 per column)
        const limitedAttributes = allAttributes.slice(0, 6);
        
        for (const attr of limitedAttributes) {
            try {
                // Load asset information to get units
                const assetResponse = await manager.rest.api.AssetResource.get(attr.assetId);
                const asset = assetResponse.data;
                
                // Get current value
                const currentValue: AttributeEvent = await manager.events!.sendEventWithReply({
                    eventType: "read-asset-attribute",
                    ref: {
                        id: attr.assetId,
                        name: attr.attributeName
                    }
                });

                // Extract units from asset attribute (only for numeric attributes)
                let units: string | undefined;
                if (asset && asset.attributes && this._isNumericAttribute(attr)) {
                    const attribute = asset.attributes[attr.attributeName];
                    if (attribute) {
                        const attributeDescriptor = AssetModelUtil.getAttributeDescriptor(attribute.name!, asset.type!);
                        units = Util.resolveUnits(Util.getAttributeUnits(attribute, attributeDescriptor, asset.type));
                    }
                }

                // Determine status based on attribute type
                let status: StatusLevel;
                if (this._isNumericAttribute(attr)) {
                    status = this._determineStatus(currentValue.value as number, attr.upperThreshold, attr.lowerThreshold);
                } else {
                    status = this._determineStringStatus(currentValue.value as string, attr as StringAdditionalAttribute);
                }

                const key = `${attr.assetId}_${attr.attributeName}`;
                this._additionalAttributeValues.set(key, { 
                    value: currentValue.value, 
                    status,
                    unit: units 
                });

                // Subscribe to this attribute's events
                this._subscribeToAdditionalAttribute(attr);
            } catch (ex) {
                console.error(`Failed to load additional attribute ${attr.assetId}:${attr.attributeName}:`, ex);
            }
        }

        // Update error status but don't trigger re-render
        // The initial render will show the correct state
        this._updateErrorStatus();
        
        // Wait for next update cycle to ensure DOM is ready, then update sub-components
        this.updateComplete.then(() => {
            for (const attr of limitedAttributes) {
                const key = `${attr.assetId}_${attr.attributeName}`;
                const attrData = this._additionalAttributeValues.get(key);
                if (attrData) {
                    this._updateAdditionalAttributeSubComponent(key, attrData.value, attrData.status, attrData.unit);
                }
            }
        });
    }

    protected _subscribeToAdditionalAttribute(attr: AdditionalAttribute) {
        if (!manager.events) return;

        const key = `${attr.assetId}_${attr.attributeName}`;
        const attributeRef: AttributeRef = {
            id: attr.assetId,
            name: attr.attributeName
        };

        // Add to the attributeRefs array for subscription
        const currentRefs = (this as any).attributeRefs || [];
        (this as any).attributeRefs = [...currentRefs, attributeRef];
    }

    protected _unsubscribeFromAdditionalAttributes() {
        // Reset to only the main attribute
        if (this.assetId && this.attributeName) {
            (this as any).attributeRefs = [{
                id: this.assetId,
                name: this.attributeName
            }];
        } else {
            (this as any).attributeRefs = undefined;
        }
        this._additionalAttributeSubscriptions.clear();
    }

    protected _determineStatus(value: number, upperThreshold?: number, lowerThreshold?: number): StatusLevel {
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

    protected _determineStringStatus(value: string, attr: StringAdditionalAttribute): StatusLevel {
        if (attr.errorValues?.includes(value)) {
            return "error";
        }
        if (attr.warningValues?.includes(value)) {
            return "warning";
        }
        if (attr.okValues?.includes(value)) {
            return "ok";
        }
        // Default to ok if value doesn't match any specified values
        return "ok";
    }

    protected _isNumericAttribute(attr: AdditionalAttribute): attr is NumericAdditionalAttribute {
        return 'upperThreshold' in attr || 'lowerThreshold' in attr;
    }

    protected _isStringAttribute(attr: AdditionalAttribute): attr is StringAdditionalAttribute {
        return 'okValues' in attr || 'warningValues' in attr || 'errorValues' in attr;
    }

    protected _updateErrorStatus() {
        const hadError = this._hasErrorStatus;
        this._hasErrorStatus = Array.from(this._additionalAttributeValues.values())
            .some(attr => attr.status === "error");
        
        // Update panel class directly - this is safe since panel is a top-level element
        if (hadError !== this._hasErrorStatus && this._panelElem) {
            if (this._hasErrorStatus) {
                this._panelElem.classList.add('error');
            } else {
                this._panelElem.classList.remove('error');
            }
        }
    }

    protected _updateAdditionalAttributeSubComponent(key: string, value: number | string, status: StatusLevel, unit?: string) {
        // Try numeric component first
        const numericComponent = this.shadowRoot?.querySelector(`or-live-chart-additional-attribute[data-key="${key}"]`) as OrLiveChartAdditionalAttribute;
        if (numericComponent && typeof value === 'number') {
            numericComponent.value = value;
            numericComponent.status = status;
            if (unit !== undefined) {
                numericComponent.unit = unit;
            }
            return;
        }
        
        // Try string component
        const stringComponent = this.shadowRoot?.querySelector(`or-live-chart-string-attribute[data-key="${key}"]`) as OrLiveChartStringAttribute;
        if (stringComponent && typeof value === 'string') {
            stringComponent.value = value;
            stringComponent.status = status;
        }
    }

    // This method is called by the subscribe mixin when attribute events are received
    public _onEvent(event: any) {
        if (event.eventType === "attribute") {
            const attributeEvent = event as AttributeEvent;
            
            // Handle main attribute
            if (attributeEvent.ref?.id === this.assetId && attributeEvent.ref?.name === this.attributeName) {
                this._lastEventTime = Date.now();
                this._lastReceivedValue = attributeEvent.value;
                
                // Update the current value sub-component directly
                if (this._currentValueElem) {
                    this._currentValueElem.value = attributeEvent.value;
                    
                    // Ensure unit is set if it wasn't already
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
            
            // Handle additional attributes
            else {
                const key = `${attributeEvent.ref?.id}_${attributeEvent.ref?.name}`;
                const allAttributes = [...this.additionalAttributes, ...this.numericAttributes, ...this.stringAttributes];
                const additionalAttr = allAttributes.find(
                    attr => attr.assetId === attributeEvent.ref?.id && attr.attributeName === attributeEvent.ref?.name
                );
                
                if (additionalAttr) {
                    // Determine status based on attribute type
                    let status: StatusLevel;
                    if (this._isNumericAttribute(additionalAttr)) {
                        status = this._determineStatus(
                            attributeEvent.value as number,
                            additionalAttr.upperThreshold,
                            additionalAttr.lowerThreshold
                        );
                    } else {
                        status = this._determineStringStatus(
                            attributeEvent.value as string, 
                            additionalAttr as StringAdditionalAttribute
                        );
                    }
                    
                    // Get existing unit (preserve it from initial load)
                    const existingData = this._additionalAttributeValues.get(key);
                    const unit = existingData?.unit;
                    
                    this._additionalAttributeValues.set(key, {
                        value: attributeEvent.value,
                        status,
                        unit
                    });
                    
                    // Update sub-component directly without triggering re-render
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

            // If no events received within interval, use the same value as previous one
            if (!this._lastEventTime || (now - this._lastEventTime) > this._refreshIntervalMs) {
                valueToAdd = this._lastReceivedValue;
            }

            // Add new data point
            if (valueToAdd !== undefined && valueToAdd !== null) {
                const newDataPoint: LiveChartDataPoint = {
                    x: now,
                    y: valueToAdd
                };

                // Remove old data points outside timeframe window
                const cutoffTime = now - this._timeframeMs;
                this._data = [...this._data.filter(dp => dp.x >= cutoffTime), newDataPoint];

                // Update chart
                this._updateChart();
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
        if (!this._chartElem) return;

        this._chart = echarts.init(this._chartElem);

        const chartOptions: ECChartOption = {
            animation: true,
            //backgroundColor: this._style.getPropertyValue("--internal-or-live-chart-background-color"),
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

        // Handle resize
        this._setupResizeHandler();
        // eventlisteners
        this._toggleChartEventListeners(true);
    }

    protected _updateChart() {
        if (!this._chart || this._data.length === 0) return;

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
                symbol: "none",
                lineStyle: {
                    color: this._style.getPropertyValue("--internal-or-live-chart-graph-line-color"),
                    width: 2
                },
                sampling: "lttb"
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
            
            // Add ResizeObserver to watch for container size changes
            this._containerResizeObserver = new ResizeObserver(() => {
                if (this._chart) {
                    this._chart.resize();
                }
            });
            
            // Observe the chart container element
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

        this._data = [];
        this._lastReceivedValue = undefined;
        this._lastEventTime = undefined;
        this._isLive = false;
        
        // Clear the current value sub-component
        if (this._currentValueElem) {
            this._currentValueElem.value = undefined;
            this._currentValueElem.unit = undefined;
        }
        
        // Clear additional attribute values
        this._additionalAttributeValues.clear();
        this._hasErrorStatus = false;
    }

    protected _onTimeframeChanged(event: OrInputChangedEvent) {
        this.timeframe = event.detail.value as TimeframeOption;
    }

    protected _onRefreshIntervalChanged(event: OrInputChangedEvent) {
        this.refreshInterval = event.detail.value as RefreshIntervalOption;
    }

    render() {
        console.log('or-live-chart render called', {
            assetId: this.assetId,
            attributeName: this.attributeName,
            loading: this._loading,
            error: this._error,
            data: this._data?.length
        });

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
                <div class="panel-content">
                    <div class="chart-container">
                        <div id="chart"></div>
                    </div>
                    
                    <or-live-chart-current-value 
                        .asset="${this._asset}"
                    ></or-live-chart-current-value>
                </div>
                <div class="controls-wrapper">
                    <div class="control-group status-indicator">
                        <div class="status-dot ${this._isLive ? 'live' : this._loading ? 'loading' : this._error ? 'error' : ''}"></div>
                        <span>${this._isLive ? 'Live' : this._loading ? 'Loading' : this._error ? 'Error' : 'Disconnected'}</span>
                    </div>
                    ${this._renderStringAttributes()}
                    ${this._renderNumericAttributes()}
                </div>
            </div>
        `;
    }

    protected _renderStringAttributes() {
        const allAttributes = [...this.additionalAttributes, ...this.numericAttributes, ...this.stringAttributes];
        const stringAttributes = allAttributes.filter(attr => this._isStringAttribute(attr)).slice(0, 3);
        
        if (stringAttributes.length === 0) {
            return html``;
        }
        
        return html`
            <div class="string-attributes">
                ${stringAttributes.map(attr => {
                    const key = `${attr.assetId}_${attr.attributeName}`;
                    const attrData = this._additionalAttributeValues.get(key);
                    
                    return html`
                        <or-live-chart-string-attribute 
                            data-key="${key}"
                            .icon="${attr.icon}"
                            .value="${attrData?.value as string}"
                            .status="${attrData?.status || 'ok'}">
                        </or-live-chart-string-attribute>
                    `;
                })}
            </div>
        `;
    }

    protected _renderNumericAttributes() {
        const allAttributes = [...this.additionalAttributes, ...this.numericAttributes, ...this.stringAttributes];
        const numericAttributes = allAttributes.filter(attr => this._isNumericAttribute(attr)).slice(0, 3);
        
        if (numericAttributes.length === 0) {
            return html``;
        }
        
        return html`
            <div class="numeric-attributes">
                ${numericAttributes.map(attr => {
                    const key = `${attr.assetId}_${attr.attributeName}`;
                    const attrData = this._additionalAttributeValues.get(key);
                    
                    return html`
                        <or-live-chart-additional-attribute 
                            data-key="${key}"
                            .icon="${attr.icon}"
                            .value="${attrData?.value as number}"
                            .status="${attrData?.status || 'ok'}"
                            .unit="${attrData?.unit}">
                        </or-live-chart-additional-attribute>
                    `;
                })}
            </div>
        `;
    }

    protected _toggleChartEventListeners(connect: boolean){
        if (connect) {
            this._mouseEnterHandler = this._chartElem.addEventListener('mouseenter', () => {
                this._chart!.setOption({
                    yAxis: {show: true}
                });
            });

            this._mouseLeaveHandler = this._chartElem.addEventListener('mouseleave', () => {
                this._chart!.setOption({
                    yAxis: { show: false}
                });
            });
        }
        else if (!connect) {
            this._chartElem?.removeEventListener('mouseenter', this._mouseEnterHandler);
            this._chartElem?.removeEventListener('mouseleave', this._mouseLeaveHandler);

        }
    }
}


// Ensure component is available for import
//declare global {
//    interface HTMLElementTagNameMap {
//        "or-live-chart": OrLiveChart;
//    }
//}
