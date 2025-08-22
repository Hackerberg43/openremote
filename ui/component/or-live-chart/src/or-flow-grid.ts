import {css, html, svg, LitElement, PropertyValues, unsafeCSS} from "lit";
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

export interface FlowLineValues {
    storage?: number;
    grid?: number;
    producers?: number;
    consumers?: number;
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
        z-index: 10;
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
        background: linear-gradient(135deg, #2196F3 0%, #035dbc 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 12px rgba(33, 150, 243, 0.3);
        z-index: 10;
        animation: heartbeat 5s ease-in-out infinite;
    }

    @keyframes heartbeat {
        0%, 90%, 100% {
            transform: translate(-50%, -50%) scale(1);
            box-shadow: 0 0 12px rgba(33, 150, 243, 0.3);
        }
        20% {
            transform: translate(-50%, -50%) scale(1.05);
            box-shadow: 0 0 20px rgba(33, 150, 243, 0.5);
        }
        50% {
            transform: translate(-50%, -50%) scale(1);
            box-shadow: 0 0 12px rgba(33, 150, 243, 0.3);
        }
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
        stroke: rgba(128, 128, 128, 0.5);
        stroke-width: 5;
        opacity: 0.7;
        fill: none;
    }

    /* Flow particles */
    .flow-particle {
        opacity: 0.2;
    }

    .flow-particle.positive {
        fill: #2196F3;
    }

    .flow-particle.negative {
        fill: #f44336;
    }

    @keyframes flowForward {
        0% {
            offset-distance: 0%;
            opacity: 0;
        }
        10% {
            opacity: 0.8;
        }
        90% {
            opacity: 0.8;
        }
        100% {
            offset-distance: 100%;
            opacity: 0;
        }
    }

