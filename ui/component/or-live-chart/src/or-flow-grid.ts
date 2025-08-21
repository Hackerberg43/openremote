import {css, html, LitElement, PropertyValues, unsafeCSS} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {translate} from "@openremote/or-translate";
import i18next from "i18next";
import {DefaultColor2, DefaultColor3} from "@openremote/core";
import "@openremote/or-icon";
import "./index"; // Import or-live-chart

export interface FlowGridChart {
    position: 'producers' | 'storage' | 'consumers' | 'grid';
    assetId: string;
    attributeName: string;
    timeframe?: "5minutes" | "30minutes" | "1hour";
    refreshInterval?: "1second" | "1minute";
    operatingStatus?: "running" | "dischargingOnly";
    linkUrl?: string;
    statusMessage?: string;
    additionalAttributes?: any[];
}

// language=CSS
const style = css`
    :host {
        --internal-or-flow-grid-background-color: var(--or-flow-grid-background-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
        --internal-or-flow-grid-text-color: var(--or-flow-grid-text-color, var(--or-app-color3, ${unsafeCSS(DefaultColor3)}));
        
        width: 100%;
        height: 100%;
        display: block;
        position: relative;
    }

    :host([hidden]) {
        display: none;
    }

    .flow-grid-container {
        position: relative;
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: 300px 1fr 300px;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 40px;
        padding: 40px;
        background: var(--internal-or-flow-grid-background-color);
        align-items: center;
    }

    .chart-position {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 250px;
        height: 180px;
    }

    .chart-position or-live-chart {
        width: 100%;
        height: 100%;
    }

    /* Position chart containers */
    .producers {
        grid-column: 1;
        grid-row: 1;
        justify-self: end;
        align-self: end;
    }

    .storage {
        grid-column: 1;
        grid-row: 2;
        justify-self: end;
        align-self: center;
    }

    .consumers {
        grid-column: 1;
        grid-row: 3;
        justify-self: end;
        align-self: start;
    }

    .grid {
        grid-column: 3;
        grid-row: 2;
        justify-self: start;
        align-self: center;
    }

    /* Central node */
    .central-node {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        z-index: 10;
    }

    .central-node or-icon {
        --or-icon-fill: white;
        --or-icon-width: 40px;
        --or-icon-height: 40px;
    }

    /* Connection lines */
    .connection-lines {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
    }

    .connection-line {
        stroke: #2196F3;
        stroke-width: 2;
        opacity: 0.7;
    }

    /* Labels */
    .chart-label {
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 14px;
        font-weight: 500;
        color: var(--internal-or-flow-grid-text-color);
        white-space: nowrap;
    }
`;

@customElement("or-flow-grid")
export class OrFlowGrid extends translate(i18next)(LitElement) {

    static get styles() {
        return [style];
    }

    @property({type: Array})
    public charts: FlowGridChart[] = [];

    @property({type: Boolean})
    public disabled = false;

    @state()
    private _nodePositions: Map<string, {x: number, y: number}> = new Map();

    protected _calculateNodeCenters() {
        const container = this.shadowRoot?.querySelector('.flow-grid-container') as HTMLElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const positions = new Map<string, {x: number, y: number}>();

        // Get positions for each chart node
        const chartPositions = ['producers', 'storage', 'consumers', 'grid'] as const;
        
        chartPositions.forEach(position => {
            const chartElement = container.querySelector(`.chart-position.${position}`) as HTMLElement;
            if (chartElement) {
                const rect = chartElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2 - containerRect.left;
                const centerY = rect.top + rect.height / 2 - containerRect.top;
                positions.set(position, { x: centerX, y: centerY });
            }
        });

        // Get central node position
        const centralNode = container.querySelector('.central-node') as HTMLElement;
        if (centralNode) {
            const rect = centralNode.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2 - containerRect.left;
            const centerY = rect.top + rect.height / 2 - containerRect.top;
            positions.set('central', { x: centerX, y: centerY });
        }

        this._nodePositions = positions;
        this.requestUpdate();
    }

    private _resizeHandler = () => this._calculateNodeCenters();

    protected firstUpdated(changedProperties: PropertyValues) {
        super.firstUpdated(changedProperties);
        // Calculate positions after initial render
        setTimeout(() => this._calculateNodeCenters(), 0);
        
        // Recalculate on window resize
        window.addEventListener('resize', this._resizeHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('resize', this._resizeHandler);
    }

    protected _getChartByPosition(position: FlowGridChart['position']): FlowGridChart | undefined {
        return this.charts.find(chart => chart.position === position);
    }

    protected _renderChart(position: FlowGridChart['position'], label: string) {
        const chart = this._getChartByPosition(position);
        
        if (!chart) {
            return html`
                <div class="chart-position ${position}">
                    <div class="chart-label">${label}</div>
                    <div style="border: 2px dashed #ccc; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #999; border-radius: 20px;">
                        No ${label} Chart
                    </div>
                </div>
            `;
        }

        return html`
            <div class="chart-position ${position}">
                <div class="chart-label">${label}</div>
                <or-live-chart
                    .assetId="${chart.assetId}"
                    .attributeName="${chart.attributeName}"
                    .timeframe="${chart.timeframe || '30minutes'}"
                    .refreshInterval="${chart.refreshInterval || '1minute'}"
                    .operatingStatus="${chart.operatingStatus}"
                    .linkUrl="${chart.linkUrl}"
                    .statusMessage="${chart.statusMessage}"
                    .additionalAttributes="${chart.additionalAttributes || []}">
                </or-live-chart>
            </div>
        `;
    }


    render() {
        const storagePos = this._nodePositions.get('storage');
        const centralPos = this._nodePositions.get('central');
        const gridPos = this._nodePositions.get('grid');

        return html`
            <div class="flow-grid-container">
                ${this._renderChart('producers', 'Producers')}
                ${this._renderChart('storage', 'Storage')}
                ${this._renderChart('consumers', 'Consumers')}
                ${this._renderChart('grid', 'Grid')}
                
                <!-- Connection lines -->
                <svg class="connection-lines">
                    ${storagePos && centralPos ? html`
                        <!-- Line from storage center to central node center -->
                        <line class="connection-line" 
                              x1="${storagePos.x}" y1="${storagePos.y}" 
                              x2="${centralPos.x}" y2="${centralPos.y}">
                        </line>
                    ` : ''}
                    ${centralPos && gridPos ? html`
                        <!-- Line from central node center to grid center -->
                        <line class="connection-line" 
                              x1="${centralPos.x}" y1="${centralPos.y}" 
                              x2="${gridPos.x}" y2="${gridPos.y}">
                        </line>
                    ` : ''}
                </svg>
                
                <!-- Central node -->
                <div class="central-node">
                    <or-icon icon="lightning-bolt"></or-icon>
                </div>
                
            </div>
        `;
    }
}
