/*
 * Copyright 2026, OpenRemote Inc.
 *
 * See the CONTRIBUTORS.txt file in the distribution for a
 * full listing of individual contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
import { css, html, LitElement, PropertyValues, svg, TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { i18next, translate } from "@openremote/or-translate";
import "@openremote/or-mwc-components/or-mwc-input";
import { InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";

export interface ReplayDatapoint {
    timestamp: number;
    value: unknown;
}

type ValueMode = "number" | "boolean" | "unsupported";

export interface OrReplayEditorChangedDetail {
    value: ReplayDatapoint[];
}

export class OrReplayEditorChangedEvent extends CustomEvent<OrReplayEditorChangedDetail> {
    public static readonly NAME = "or-replay-editor-changed";
    constructor(value: ReplayDatapoint[]) {
        super(OrReplayEditorChangedEvent.NAME, {
            detail: { value },
            bubbles: true,
            composed: true,
        });
    }
}

declare global {
    interface HTMLElementEventMap {
        [OrReplayEditorChangedEvent.NAME]: OrReplayEditorChangedEvent;
    }
}

const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;
const MIN_H = 220;

function formatDuration(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "00:00:00";
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(n => String(n).padStart(2, "0")).join(":");
}

function parseDuration(text: string): number | undefined {
    if (!text) return undefined;
    const t = text.trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    const parts = t.split(":").map(p => parseInt(p, 10));
    if (parts.some(n => isNaN(n) || n < 0)) return undefined;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
}

function detectMode(datapoints: ReplayDatapoint[]): ValueMode {
    if (!datapoints || !datapoints.length) return "number";
    let sawBool = false;
    let sawNum = false;
    for (const dp of datapoints) {
        const v = dp.value;
        if (typeof v === "boolean") sawBool = true;
        else if (typeof v === "number") sawNum = true;
        else if (v !== null && v !== undefined) return "unsupported";
    }
    if (sawNum) return "number";
    if (sawBool) return "boolean";
    return "number";
}

function toNumeric(value: unknown, mode: ValueMode): number {
    if (mode === "boolean") return value === true ? 1 : 0;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    const n = parseFloat(String(value));
    return isFinite(n) ? n : 0;
}

function niceRange(min: number, max: number): [number, number] {
    if (!isFinite(min) || !isFinite(max)) return [0, 1];
    if (min === max) {
        const pad = Math.max(Math.abs(min) * 0.1, 1);
        return [min - pad, max + pad];
    }
    const span = max - min;
    const pad = span * 0.1;
    return [min - pad, max + pad];
}

@customElement("or-replay-editor")
export class OrReplayEditor extends translate(i18next)(LitElement) {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            font-family: inherit;
            --or-replay-accent: var(--or-app-color4, #4d9d2a);
            --or-replay-grid: #e0e0e0;
            --or-replay-axis: #757575;
            --or-replay-bg: #fafafa;
        }
        .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin-bottom: 8px;
        }
        .toolbar .spacer { flex: 1; }
        .toolbar or-mwc-input { min-width: 0; }
        .toolbar label {
            font-size: 12px;
            color: var(--or-replay-axis);
            margin-right: 4px;
        }
        .graph-wrapper {
            position: relative;
            width: 100%;
            border: 1px solid var(--or-replay-grid);
            border-radius: 4px;
            background: var(--or-replay-bg);
            overflow: hidden;
            user-select: none;
            touch-action: none;
        }
        svg.graph {
            display: block;
            width: 100%;
            height: 260px;
            cursor: crosshair;
        }
        svg.graph.dragging { cursor: grabbing; }
        .axis-line {
            stroke: var(--or-replay-axis);
            stroke-width: 1;
        }
        .grid-line {
            stroke: var(--or-replay-grid);
            stroke-width: 1;
            shape-rendering: crispEdges;
        }
        .tick-label {
            fill: var(--or-replay-axis);
            font-size: 10px;
            font-family: monospace;
        }
        .value-line {
            fill: none;
            stroke: var(--or-replay-accent);
            stroke-width: 2;
        }
        .value-point {
            fill: #fff;
            stroke: var(--or-replay-accent);
            stroke-width: 2;
            cursor: grab;
        }
        .value-point.selected {
            fill: var(--or-replay-accent);
            stroke: #000;
        }
        .value-point:hover { r: 6; }
        .hover-marker {
            fill: none;
            stroke: var(--or-replay-axis);
            stroke-dasharray: 3 3;
            stroke-width: 1;
            pointer-events: none;
        }
        .readout {
            position: absolute;
            top: 6px;
            right: 8px;
            font-family: monospace;
            font-size: 11px;
            color: var(--or-replay-axis);
            background: rgba(255,255,255,0.85);
            padding: 2px 6px;
            border-radius: 3px;
            pointer-events: none;
        }
        .empty-hint {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--or-replay-axis);
            font-size: 12px;
            pointer-events: none;
            text-align: center;
            padding: 16px;
        }
        table.dp-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 13px;
        }
        table.dp-table th, table.dp-table td {
            padding: 4px 8px;
            border-bottom: 1px solid var(--or-replay-grid);
            text-align: left;
        }
        table.dp-table th {
            color: var(--or-replay-axis);
            font-weight: 500;
            font-size: 11px;
            text-transform: uppercase;
        }
        table.dp-table td or-mwc-input { width: 100%; }
        .row-actions {
            width: 48px;
            text-align: right !important;
        }
        .icon-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: var(--or-replay-axis);
        }
        .icon-btn:hover { color: #d33; }
        .unsupported {
            color: #d33;
            font-size: 12px;
            padding: 8px;
        }
    `;

    @property({ type: Array })
    public datapoints: ReplayDatapoint[] = [];

    @property({ type: Number })
    public duration = 24 * 3600;

    @property({ type: Boolean })
    public readonly = false;

    @state() private _width = 600;
    @state() private _height = 260;
    @state() private _yMin?: number;
    @state() private _yMax?: number;
    @state() private _selectedIndex = -1;
    @state() private _hoverPos?: { x: number; y: number; t: number; v: number };
    @state() private _draggingIndex = -1;

    @query("svg.graph") private _svg!: SVGSVGElement;
    @query(".graph-wrapper") private _wrapper!: HTMLDivElement;

    private _resizeObs?: ResizeObserver;

    connectedCallback() {
        super.connectedCallback();
        this._resizeObs = new ResizeObserver(entries => {
            for (const e of entries) {
                this._width = Math.max(200, e.contentRect.width);
                this._height = Math.max(MIN_H, e.contentRect.height);
            }
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._resizeObs?.disconnect();
    }

    firstUpdated(_: PropertyValues) {
        if (this._wrapper) this._resizeObs!.observe(this._wrapper);
    }

    // ---- data helpers ----

    private _sorted(): ReplayDatapoint[] {
        return [...(this.datapoints ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    }

    private _mode(): ValueMode {
        return detectMode(this.datapoints ?? []);
    }

    private _yBounds(): [number, number] {
        const mode = this._mode();
        if (mode === "boolean") return [-0.2, 1.2];
        const values = (this.datapoints ?? []).map(d => toNumeric(d.value, mode));
        const auto = values.length
            ? niceRange(Math.min(...values), Math.max(...values))
            : niceRange(0, 1);
        const min = this._yMin ?? auto[0];
        const max = this._yMax ?? auto[1];
        return [min, max === min ? min + 1 : max];
    }

    // ---- coordinate math ----

    private _xScale(t: number): number {
        const w = this._width - PAD_L - PAD_R;
        return PAD_L + (t / Math.max(1, this.duration)) * w;
    }
    private _yScale(v: number): number {
        const [yMin, yMax] = this._yBounds();
        const h = this._height - PAD_T - PAD_B;
        return PAD_T + h - ((v - yMin) / (yMax - yMin)) * h;
    }
    private _invertX(x: number): number {
        const w = this._width - PAD_L - PAD_R;
        return Math.max(0, Math.min(this.duration, ((x - PAD_L) / w) * this.duration));
    }
    private _invertY(y: number): number {
        const [yMin, yMax] = this._yBounds();
        const h = this._height - PAD_T - PAD_B;
        return yMax - ((y - PAD_T) / h) * (yMax - yMin);
    }

    private _svgPoint(ev: PointerEvent): { x: number; y: number } {
        const rect = this._svg.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * this._width;
        const y = ((ev.clientY - rect.top) / rect.height) * this._height;
        return { x, y };
    }

    // ---- mutations ----

    private _emit(next: ReplayDatapoint[]) {
        this.datapoints = next;
        this.dispatchEvent(new OrReplayEditorChangedEvent(next));
    }

    private _coerceValue(v: number): unknown {
        if (this._mode() === "boolean") return v >= 0.5;
        return Math.round(v * 1000) / 1000;
    }

    private _addPoint(t: number, v: number) {
        if (this.readonly) return;
        const next = [...(this.datapoints ?? []), {
            timestamp: Math.round(Math.max(0, Math.min(this.duration, t))),
            value: this._coerceValue(v),
        }];
        this._emit(next);
        this._selectedIndex = next.length - 1;
    }

    private _removePoint(sortedIndex: number) {
        if (this.readonly) return;
        const sorted = this._sorted();
        const target = sorted[sortedIndex];
        if (!target) return;
        const idx = (this.datapoints ?? []).findIndex(d => d === target);
        if (idx < 0) return;
        const next = [...this.datapoints];
        next.splice(idx, 1);
        this._emit(next);
        this._selectedIndex = -1;
    }

    private _movePoint(sortedIndex: number, t: number, v: number) {
        if (this.readonly) return;
        const sorted = this._sorted();
        const target = sorted[sortedIndex];
        if (!target) return;
        const idx = (this.datapoints ?? []).findIndex(d => d === target);
        if (idx < 0) return;
        const next = [...this.datapoints];
        next[idx] = {
            timestamp: Math.round(Math.max(0, Math.min(this.duration, t))),
            value: this._coerceValue(v),
        };
        this._emit(next);
    }

    private _clear() {
        if (this.readonly) return;
        this._selectedIndex = -1;
        this._emit([]);
    }

    // ---- pointer events ----

    private _onSvgPointerDown = (ev: PointerEvent) => {
        if (this.readonly) return;
        if (ev.button !== 0) return;
        const { x, y } = this._svgPoint(ev);
        if (x < PAD_L || x > this._width - PAD_R) return;
        if (y < PAD_T || y > this._height - PAD_B) return;

        const hitIndex = this._hitTest(x, y);
        if (hitIndex >= 0) {
            this._selectedIndex = hitIndex;
            this._draggingIndex = hitIndex;
            this._svg.setPointerCapture(ev.pointerId);
            ev.preventDefault();
            return;
        }

        const t = this._invertX(x);
        const v = this._invertY(y);
        this._addPoint(t, v);
        ev.preventDefault();
    };

    private _onSvgPointerMove = (ev: PointerEvent) => {
        const { x, y } = this._svgPoint(ev);
        if (this._draggingIndex >= 0) {
            const t = this._invertX(x);
            const v = this._invertY(y);
            this._movePoint(this._draggingIndex, t, v);
            // Re-locate selected in case order changed
            const sorted = this._sorted();
            const newIdx = sorted.findIndex(d => Math.round(d.timestamp) === Math.round(t));
            if (newIdx >= 0) {
                this._selectedIndex = newIdx;
                this._draggingIndex = newIdx;
            }
        } else {
            if (x >= PAD_L && x <= this._width - PAD_R && y >= PAD_T && y <= this._height - PAD_B) {
                this._hoverPos = { x, y, t: this._invertX(x), v: this._invertY(y) };
            } else {
                this._hoverPos = undefined;
            }
        }
    };

    private _onSvgPointerUp = (ev: PointerEvent) => {
        if (this._draggingIndex >= 0) {
            try { this._svg.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
            this._draggingIndex = -1;
        }
    };

    private _onSvgPointerLeave = () => { this._hoverPos = undefined; };

    private _hitTest(x: number, y: number): number {
        const sorted = this._sorted();
        const mode = this._mode();
        for (let i = 0; i < sorted.length; i++) {
            const px = this._xScale(sorted[i].timestamp);
            const py = this._yScale(toNumeric(sorted[i].value, mode));
            if ((px - x) ** 2 + (py - y) ** 2 <= 64) return i;
        }
        return -1;
    }

    // ---- rendering ----

    private _renderAxes(): TemplateResult {
        const [yMin, yMax] = this._yBounds();
        const mode = this._mode();
        const w = this._width - PAD_L - PAD_R;
        const h = this._height - PAD_T - PAD_B;

        // X ticks - divide duration into 6 segments, rounded to sensible units
        const xTickCount = 6;
        const xTicks: { t: number; label: string }[] = [];
        for (let i = 0; i <= xTickCount; i++) {
            const t = (this.duration / xTickCount) * i;
            xTicks.push({ t, label: formatDuration(t) });
        }

        // Y ticks
        const yTickCount = mode === "boolean" ? 2 : 5;
        const yTicks: { v: number; label: string }[] = [];
        for (let i = 0; i <= yTickCount; i++) {
            const v = yMin + ((yMax - yMin) / yTickCount) * i;
            const label = mode === "boolean"
                ? (v >= 0.9 ? "true" : v <= 0.1 ? "false" : "")
                : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
            yTicks.push({ v, label });
        }

        return svg`
            ${xTicks.map(t => svg`
                <line class="grid-line" x1="${this._xScale(t.t)}" y1="${PAD_T}" x2="${this._xScale(t.t)}" y2="${PAD_T + h}" />
                <text class="tick-label" x="${this._xScale(t.t)}" y="${PAD_T + h + 14}" text-anchor="middle">${t.label}</text>
            `)}
            ${yTicks.map(t => svg`
                <line class="grid-line" x1="${PAD_L}" y1="${this._yScale(t.v)}" x2="${PAD_L + w}" y2="${this._yScale(t.v)}" />
                ${t.label ? svg`<text class="tick-label" x="${PAD_L - 6}" y="${this._yScale(t.v) + 3}" text-anchor="end">${t.label}</text>` : ""}
            `)}
            <line class="axis-line" x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + h}" />
            <line class="axis-line" x1="${PAD_L}" y1="${PAD_T + h}" x2="${PAD_L + w}" y2="${PAD_T + h}" />
        `;
    }

    private _renderLine(): TemplateResult | string {
        const sorted = this._sorted();
        if (sorted.length < 2) return "";
        const mode = this._mode();
        const pts: string[] = [];
        if (mode === "boolean") {
            // Step line
            for (let i = 0; i < sorted.length; i++) {
                const x = this._xScale(sorted[i].timestamp);
                const y = this._yScale(toNumeric(sorted[i].value, mode));
                if (i === 0) {
                    pts.push(`${x},${y}`);
                } else {
                    const prevY = this._yScale(toNumeric(sorted[i - 1].value, mode));
                    pts.push(`${x},${prevY}`);
                    pts.push(`${x},${y}`);
                }
            }
        } else {
            for (const dp of sorted) {
                pts.push(`${this._xScale(dp.timestamp)},${this._yScale(toNumeric(dp.value, mode))}`);
            }
        }
        return svg`<polyline class="value-line" points="${pts.join(" ")}" />`;
    }

    private _renderPoints(): TemplateResult[] {
        const sorted = this._sorted();
        const mode = this._mode();
        return sorted.map((dp, i) => {
            const x = this._xScale(dp.timestamp);
            const y = this._yScale(toNumeric(dp.value, mode));
            const selected = i === this._selectedIndex;
            return svg`<circle class="value-point ${selected ? "selected" : ""}"
                cx="${x}" cy="${y}" r="${selected ? 6 : 4}" />`;
        });
    }

    private _renderHover(): TemplateResult | string {
        if (!this._hoverPos || this._draggingIndex >= 0) return "";
        const { x, y } = this._hoverPos;
        return svg`
            <line class="hover-marker" x1="${x}" y1="${PAD_T}" x2="${x}" y2="${this._height - PAD_B}" />
            <line class="hover-marker" x1="${PAD_L}" y1="${y}" x2="${this._width - PAD_R}" y2="${y}" />
        `;
    }

    private _renderReadout(): TemplateResult | string {
        if (this._draggingIndex >= 0) {
            const sorted = this._sorted();
            const dp = sorted[this._draggingIndex];
            if (!dp) return "";
            return html`<div class="readout">${formatDuration(dp.timestamp)} &nbsp;→&nbsp; ${String(dp.value)}</div>`;
        }
        if (this._hoverPos) {
            const mode = this._mode();
            const vTxt = mode === "boolean"
                ? (this._hoverPos.v >= 0.5 ? "true" : "false")
                : (Math.round(this._hoverPos.v * 1000) / 1000).toString();
            return html`<div class="readout">${formatDuration(this._hoverPos.t)} &nbsp;→&nbsp; ${vTxt}</div>`;
        }
        return "";
    }

    private _renderTable(): TemplateResult {
        const sorted = this._sorted();
        const mode = this._mode();
        return html`
            <table class="dp-table">
                <thead>
                    <tr>
                        <th style="width:40%">${i18next.t("replayEditor.time", "Time (hh:mm:ss)")}</th>
                        <th style="width:50%">${i18next.t("replayEditor.value", "Value")}</th>
                        <th class="row-actions"></th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map((dp, i) => html`
                        <tr>
                            <td>
                                <or-mwc-input .type="${InputType.TEXT}"
                                    .value="${formatDuration(dp.timestamp)}"
                                    .disabled="${this.readonly}"
                                    @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                        const n = parseDuration(String(e.detail.value));
                                        if (n !== undefined) this._movePoint(i, n, toNumeric(dp.value, mode));
                                    }}"></or-mwc-input>
                            </td>
                            <td>
                                ${mode === "boolean"
                                    ? html`<or-mwc-input .type="${InputType.CHECKBOX}"
                                        .value="${dp.value === true}"
                                        .disabled="${this.readonly}"
                                        @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                            this._movePoint(i, dp.timestamp, e.detail.value ? 1 : 0);
                                        }}"></or-mwc-input>`
                                    : html`<or-mwc-input .type="${InputType.NUMBER}"
                                        .value="${toNumeric(dp.value, mode)}"
                                        .disabled="${this.readonly}"
                                        @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                            const n = parseFloat(String(e.detail.value));
                                            if (!isNaN(n)) this._movePoint(i, dp.timestamp, n);
                                        }}"></or-mwc-input>`}
                            </td>
                            <td class="row-actions">
                                <button class="icon-btn"
                                    title="${i18next.t("delete", "Delete")}"
                                    ?disabled="${this.readonly}"
                                    @click="${() => this._removePoint(i)}">✕</button>
                            </td>
                        </tr>
                    `)}
                </tbody>
            </table>
        `;
    }

    render() {
        const mode = this._mode();
        if (mode === "unsupported") {
            return html`<div class="unsupported">
                ${i18next.t("replayEditor.unsupportedType", "Graphical editor only supports numeric or boolean values.")}
            </div>`;
        }
        const [yMin, yMax] = this._yBounds();
        const count = (this.datapoints ?? []).length;

        return html`
            <div class="toolbar">
                <or-mwc-input .type="${InputType.BUTTON}" outlined icon="delete-sweep"
                    label="${i18next.t("replayEditor.clear", "Clear")}"
                    .disabled="${this.readonly || count === 0}"
                    @or-mwc-input-changed="${() => this._clear()}"></or-mwc-input>
                <span class="spacer"></span>
                ${mode === "number" ? html`
                    <label>${i18next.t("replayEditor.yMin", "Y min")}</label>
                    <or-mwc-input .type="${InputType.NUMBER}" style="width:100px"
                        .value="${yMin}"
                        @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                            const v = parseFloat(String(e.detail.value));
                            this._yMin = isNaN(v) ? undefined : v;
                        }}"></or-mwc-input>
                    <label>${i18next.t("replayEditor.yMax", "Y max")}</label>
                    <or-mwc-input .type="${InputType.NUMBER}" style="width:100px"
                        .value="${yMax}"
                        @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                            const v = parseFloat(String(e.detail.value));
                            this._yMax = isNaN(v) ? undefined : v;
                        }}"></or-mwc-input>
                ` : ""}
            </div>
            <div class="graph-wrapper">
                <svg class="graph ${this._draggingIndex >= 0 ? "dragging" : ""}"
                    viewBox="0 0 ${this._width} ${this._height}"
                    preserveAspectRatio="none"
                    @pointerdown="${this._onSvgPointerDown}"
                    @pointermove="${this._onSvgPointerMove}"
                    @pointerup="${this._onSvgPointerUp}"
                    @pointerleave="${this._onSvgPointerLeave}">
                    ${this._renderAxes()}
                    ${this._renderLine()}
                    ${this._renderHover()}
                    ${this._renderPoints()}
                </svg>
                ${this._renderReadout()}
                ${count === 0 ? html`<div class="empty-hint">
                    ${i18next.t("replayEditor.emptyHint", "Click anywhere on the graph to add a datapoint. Drag to move, click ✕ in the table to delete.")}
                </div>` : ""}
            </div>
            ${this._renderTable()}
        `;
    }
}
