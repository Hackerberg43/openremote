import {css, html, LitElement, PropertyValues, TemplateResult, unsafeCSS} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {DefaultColor2, DefaultColor3, DefaultColor4} from "@openremote/core";
export interface VdlAppTooltipShowEventDetail {
    content: TemplateResult | string;
    x: number;
    y: number;
}

export class VdlAppTooltipShowEvent extends CustomEvent<VdlAppTooltipShowEventDetail> {
    public static readonly NAME = "vdl-app-tooltip-show";

    constructor(detail: VdlAppTooltipShowEventDetail) {
        super(VdlAppTooltipShowEvent.NAME, {
            detail,
            bubbles: true,
            composed: true
        });
    }
}

export class VdlAppTooltipHideEvent extends CustomEvent<void> {
    public static readonly NAME = "vdl-app-tooltip-hide";

    constructor() {
        super(VdlAppTooltipHideEvent.NAME, {
            bubbles: true,
            composed: true
        });
    }
}

declare global {
    export interface HTMLElementEventMap {
        [VdlAppTooltipShowEvent.NAME]: VdlAppTooltipShowEvent;
        [VdlAppTooltipHideEvent.NAME]: VdlAppTooltipHideEvent;
    }
}

export function showTooltip(content: TemplateResult | string, x: number, y: number, hostElement?: HTMLElement): VdlAppTooltip {
    if (!hostElement) {
        hostElement = VdlAppTooltip.TooltipHostElement || document.body;
    }

    // Hide any existing tooltips first
    hideTooltip();

    const tooltip = new VdlAppTooltip();
    tooltip.content = content;
    tooltip.x = x;
    tooltip.y = y;
    tooltip.isVisible = true;

    tooltip.addEventListener(VdlAppTooltipHideEvent.NAME, (ev: VdlAppTooltipHideEvent) => {
        ev.stopPropagation();
        if (tooltip.parentElement) {
            tooltip.parentElement.removeChild(tooltip);
        }
    });

    hostElement.append(tooltip);
    return tooltip;
}

export function hideTooltip() {
    const existingTooltips = document.querySelectorAll('vdl-app-tooltip');
    existingTooltips.forEach(tooltip => {
        if (tooltip.parentElement) {
            tooltip.parentElement.removeChild(tooltip);
        }
    });
}

@customElement("vdl-app-tooltip")
export class VdlAppTooltip extends LitElement {

    /**
     * Can be set by apps to control where in the DOM tooltips are added
     */
    public static TooltipHostElement: HTMLElement;

    static get styles() {
        return css`
            :host {
                --internal-vdl-app-tooltip-background-color: var(--or-live-chart-background-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
                --internal-vdl-app-tooltip-border-color: var(--or-live-chart-border-color, rgba(76, 76, 76, 0.6));
                --internal-vdl-app-tooltip-text-color: var(--or-live-chart-text-color, var(--or-app-color3, ${unsafeCSS(DefaultColor3)}));
                
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                visibility: hidden;
                transition: opacity 1s ease-in-out, visibility 1s ease-in-out;
            }

            :host([visible]) {
                opacity: 1;
                visibility: visible;
            }

            .tooltip-container {
                background: var(--internal-vdl-app-tooltip-background-color);
                color: var(--internal-vdl-app-tooltip-text-color);
                padding: 12px;
                border-radius: 6px;
                font-size: 14px;
                max-width: 300px;
                word-wrap: break-word;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                border: 1px solid  var(--internal-vdl-app-tooltip-border-color);
                backdrop-filter: blur(8px);
            }

            .tooltip-content {
                line-height: 1.4;
            }
        `;
    }

    @property({type: Object, attribute: false})
    public content: TemplateResult | string = "";

    @property({type: Number})
    public x: number = 0;

    @property({type: Number})
    public y: number = 0;


    @property({type: String, reflect: true})
    public position: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

    @state()
    private _visible: boolean = false;

    private _hideTimer?: ReturnType<typeof setTimeout>;

    public get isVisible(): boolean {
        return this._visible;
    }

    public set isVisible(visible: boolean) {
        this._visible = visible;
        this.toggleAttribute('visible', visible);
        
        if (visible) {
            this.show();
        } else {
            this.hide();
        }
    }

    public show() {
        this._visible = true;
        this.toggleAttribute('visible', true);
        
        // Position the tooltip
        this.updateComplete.then(() => {
            this._positionTooltip();
        });

        // Set auto-hide timer for 10 seconds
        this._hideTimer = setTimeout(() => {
            this.hide();
        }, 10000);
    }

    public hide() {
        this._visible = false;
        this.toggleAttribute('visible', false);
        
        if (this._hideTimer) {
            clearTimeout(this._hideTimer);
            this._hideTimer = undefined;
        }

        // Dispatch hide event after animation
        setTimeout(() => {
            this.dispatchEvent(new VdlAppTooltipHideEvent());
        }, 200);
    }

    protected updated(changedProperties: PropertyValues) {
        super.updated(changedProperties);
        
        if ((changedProperties.has('x') || changedProperties.has('y')) && this._visible) {
            this._positionTooltip();
        }
    }

    private _positionTooltip() {
        const container = this.shadowRoot?.querySelector('.tooltip-container') as HTMLElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let finalX = this.x;
        let finalY = this.y;
        let position: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

        // Determine best position based on available space
        const spaceBelow = windowHeight - this.y;
        const spaceAbove = this.y;
        const spaceRight = windowWidth - this.x;
        const spaceLeft = this.x;

        // Choose position based on available space
        if (spaceBelow >= containerRect.height + 20) {
            position = 'bottom';
            finalY = this.y + 10;
        } else if (spaceAbove >= containerRect.height + 20) {
            position = 'top';
            finalY = this.y - containerRect.height - 10;
        } else if (spaceRight >= containerRect.width + 20) {
            position = 'right';
            finalX = this.x + 10;
        } else if (spaceLeft >= containerRect.width + 20) {
            position = 'left';
            finalX = this.x - containerRect.width - 10;
        } else {
            // Fallback to bottom with adjustments
            position = 'bottom';
            finalY = this.y + 10;
        }

        // Adjust horizontal position to stay within bounds
        if (position === 'bottom' || position === 'top') {
            finalX = Math.max(10, Math.min(windowWidth - containerRect.width - 10, this.x - containerRect.width / 2));
        }

        // Adjust vertical position to stay within bounds
        if (position === 'left' || position === 'right') {
            finalY = Math.max(10, Math.min(windowHeight - containerRect.height - 10, this.y - containerRect.height / 2));
        }

        // Apply position
        this.style.left = `${finalX}px`;
        this.style.top = `${finalY}px`;
        this.position = position;
    }

    protected render() {
        return html`
            <div class="tooltip-container">
                <div class="tooltip-content">
                    ${typeof this.content === 'string' ? this.content : this.content}
                </div>
            </div>
        `;
    }
}
