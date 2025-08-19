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
import * as echarts from "echarts/core";
import {LineChart, LineSeriesOption} from "echarts/charts";
import {GridComponent, TooltipComponent, GridComponentOption, TooltipComponentOption} from "echarts/components";
import {CanvasRenderer} from "echarts/renderers";
import moment from "moment";
import {getAssetDescriptorIconTemplate} from "@openremote/or-icon";
import {when} from "lit/directives/when.js";
import {InputType, OrInputChangedEvent} from "@openremote/or-mwc-components/or-mwc-input";
import "@openremote/or-mwc-components/or-mwc-input";
import {getContentWithMenuTemplate} from "@openremote/or-mwc-components/or-mwc-menu";

echarts.use([GridComponent, TooltipComponent, LineChart, CanvasRenderer]);

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
        background: var(--internal-or-live-chart-background-color);
        border: 1px solid var(--internal-or-live-chart-border-color);
        border-radius: 5px;
    }
    
    .panel-title {
        display: flex;
        align-items: center;
        font-weight: bolder;
        line-height: 1em;
        color: var(--internal-or-live-chart-text-color);
        flex: 0 0 auto;
        padding: 10px 15px;
        border-bottom: 1px solid var(--internal-or-live-chart-border-color);
    }
    
    .panel-title-text {
        flex: 1;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
    }
    
    .panel-content {
        display: flex;
        flex-direction: row;
        width: 100%;
        flex: 1;
        overflow: hidden;
    }
    
    .current-value-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px;
        flex: 0 0 auto;
    }
    
    .current-value-icon {
        font-size: 24px;
        margin-right: 10px;
        display: flex;
    }
    
    .current-value-number {
        color: var(--internal-or-live-chart-text-color);
        font-size: 32px;
        font-weight: bold;
    }
    
    .current-value-unit {
        color: var(--internal-or-live-chart-text-color);
        font-size: 24px;
        font-weight: 200;
        margin-left: 5px;
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
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        flex: 0 0 auto;
        border-top: 1px solid var(--internal-or-live-chart-border-color);
        gap: 10px;
    }
    
    .control-group {
        display: flex;
        align-items: center;
        gap: 10px;
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
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
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

    @state()
    protected _loading = false;

    protected _data: LiveChartDataPoint[] = [];

    @state()
    protected _currentValue?: number;

    @state()
    protected _currentUnit?: string;

    @state()
    protected _error?: string;

    @state()
    protected _asset?: Asset;

    protected _lastEventTime?: number;

    @state()
    protected _isLive = false;

    @query("#chart")
    protected _chartElem!: HTMLDivElement;

    protected _chart?: echarts.ECharts;
    protected _style!: CSSStyleDeclaration;
    protected _attributeEventSubscriptionId?: string;
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

    shouldUpdate(changedProperties: PropertyValues): boolean {
        // Allow current value updates to render, but prevent other frequent updates
        if (changedProperties.size === 1) {
            const singleChange = Array.from(changedProperties.keys())[0] as string;
            if (singleChange === '_currentValue') {
                return true; // Allow current value updates
            }
            if (singleChange === '_data' || singleChange === '_lastEventTime') {
                return false; // Block data/timing only updates
            }
        }
        
        return true; // Allow all other updates (loading, error, config changes, etc.)
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
                          changedProperties.has("refreshInterval");

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

            this._currentValue = currentValue.value;
            this._lastReceivedValue = currentValue.value;

            // Get units from asset attribute
            if (this._asset && this._asset.attributes) {
                const attr = this._asset.attributes[this.attributeName];
                if (attr) {
                    const attributeDescriptor = AssetModelUtil.getAttributeDescriptor(attr.name!, this._asset.type!);
                    const units = Util.resolveUnits(Util.getAttributeUnits(attr, attributeDescriptor, this._asset.type));
                    this._currentUnit = units;
                }
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

    // This method is called by the subscribe mixin when attribute events are received
    public _onEvent(event: any) {
        if (event.eventType === "attribute") {
            const attributeEvent = event as AttributeEvent;
            if (attributeEvent.ref?.id === this.assetId && attributeEvent.ref?.name === this.attributeName) {
                this._lastEventTime = Date.now();
                this._lastReceivedValue = attributeEvent.value;
                this._currentValue = attributeEvent.value;
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
            animation: false,
            backgroundColor: this._style.getPropertyValue("--internal-or-live-chart-background-color"),
            grid: {
                show: false,
                left: 10,
                right: 10,
                top: 10,
                bottom: 10,
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
                        const unit = this._currentUnit || "";
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
        this._currentValue = undefined;
        this._lastReceivedValue = undefined;
        this._lastEventTime = undefined;
        this._isLive = false;
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
            <div class="panel">
                <div class="panel-content">
                    <div class="chart-container">
                        <div id="chart"></div>
                    </div>
                    
                    ${when(this._currentValue !== undefined, () => html`
                        <div class="current-value-wrapper">
                            ${this._asset ? html`
                                <span class="current-value-icon">
                                    ${getAssetDescriptorIconTemplate(AssetModelUtil.getAssetDescriptor(this._asset!.type!))}
                                </span>
                            ` : ''}
                            <span class="current-value-number">${this._currentValue}</span>
                            ${this._currentUnit ? html`
                                <span class="current-value-unit">${this._currentUnit}</span>
                            ` : ''}
                        </div>
                    `)}
                </div>
                <div class="controls-wrapper">
                    <div class="control-group">
                        <!-- Timeframe Selection -->
                        ${getContentWithMenuTemplate(
                                html`<or-mwc-input .type="${InputType.BUTTON}" 
                                                   label="${this.timeframe === '5minutes' ? '5 min' : this.timeframe === '30minutes' ? '30 min' : '1 hour'}"
                                                   ?disabled="${this.disabled}"></or-mwc-input>`,
                                [
                                    {value: "5minutes", text: "5 minutes"},
                                    {value: "30minutes", text: "30 minutes"},
                                    {value: "1hour", text: "1 hour"}
                                ],
                                this.timeframe,
                                (value: string | string[]) => {
                                    this.timeframe = value as TimeframeOption;
                                }
                        )}

                        <!-- Refresh Interval Selection -->
                        ${getContentWithMenuTemplate(
                                html`<or-mwc-input .type="${InputType.BUTTON}" 
                                                   label="${this.refreshInterval === '1second' ? '1 sec' : '1 min'}"
                                                   ?disabled="${this.disabled}"></or-mwc-input>`,
                                [
                                    {value: "1second", text: "1 second"},
                                    {value: "1minute", text: "1 minute"}
                                ],
                                this.refreshInterval,
                                (value: string | string[]) => {
                                    this.refreshInterval = value as RefreshIntervalOption;
                                }
                        )}
                    </div>

                    <div class="control-group">
                        <div class="status-indicator">
                            <div class="status-dot ${this._isLive ? 'live' : this._loading ? 'loading' : this._error ? 'error' : ''}"></div>
                            <span>${this._isLive ? 'Live' : this._loading ? 'Loading' : this._error ? 'Error' : 'Disconnected'}</span>
                        </div>
                    </div>
                </div>
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