    @keyframes flowReverse {
        0% {
            offset-distance: 100%;
            opacity: 0;
        }
        10% {
            opacity: 0.8;
        }
        90% {
            opacity: 0.8;
        }
        100% {
            offset-distance: 0%;
            opacity: 0;
        }
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

    @property({type: Object})
    public flowValues: FlowLineValues = {
        storage: 30,
        grid: -25,
        producers: 40,
        consumers: -35
    };

    @property({type: Number})
    public maxFlowValue: number = 100;

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

        // Store container dimensions for viewBox
        positions.set('containerDimensions', { 
            x: containerRect.width, 
            y: containerRect.height 
        });

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

    protected _getFlowAnimation(pathLength: number = 200, flowValue: number = 0) {
        const flowPercent = Math.abs(flowValue) / this.maxFlowValue;
        const duration = 5;//Math.max(4, 7 - (flowPercent * 0.3)); // Faster flow = shorter duration
        const direction = flowValue >= 0 ? 'flowForward' : 'flowReverse';
        
        // Calculate particle count based on path length to maintain consistent spacing
        const particleSpacing = 60; // pixels between particles
        const particleCount = Math.max(2, Math.floor((pathLength / particleSpacing) * flowPercent * 3));
        
        return { duration, direction, particleCount, flowPercent, flowValue };
    }

    protected _calculatePathLength(pathType: string): number {
        const storagePos = this._nodePositions.get('storage');
        const centralPos = this._nodePositions.get('central');
        const gridPos = this._nodePositions.get('grid');
        const producerPos = this._nodePositions.get('producers');
        const consumerPos = this._nodePositions.get('consumers');

        if (!centralPos) return 200; // default fallback

        switch (pathType) {
            case 'storage-path':
                if (!storagePos) return 200;
                return Math.sqrt(Math.pow(centralPos.x - storagePos.x, 2) + Math.pow(centralPos.y - storagePos.y, 2));
            
            case 'grid-path':
                if (!gridPos) return 200;
                return Math.sqrt(Math.pow(gridPos.x - centralPos.x, 2) + Math.pow(gridPos.y - centralPos.y, 2));
            
            case 'producer-path':
                if (!producerPos) return 200;
                // Approximate length for the curved path (horizontal + diagonal segments)
                const prodHorizontal = Math.abs(0.5 * (centralPos.x - producerPos.x));
                const prodDiagonal = Math.sqrt(Math.pow(0.5 * (centralPos.x - producerPos.x), 2) + Math.pow(centralPos.y - producerPos.y, 2));
                return prodHorizontal + prodDiagonal;
            
            case 'consumer-path':
                if (!consumerPos) return 200;
                // Approximate length for the curved path (horizontal + diagonal segments)
                const consHorizontal = Math.abs(0.5 * (centralPos.x - consumerPos.x));
                const consDiagonal = Math.sqrt(Math.pow(0.5 * (centralPos.x - consumerPos.x), 2) + Math.pow(centralPos.y - consumerPos.y, 2));
                return consHorizontal + consDiagonal;
            
            default:
                return 200;
        }
    }

    protected _getLineFlowValue(pathId: string): number {
        switch (pathId) {
            case 'storage-path':
                return this.flowValues.storage || 0;
            case 'grid-path':
                return this.flowValues.grid || 0;
            case 'producer-path':
                return this.flowValues.producers || 0;
            case 'consumer-path':
                return this.flowValues.consumers || 0;
            default:
                return 0;
        }
    }

    protected _renderFlowParticles(pathId: string) {
        const pathLength = this._calculatePathLength(pathId);
        const lineFlowValue = this._getLineFlowValue(pathId);
        const { duration, direction, particleCount, flowPercent, flowValue } = this._getFlowAnimation(pathLength, lineFlowValue);
        
        if (flowPercent === 0) return html``;

        const particles = [];
        for (let i = 0; i < particleCount; i++) {
            const delay = (i / particleCount) * duration;
            const isReverse = flowValue < 0;
            
            particles.push(svg`
                <circle class="flow-particle positive" r="2">
                    <animateMotion dur="${duration}s" 
                                   begin="${delay}s"
                                   repeatCount="indefinite"
                                   rotate="auto"
                                   keyTimes="0;0.1;0.9;1"
                                   keyPoints="${isReverse ? '1;1;0;0' : '0;0;1;1'}"
                                   calcMode="linear">
                        <mpath href="#${pathId}"/>
                    </animateMotion>
                    <animate attributeName="opacity"
                             dur="${duration}s"
                             begin="${delay}s"
                             repeatCount="indefinite"
                             values="0;0.8;0.8;0"
                             keyTimes="0;0.1;0.9;1"/>
                </circle>
            `);
        }
        
        return svg`${particles}`;
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
        const producerPos = this._nodePositions.get('producers');
        const consumerPos = this._nodePositions.get('consumers');
        const containerDims = this._nodePositions.get('containerDimensions');

        // Debug logging
        console.log('Node positions:', {
            storage: storagePos,
            central: centralPos,
            grid: gridPos,
            containerDims,
            mapSize: this._nodePositions.size
        });

        return html`
            <div class="flow-grid-container">
                ${this._renderChart('producers', 'Producers')}
                ${this._renderChart('storage', 'Storage')}
                ${this._renderChart('consumers', 'Consumers')}
                ${this._renderChart('grid', 'Grid')}
                <!-- Central node -->
                <div class="central-node">
                    <svg width="50" height="70" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 64%; left: 55%; transform: translate(-50%, -50%);">
                        <!-- Shadow/outline path -->
                        <path fill="none" stroke="rgba(0, 0, 0, 0.2)" stroke-width="10" d="
                                M 25 20
                                L 55 20
                                C 65 20 70 25 70 35
                                C 70 45 65 50 55 50
                                L 40 50
                                L 40 80
                                L 25 70
                                L 25 55
                                L 25 35
                                L 50 35
                                C 52 35 53 34 53 32
                                C 53 30 52 29 50 29
                                L 25 29
                                Z
                        "/>
                        <!-- Main logo path -->
                        <path fill="white" d="
                                M 25 20
                                L 55 20
                                C 65 20 70 25 70 35
                                C 70 45 65 50 55 50
                                L 40 50
                                L 40 80
                                L 25 70
                                L 25 55
                                L 25 35
                                L 50 35
                                C 52 35 53 34 53 32
                                C 53 30 52 29 50 29
                                L 25 29
                                Z
                        "/>
                    </svg>
                </div>
                <div>
                    <!-- Connection lines -->
                    <svg class="connection-lines">
                        <defs>
                            <!-- Define paths for animation -->
                            ${storagePos && centralPos ? svg`
                                <path id="storage-path" 
                                      d="M ${storagePos.x || 0} ${storagePos.y || 0} 
                                         L ${centralPos.x || 0} ${centralPos.y || 0}">
                                </path>
                            ` : ''}
                            ${centralPos && gridPos ? svg`
                                <path id="grid-path" 
                                      d="M ${centralPos.x || 0} ${centralPos.y || 0} 
                                         L ${gridPos.x || 0} ${gridPos.y || 0}">
                                </path>
                            ` : ''}
                            ${centralPos && producerPos ? svg`
                                <path id="producer-path" 
                                      d="M ${producerPos.x || 0} ${producerPos.y || 0} 
                                         L ${(producerPos.x + 0.5 * (centralPos.x - producerPos.x) - 10) || 0} ${producerPos.y || 0}
                                         Q ${(producerPos.x + 0.5 * (centralPos.x - producerPos.x)) || 0} ${producerPos.y || 0} 
                                           ${(producerPos.x + 0.5 * (centralPos.x - producerPos.x) + 10) || 0} ${(producerPos.y + 10 * Math.sign((centralPos.y || 0) - (producerPos.y || 0))) || 0}
                                         L ${centralPos.x || 0} ${centralPos.y || 0}">
                                </path>
                            ` : ''}
                            ${centralPos && consumerPos ? svg`
                                <path id="consumer-path" 
                                      d="M ${consumerPos.x || 0} ${consumerPos.y || 0} 
                                         L ${(consumerPos.x + 0.5 * (centralPos.x - consumerPos.x) - 10) || 0} ${consumerPos.y || 0}
                                         Q ${(consumerPos.x + 0.5 * (centralPos.x - consumerPos.x)) || 0} ${consumerPos.y || 0} 
                                           ${(consumerPos.x + 0.5 * (centralPos.x - consumerPos.x) + 10) || 0} ${(consumerPos.y + 10 * Math.sign((centralPos.y || 0) - (consumerPos.y || 0))) || 0}
                                         L ${centralPos.x || 0} ${centralPos.y || 0}">
                                </path>
                            ` : ''}
                        </defs>

                        <!-- Storage line -->
                        ${storagePos && centralPos ? svg`
                            <path class="connection-line" 
                                  d="M ${storagePos.x || 0} ${storagePos.y || 0} 
                                     L ${centralPos.x || 0} ${centralPos.y || 0}"
                                  >
                            </path>
                        ` : svg`<!-- No storage/central positions yet -->`}
                        
                        <!-- Grid line -->
                        ${centralPos && gridPos ? svg`
                            <path class="connection-line" 
                                  d="M ${centralPos.x || 0} ${centralPos.y || 0} 
                                     L ${gridPos.x || 0} ${gridPos.y || 0}"
                                  >
                            </path>
                        ` : svg`<!-- No central/grid positions yet -->`}
                       
                        <!-- Producer lines -->
                        ${centralPos && producerPos ? svg`
                            <path class="connection-line" 
                                  d="M ${producerPos.x || 0} ${producerPos.y || 0} 
                                     L ${(producerPos.x + 0.5 * (centralPos.x - producerPos.x) - 10) || 0} ${producerPos.y || 0}
                                     Q ${(producerPos.x + 0.5 * (centralPos.x - producerPos.x)) || 0} ${producerPos.y || 0} 
                                       ${(producerPos.x + 0.5 * (centralPos.x - producerPos.x) + 10) || 0} ${(producerPos.y + 10 * Math.sign((centralPos.y || 0) - (producerPos.y || 0))) || 0}
                                     L ${centralPos.x || 0} ${centralPos.y || 0}"
                                  >
                            </path>
                        ` : svg`<!-- No central/producer positions yet -->`}

                        <!-- Consumer lines -->
                        ${centralPos && consumerPos ? svg`
                            <path class="connection-line" 
                                  d="M ${consumerPos.x || 0} ${consumerPos.y || 0} 
                                     L ${(consumerPos.x + 0.5 * (centralPos.x - consumerPos.x) - 10) || 0} ${consumerPos.y || 0}
                                     Q ${(consumerPos.x + 0.5 * (centralPos.x - consumerPos.x)) || 0} ${consumerPos.y || 0} 
                                       ${(consumerPos.x + 0.5 * (centralPos.x - consumerPos.x) + 10) || 0} ${(consumerPos.y + 10 * Math.sign((centralPos.y || 0) - (consumerPos.y || 0))) || 0}
                                     L ${centralPos.x || 0} ${centralPos.y || 0}"
                                  >
                            </path>
                        ` : svg`<!-- No central/consumer positions yet -->`}

                        <!-- Animated flow particles -->
                        ${storagePos && centralPos ? this._renderFlowParticles('storage-path') : ''}
                        ${centralPos && gridPos ? this._renderFlowParticles('grid-path') : ''}
                        ${centralPos && producerPos ? this._renderFlowParticles('producer-path') : ''}
                        ${centralPos && consumerPos ? this._renderFlowParticles('consumer-path') : ''}
                    </svg>
                </div>
                
                
                
            </div>
        `;
    }
}
