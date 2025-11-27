import {css, html, LitElement, PropertyValues, TemplateResult, unsafeCSS} from "lit";
import {until} from "lit/directives/until.js";
import {customElement, property, state} from "lit/decorators.js";
import {InputType, OrMwcInput, OrInputChangedEvent, getValueHolderInputTemplateProvider, ValueInputProviderOptions, OrInputChangedEventDetail, ValueInputProvider} from "@openremote/or-mwc-components/or-mwc-input";
import {i18next} from "@openremote/or-translate"
import {Asset, Attribute, NameValueHolder, AssetModelUtil, WellknownMetaItems} from "@openremote/model";
import { DefaultColor5, DefaultColor3, DefaultColor2, Util} from "@openremote/core";
import "@openremote/or-mwc-components/or-mwc-input";
import {OrIcon} from "@openremote/or-icon";
import {showDialog, OrMwcDialog, DialogAction} from "@openremote/or-mwc-components/or-mwc-dialog";
import {ListItem, ListType, OrMwcList} from "@openremote/or-mwc-components/or-mwc-list";
import "./or-add-attribute-panel";
import {getField, getPanel, getPropertyTemplate} from "./index";
import {
    OrAddAttributePanelAttributeChangedEvent,
} from "./or-add-attribute-panel";
import {panelStyles} from "./style";
import { OrAssetTree, UiAssetTreeNode } from "@openremote/or-asset-tree";
import {jsonFormsInputTemplateProvider, OrAttributeInput, OrAttributeInputChangedEvent } from "@openremote/or-attribute-input";
import {createRef, ref, Ref } from "lit/directives/ref.js";
import {classMap} from "lit/directives/class-map.js";
import {repeat} from "lit/directives/repeat.js";
import {guard} from "lit/directives/guard.js";

/**
 * Represents a user's pending change to an attribute
 */
export interface UserAttributeChange {
    value?: any;
    meta?: { [name: string]: any };
    deleted?: boolean;
}

/**
 * Tracks the edit state of a single attribute
 */
export interface AttributeEditState {
    userChange?: UserAttributeChange;
    /** True if server updated while user has pending changes */
    hasConflict: boolean;
    /** True if user chose to keep their value - don't show conflict again */
    userChoseToKeep: boolean;
    /** True if user is currently focused/editing this field */
    isEditing: boolean;
    showUpdateFlash: boolean;
}

/**
 * Asset-level user changes (parent, access, etc.)
 */
export interface AssetLevelChanges {
    parentId?: string | null;
    accessPublicRead?: boolean;
    name?: string;
    path?: string[];
}

/**
 * Newly added attributes (full attribute objects)
 */
export interface AddedAttributes {
    [attributeName: string]: Attribute<any>;
}

// TODO: Add webpack/rollup to build so consumers aren't forced to use the same tooling
const tableStyle = require("@material/data-table/dist/mdc.data-table.css");

// language=CSS
const style = css`
    .panel {
        margin: 10px auto;
        max-width: 1200px;
    }

    #parent-edit-wrapper {
        display: flex;
        align-items: center;
    }

    #parent-edit-wrapper > #property-parentId {
        width: 100%;
    }

    #change-parent-btn {
        margin-left: 20px;
    }

    .mdc-data-table__row:hover {
        background-color: inherit !important;
    }

    .mdc-data-table__row {
        border-top-color: #D3D3D3;
        border-left: 3px solid transparent;
    }

    #attribute-table {
        width: 100%;
    }

    .mdc-data-table__table {
        width: 100%;
    }
    .mdc-data-table__header-cell {
        font-weight: 500;
        color: ${unsafeCSS(DefaultColor3)};
    }

    .mdc-data-table__header-cell:first-child {
        padding-left: 36px;
    }
    .expander-cell {
        --or-icon-width: 20px;
        --or-icon-height: 20px;
        cursor: pointer;
    }
    .expander-cell > * {
        pointer-events: none;
    }
    .expander-cell > or-icon {
        vertical-align: middle;
        margin-right: 6px;
        margin-left: -5px;
    }
    .padded-cell {
        padding: 10px 16px;
    }
    .padded-cell > or-attribute-input {
        width: 100%;
    }
    .actions-cell {
        text-align: right;
        width: 40px;
        padding-right: 4px;
    }
    .meta-item-container {
        padding: 0 4px 0 24px;
        overflow: hidden;
        max-height: 0;
        transition: max-height 0.25s ease-out;
    }
    .attribute-meta-row.expanded  .meta-item-container {
        transition: max-height 0.5s ease-in-out;
    }
    .meta-item-container or-mwc-input {
        width: 100%;
    }
    .meta-item-wrapper {
        display: flex;
        margin: 10px 0;
    }
    .meta-item-wrapper:first-child {
        margin-top: 0;
    }
    .meta-item-wrapper:hover .button-clear {
        visibility: visible;
    }
    .item-add {
        margin-bottom: 10px;
    }
    .item-add-attribute {
        margin: 10px 0px 10px 4px;
    }
    .button-clear {
        background: none;
        color: ${unsafeCSS(DefaultColor5)};
        --or-icon-fill: ${unsafeCSS(DefaultColor5)};
        visibility: hidden;
        display: inline-block;
        border: none;
        padding: 0 0 0 4px;
        cursor: pointer;
    }
    .button-clear:hover {
        --or-icon-fill: var(--internal-or-asset-viewer-button-color);
    }
    .button-clear:focus {
        outline: 0;
    }
    .button-clear.hidden {
        visibility: hidden;
    }
    .overflow-visible {
        overflow: visible;
    }

    /* ===== EDIT STATE INDICATORS ===== */
    .mdc-data-table__row.user-modified {
        border-left: 3px solid var(--or-app-color-primary, #1976d2);
    }
    .modified-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--or-app-color-primary, #1976d2);
        margin-right: 8px;
        vertical-align: middle;
    }
    .mdc-data-table__row.server-updated {
        border-left: 3px solid var(--or-app-color-warning, #ff9800);
    }
    .mdc-data-table__row.has-conflict {
        border-left: 3px solid var(--or-app-color-warning, #ff9800);
    }
    .conflict-indicator {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        color: var(--or-app-color-warning, #ff9800);
        font-size: 12px;
        margin-top: 6px;
        padding: 4px 8px;
        background-color: rgba(255, 152, 0, 0.1);
        border-radius: 4px;
    }
    .conflict-indicator or-icon {
        --or-icon-width: 16px;
        --or-icon-height: 16px;
        --or-icon-fill: var(--or-app-color-warning, #ff9800);
    }
    .conflict-indicator strong {
        font-family: monospace;
        background-color: rgba(0, 0, 0, 0.05);
        padding: 1px 4px;
        border-radius: 2px;
    }
    .accept-server-value, .keep-user-value {
        cursor: pointer;
        text-decoration: underline;
        color: var(--or-app-color-primary, #1976d2);
        font-weight: 500;
    }
    .accept-server-value {
        margin-left: auto;
    }
    .accept-server-value:hover, .keep-user-value:hover {
        text-decoration: none;
    }
    .user-override-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--or-app-color-primary, #1976d2);
        font-size: 12px;
        margin-top: 6px;
        padding: 4px 8px;
        background-color: rgba(25, 118, 210, 0.1);
        border-radius: 4px;
    }
    .user-override-indicator or-icon {
        --or-icon-width: 16px;
        --or-icon-height: 16px;
        --or-icon-fill: var(--or-app-color-primary, #1976d2);
    }
    .user-override-indicator strong {
        font-family: monospace;
        background-color: rgba(0, 0, 0, 0.05);
        padding: 1px 4px;
        border-radius: 2px;
    }
    .mdc-data-table__row.newly-added {
        border-left: 3px solid var(--or-app-color-success, #4caf50);
    }
    .attribute-meta-row.user-modified .meta-item-container {
        border-left: 2px solid var(--or-app-color-primary, #1976d2);
        margin-left: 1px;
    }
`;

export class OrEditAssetModifiedEvent extends CustomEvent<ValidatorResult[]> {

    public static readonly NAME = "or-edit-asset-modified";

    constructor(validatorResults: ValidatorResult[]) {
        super(OrEditAssetModifiedEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: validatorResults
        });
    }
}

declare global {
    export interface HTMLElementEventMap {
        [OrEditAssetModifiedEvent.NAME]: OrEditAssetModifiedEvent;
    }
}

const AssetNameRegex = /^\w+$/;

export interface ValidatorResult {
    name: string;
    valid: boolean;
    metaResults?: ValidatorResult[]; // For meta items
}

interface TemplateAndValidator {
    template: TemplateResult;
    validator: () => ValidatorResult;
}

@customElement("or-edit-asset-panel")
export class OrEditAssetPanel extends LitElement {

    /** The live asset from the server - updated freely by external events */
    @property({attribute: false})
    public liveAsset!: Asset;

    /** Per-attribute edit state tracking user changes and conflicts */
    @state()
    protected editStates: Map<string, AttributeEditState> = new Map();

    /** Asset-level changes (parent, access, name) */
    @state()
    protected assetLevelChanges: AssetLevelChanges = {};

    /** Newly added attributes (not yet on server) */
    @state()
    protected addedAttributes: AddedAttributes = {};

    protected attributeTemplatesAndValidators: TemplateAndValidator[] = [];
    protected expandedAll: boolean = false;

    /** Cache for attribute templates - keyed by attribute name */
    private _templateCache: Map<string, TemplateAndValidator> = new Map();
    /** Attributes that need template regeneration */
    private _dirtyAttributes: Set<string> = new Set();
    /** Track pending update to batch multiple state changes */
    private _updatePending: boolean = false;

    public static get styles() {
        return [
            unsafeCSS(tableStyle),
            panelStyles,
            style
        ];
    }

    /** Reset edit state when a new asset is loaded */
    public resetEditState(): void {
        this.editStates = new Map();
        this.assetLevelChanges = {};
        this.addedAttributes = {};
        this._templateCache.clear();
        this._dirtyAttributes.clear();
    }

    /** Check if there are any user modifications */
    public hasModifications(): boolean {
        for (const [, state] of this.editStates) {
            if (state.userChange !== undefined) return true;
        }
        if (Object.keys(this.addedAttributes).length > 0) return true;
        return Object.keys(this.assetLevelChanges).length > 0;
    }

    /** Get the display value for an attribute (user change or live value) */
    public getDisplayValue(attrName: string): any {
        const editState = this.editStates.get(attrName);
        if (editState?.userChange?.value !== undefined) {
            return editState.userChange.value;
        }
        return this.liveAsset.attributes?.[attrName]?.value;
    }

    /** Get the current server value for an attribute */
    public getServerValue(attrName: string): any {
        return this.liveAsset.attributes?.[attrName]?.value;
    }

    /** Called when an external attribute update arrives (liveAsset is already updated by parent) */
    public attributeUpdated(attrName: string, newValue: any): void {
        if (!this.liveAsset?.attributes?.[attrName]) return;

        let editState = this.editStates.get(attrName);
        const userIsInteracting = editState?.userChange?.value !== undefined || editState?.isEditing;

        if (userIsInteracting) {
            // User has changes or is focused - show conflict
            if (!editState) {
                editState = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
            }
            if (!editState.userChoseToKeep) {
                editState.hasConflict = true;
            }
            this.editStates.set(attrName, editState);
            this._markDirty(attrName);
            this._scheduleUpdate();
        } else {
            // No user interaction - just update display with flash
            if (!editState) {
                editState = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
            }
            editState.showUpdateFlash = true;
            this.editStates.set(attrName, editState);
            this._markDirty(attrName);
            this._scheduleUpdate();

            setTimeout(() => {
                const state = this.editStates.get(attrName);
                if (state) {
                    state.showUpdateFlash = false;
                    this.editStates.set(attrName, state);
                    this._markDirty(attrName);
                    this._scheduleUpdate();
                }
            }, 800);
        }
    }

    protected _onAttributeFocus(attrName: string): void {
        let editState = this.editStates.get(attrName);
        if (!editState) {
            editState = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
        }
        editState.isEditing = true;
        // Capture current value as user's value to prevent server overwrites while editing
        if (editState.userChange?.value === undefined) {
            if (!editState.userChange) editState.userChange = {};
            editState.userChange.value = this.liveAsset.attributes?.[attrName]?.value;
        }
        this.editStates.set(attrName, editState);
        // No need to mark dirty or update - editing state doesn't affect visual template
    }

    protected _onAttributeBlur(attrName: string): void {
        const editState = this.editStates.get(attrName);
        if (editState) {
            editState.isEditing = false;
            // If user didn't change value (still same as server), clear the userChange
            const serverValue = this.liveAsset.attributes?.[attrName]?.value;
            const hadUserChange = editState.userChange?.value !== undefined;
            if (hadUserChange && JSON.stringify(editState.userChange!.value) === JSON.stringify(serverValue)) {
                editState.userChange = undefined;
                editState.hasConflict = false;
                // User change was cleared - need to update visual state
                this.editStates.set(attrName, editState);
                this._markDirty(attrName);
                this._scheduleUpdate();
            } else {
                this.editStates.set(attrName, editState);
            }
        }
    }

    /** Accept the server value, discarding user's pending change */
    public acceptServerValue(attrName: string): void {
        const editState = this.editStates.get(attrName);
        if (editState) {
            editState.userChange = undefined;
            editState.hasConflict = false;
            editState.userChoseToKeep = false;
            this.editStates.set(attrName, editState);
            this._markDirty(attrName);
            this._onModified();
        }
    }

    /** Keep user's value, dismiss the conflict indicator and don't ask again */
    public keepUserValue(attrName: string): void {
        const editState = this.editStates.get(attrName);
        if (editState) {
            editState.hasConflict = false;
            editState.userChoseToKeep = true;
            this.editStates.set(attrName, editState);
            this._markDirty(attrName);
            this._scheduleUpdate();
        }
    }

    /** Build the asset object to save - merges user changes with latest server state */
    public getAssetToSave(): Asset {
        const assetToSave: Asset = JSON.parse(JSON.stringify(this.liveAsset));

        // Apply asset-level changes
        if (this.assetLevelChanges.parentId !== undefined) {
            assetToSave.parentId = this.assetLevelChanges.parentId === null
                ? undefined : this.assetLevelChanges.parentId;
        }
        if (this.assetLevelChanges.path !== undefined) {
            assetToSave.path = this.assetLevelChanges.path;
        }
        if (this.assetLevelChanges.accessPublicRead !== undefined) {
            assetToSave.accessPublicRead = this.assetLevelChanges.accessPublicRead;
        }
        if (this.assetLevelChanges.name !== undefined) {
            assetToSave.name = this.assetLevelChanges.name;
        }

        // Apply attribute changes
        for (const [attrName, editState] of this.editStates) {
            if (!editState.userChange) continue;

            if (editState.userChange.deleted) {
                delete assetToSave.attributes![attrName];
                continue;
            }

            if (assetToSave.attributes?.[attrName]) {
                if (editState.userChange.value !== undefined) {
                    assetToSave.attributes[attrName].value = editState.userChange.value;
                    assetToSave.attributes[attrName].timestamp = undefined;
                }
                if (editState.userChange.meta) {
                    if (!assetToSave.attributes[attrName].meta) {
                        assetToSave.attributes[attrName].meta = {};
                    }
                    // Apply meta changes - undefined means deletion
                    for (const [metaName, metaValue] of Object.entries(editState.userChange.meta)) {
                        if (metaValue === undefined) {
                            delete assetToSave.attributes[attrName].meta![metaName];
                        } else {
                            assetToSave.attributes[attrName].meta![metaName] = metaValue;
                        }
                    }
                }
            }
        }

        // Add new attributes
        for (const [attrName, attr] of Object.entries(this.addedAttributes)) {
            if (!assetToSave.attributes) assetToSave.attributes = {};
            assetToSave.attributes[attrName] = attr;
        }

        return assetToSave;
    }

    private _formatValue(value: any): string {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    /** Mark an attribute as needing template regeneration */
    private _markDirty(attrName: string): void {
        this._dirtyAttributes.add(attrName);
        this._templateCache.delete(attrName);
    }

    /** Schedule a batched update */
    private _scheduleUpdate(): void {
        if (this._updatePending) return;
        this._updatePending = true;
        requestAnimationFrame(() => {
            this._updatePending = false;
            this.requestUpdate();
        });
    }

    protected render() {
        if (!this.liveAsset) return html``;

        const currentAccessPublicRead = this.assetLevelChanges.accessPublicRead ?? this.liveAsset.accessPublicRead;

        const updatePublicRead = (publicRead: boolean) => {
            this.assetLevelChanges.accessPublicRead = publicRead;
            this._onModified();
        };

        // Properties panel fields
        const properties: TemplateResult[] = [
            getField("type", undefined, getPropertyTemplate(this.liveAsset, "type", this, undefined, undefined, {readonly: true, label: i18next.t("assetType")})),
            getField("parent", undefined, this._getParentTemplate()),
            html`<div @or-mwc-input-changed="${(ev: OrInputChangedEvent) => updatePublicRead(ev.detail.value as boolean)}">
                    ${getField("accessPublicRead", undefined, html`
                        <or-mwc-input
                            .type="${InputType.CHECKBOX}"
                            .value="${currentAccessPublicRead}"
                            .label="${i18next.t("accessPublicRead")}"
                        ></or-mwc-input>
                    `)}
                </div>`
        ];

        const expandToggle = (tdElem: HTMLElement) => {
            const expanderIcon = tdElem.getElementsByTagName("or-icon")[0] as OrIcon;
            const headerRow = tdElem.parentElement! as HTMLTableRowElement;
            const metaRow = (headerRow.parentElement! as HTMLTableElement).rows[headerRow.rowIndex];
            const metaContainer = metaRow.firstElementChild!.firstElementChild as HTMLElement;
            const contentHeight = Math.max(500, metaContainer.firstElementChild!.getBoundingClientRect().height);

            if (expanderIcon.icon === "chevron-right") {
                expanderIcon.icon = "chevron-down";
                metaRow.classList.add("expanded");
                metaContainer.style.maxHeight = contentHeight + "px";
                tdElem.classList.add("expanding");
                // Allow container to grow when expanded once animation has finished
                window.setTimeout(() => {
                    tdElem.classList.remove("expanding");
                    metaContainer.style.maxHeight = "unset";
                }, 250);
            } else {
                expanderIcon.icon = "chevron-right";
                metaRow.classList.remove("expanded");
                metaContainer.style.maxHeight = Math.max(500, metaContainer.firstElementChild!.getBoundingClientRect().height) + "px";
                window.setTimeout(() => {
                    metaContainer.style.maxHeight = "";
                });
            }
        }

        const expanderToggle = (ev: MouseEvent) => {
            const tdElem = ev.target as HTMLElement;
            if (tdElem.className.indexOf("expander-cell") < 0 || tdElem.className.indexOf("expanding") >= 0) {
                return;
            }
            expandToggle(tdElem);

        };

        const expandAllToggle = (ev: MouseEvent) => {
            const tdElem = ev.target as HTMLElement;
            const tdElems = tdElem.closest("table")?.getElementsByClassName("expander-cell");

            if (tdElems) {
                for (var i = 0; i < tdElems.length; i++) {
                    const expanderIcon = tdElems[i].getElementsByTagName("or-icon")[0] as OrIcon;

                    if ((expanderIcon.icon === "chevron-right" && !this.expandedAll) || (expanderIcon.icon === "chevron-down" && this.expandedAll)) {
                        expandToggle(tdElems[i] as HTMLElement);
                    }
                }
                tdElem.setAttribute("label", this.expandedAll ? "expandAll" : "collapseAll");
                this.expandedAll = !this.expandedAll;
            }
        };

        // Build attribute list (existing + added, minus deleted)
        const existingAttrNames = Object.keys(this.liveAsset.attributes || {})
            .filter(name => !this.editStates.get(name)?.userChange?.deleted);
        const addedAttrNames = Object.keys(this.addedAttributes);
        const allAttrNames = [...existingAttrNames, ...addedAttrNames]
            .sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()));

        // Use cached templates where possible, regenerate only dirty ones
        this.attributeTemplatesAndValidators = allAttrNames.map(name => {
            // Check if we have a valid cached template
            if (this._templateCache.has(name) && !this._dirtyAttributes.has(name)) {
                return this._templateCache.get(name)!;
            }

            // Generate new template
            const attribute = this.addedAttributes[name] || this.liveAsset.attributes![name];
            attribute.name = name;
            const templateAndValidator = this._getAttributeTemplate(this.liveAsset.type!, attribute as Attribute<any>, name);
            this._templateCache.set(name, templateAndValidator);
            this._dirtyAttributes.delete(name);
            return templateAndValidator;
        });

        // Clean up cache for removed attributes
        for (const cachedName of this._templateCache.keys()) {
            if (!allAttrNames.includes(cachedName)) {
                this._templateCache.delete(cachedName);
            }
        }

        const attributes = html`
            <div id="attribute-table" class="mdc-data-table">
                <table class="mdc-data-table__table" aria-label="attribute list" @click="${expanderToggle}">
                    <colgroup>
                        <col span="1" style="width: 25%;">
                        <col span="1" style="width: 25%;">
                        <col span="1" style="width: 35%;">
                        <col span="1" style="width: 15%;">
                    </colgroup>
                    ${guard([this.liveAsset.id], () => html`
                        <thead>
                            <tr class="mdc-data-table__header-row">
                                <th class="mdc-data-table__header-cell" role="columnheader" scope="col"><or-translate value="name"></or-translate></th>
                                <th class="mdc-data-table__header-cell" role="columnheader" scope="col"><or-translate value="type"></or-translate></th>
                                <th class="mdc-data-table__header-cell" role="columnheader" scope="col"><or-translate value="value"></or-translate></th>
                                <th class="mdc-data-table__header-cell" role="columnheader" scope="col" style="padding-right:8px;"><or-mwc-input style="float:right;" .type="${InputType.BUTTON}" .label="${i18next.t("expandAll")}" @or-mwc-input-changed="${expandAllToggle}"></or-mwc-input></th>
                            </tr>
                        </thead>
                    `)}
                    <tbody class="mdc-data-table__content">
                        ${repeat(
                            this.attributeTemplatesAndValidators,
                            (item, index) => allAttrNames[index],
                            (item) => item.template
                        )}
                        <tr class="mdc-data-table__row">
                            <td colspan="4">
                                <div class="item-add-attribute">
                                    <or-mwc-input .type="${InputType.BUTTON}" label="addAttribute" icon="plus" @or-mwc-input-changed="${() => this._addAttribute()}"></or-mwc-input>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        return html`
            <div id="edit-wrapper">
                ${getPanel("0", {type: "info", title: "properties"}, html`${properties}`) || ``}
                ${getPanel("1", {type: "info", title: "attribute_plural"}, html`${attributes}`) || ``}
            </div>`;
    }

    protected _getAttributeTemplate(assetType: string, attribute: Attribute<any>, attrName: string): TemplateAndValidator {
        const editState = this.editStates.get(attrName);
        const isUserModified = editState?.userChange !== undefined && !editState.userChange.deleted;
        const hasConflict = editState?.hasConflict ?? false;
        const showFlash = editState?.showUpdateFlash ?? false;
        const isAdded = !!this.addedAttributes[attrName];

        const rowClasses = {
            'mdc-data-table__row': true,
            'user-modified': isUserModified,
            'has-conflict': hasConflict,
            'server-updated': showFlash && !hasConflict,
            'newly-added': isAdded
        };

        const deleteAttribute = () => {
            if (this.addedAttributes[attrName]) {
                delete this.addedAttributes[attrName];
                this._templateCache.delete(attrName);
            } else {
                let state = this.editStates.get(attrName);
                if (!state) state = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
                if (!state.userChange) state.userChange = {};
                state.userChange.deleted = true;
                this.editStates.set(attrName, state);
                this._templateCache.delete(attrName);
            }
            this._onModified();
        };

        const descriptor = AssetModelUtil.getAttributeDescriptor(attrName, assetType);
        const canDelete = !descriptor || descriptor.optional || isAdded;
        const attributeInputRef: Ref<OrAttributeInput> = createRef();

        // Build meta items list: server meta + newly added meta (from editStates) - deleted meta
        const userMeta = editState?.userChange?.meta || {};
        const serverMeta = attribute.meta || {};

        // Collect all meta item names (server + user-added)
        const allMetaNames = new Set([
            ...Object.keys(serverMeta),
            ...Object.keys(userMeta).filter(name => userMeta[name] !== undefined) // exclude deleted
        ]);

        // Filter out deleted meta items
        const activeMetaNames = [...allMetaNames].filter(name => !(name in userMeta && userMeta[name] === undefined));

        const metaTemplatesAndValidators = activeMetaNames
            .sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()))
            .map(name => {
                const value = serverMeta[name] !== undefined ? serverMeta[name] : userMeta[name];
                return this._getMetaItemTemplate(attribute, Util.getMetaItemNameValueHolder(name, value));
            });

        const validator = (): ValidatorResult => {
            let valid = false;
            if (attributeInputRef.value) {
                valid = attributeInputRef.value.checkValidity();
            }
            return {
                name: attrName,
                valid: valid,
                metaResults: metaTemplatesAndValidators.map((metaTemplateAndValidator) => metaTemplateAndValidator.validator())
            };
        };

        // Get display value (user change takes precedence)
        const displayValue = this.getDisplayValue(attrName);
        const displayAttribute: Attribute<any> = { ...attribute, value: displayValue };

        // Booleans formatted asMomentary should be read-only in modify mode
        const formattedAsMomentary = attribute.meta && (attribute.meta.hasOwnProperty(WellknownMetaItems.MOMENTARY) || (attribute.meta.hasOwnProperty(WellknownMetaItems.FORMAT) && attribute.meta[WellknownMetaItems.FORMAT]?.asMomentary));

        const template = html`
            <tr class="${classMap(rowClasses)}">
                <td class="padded-cell mdc-data-table__cell expander-cell">
                    ${isUserModified ? html`<span class="modified-indicator" title="${i18next.t('pendingChanges', 'Pending changes')}"></span>` : ''}
                    <or-icon icon="chevron-right"></or-icon>
                    <span>${attrName}</span>
                </td>
                <td class="padded-cell mdc-data-table__cell">${Util.getValueDescriptorLabel(attribute.type!)}</td>
                <td class="padded-cell overflow-visible mdc-data-table__cell">
                    <or-attribute-input ${ref(attributeInputRef)}
                                        .comfortable="${true}" .assetType="${assetType}" .label=${null}
                                        .readonly="${formattedAsMomentary}" .attribute="${displayAttribute}" .assetId="${this.liveAsset.id!}"
                                        disableWrite disableSubscribe disableButton compact
                                        @or-attribute-input-changed="${(e: OrAttributeInputChangedEvent) => this._onAttributeModified(attribute, e.detail.value)}"
                                        @focusin="${() => this._onAttributeFocus(attrName)}"
                                        @focusout="${() => this._onAttributeBlur(attrName)}"></or-attribute-input>
                    ${hasConflict ? html`
                        <div class="conflict-indicator">
                            <or-icon icon="alert-circle-outline"></or-icon>
                            <span>${i18next.t('serverValueChanged', 'Server changed to')}: <strong>${this._formatValue(this.getServerValue(attrName))}</strong></span>
                            <span class="accept-server-value"
                                  @click="${() => this.acceptServerValue(attrName)}"
                                  title="${i18next.t('acceptServerValue', 'Use server value')}">
                                ${i18next.t('accept', 'Accept')}
                            </span>
                            <span class="keep-user-value"
                                  @click="${() => this.keepUserValue(attrName)}"
                                  title="${i18next.t('keepYourValue', 'Keep your value')}">
                                ${i18next.t('keep', 'Keep mine')}
                            </span>
                        </div>
                    ` : ''}
                    ${!hasConflict && editState?.userChoseToKeep ? html`
                        <div class="user-override-indicator">
                            <or-icon icon="account-check"></or-icon>
                            <span>${i18next.t('userOverridesServer', 'Your value overrides server')}: <strong>${this._formatValue(this.getServerValue(attrName))}</strong></span>
                        </div>
                    ` : ''}
                </td>
                <td class="padded-cell mdc-data-table__cell actions-cell">${canDelete ? html`<or-mwc-input type="${InputType.BUTTON}" icon="delete" @or-mwc-input-changed="${deleteAttribute}">` : ``}</td>
            </tr>
            <tr class="attribute-meta-row ${isUserModified ? 'user-modified' : ''}">
                <td colspan="4">
                    <div class="meta-item-container">
                        <div>
                            <div>
                                ${metaTemplatesAndValidators.map((metaTemplateAndValidator) => metaTemplateAndValidator.template)}
                            </div>
                            <div class="item-add">
                                <or-mwc-input .type="${InputType.BUTTON}" label="addMetaItems" icon="plus" @or-mwc-input-changed="${() => this._addMetaItems(attribute)}"></or-mwc-input>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;

        return { template, validator };
    };

    protected _onModified() {
        this.dispatchEvent(new OrEditAssetModifiedEvent(this.validate()));
        this.requestUpdate();
    }

    public validate(): ValidatorResult[] {
        return this.attributeTemplatesAndValidators.map((attrTemplateAndValidator) => attrTemplateAndValidator.validator());
    }

    protected _onAttributeModified(attribute: Attribute<any>, newValue: any) {
        const attrName = attribute.name!;
        const serverValue = this.liveAsset.attributes?.[attrName]?.value;

        // Ignore if value hasn't actually changed from server value
        if (JSON.stringify(newValue) === JSON.stringify(serverValue)) {
            return;
        }

        let editState = this.editStates.get(attrName);
        if (!editState) {
            editState = {
                hasConflict: false,
                userChoseToKeep: false,
                isEditing: false,
                showUpdateFlash: false
            };
        }

        if (!editState.userChange) editState.userChange = {};
        editState.userChange.value = newValue;
        this.editStates.set(attrName, editState);
        this._markDirty(attrName);
        this._onModified();
    }

    protected _onMetaItemModified(attribute: Attribute<any>, metaItem: NameValueHolder<any>, detail: OrInputChangedEventDetail | undefined) {
        const attrName = attribute.name!;
        const metaName = metaItem.name!;
        const newValue = detail ? detail.value : undefined;

        let editState = this.editStates.get(attrName);
        if (!editState) {
            editState = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
        }

        if (!editState.userChange) editState.userChange = {};
        if (!editState.userChange.meta) editState.userChange.meta = {};
        editState.userChange.meta[metaName] = newValue;

        // Don't directly mutate liveAsset - track in editStates only
        this.editStates.set(attrName, editState);
        this._markDirty(attrName);
        this._onModified();
    }

    protected _getMetaItemTemplate(attribute: Attribute<any>, metaItem: NameValueHolder<any>): TemplateAndValidator {
        const attrName = attribute.name!;
        const metaName = metaItem.name!;
        const descriptor = AssetModelUtil.getMetaItemDescriptor(metaName);
        const valueDescriptor = descriptor ? AssetModelUtil.getValueDescriptor(descriptor.type) : undefined;
        let content: TemplateResult = html``;
        let validator: () => ValidatorResult = () => {
            return {
                name: metaName,
                valid: true
            };
        };

        // Get display value - user change takes precedence over server value
        const editState = this.editStates.get(attrName);
        const displayValue = editState?.userChange?.meta?.[metaName] !== undefined
            ? editState.userChange.meta[metaName]
            : metaItem.value;
        const displayMetaItem: NameValueHolder<any> = { ...metaItem, value: displayValue };

        if (!valueDescriptor) {
            console.log("Couldn't find value descriptor for meta item so falling back to simple JSON input: " + metaName);
            content = html`<or-mwc-input @or-mwc-input-changed="${(ev: OrInputChangedEvent) => this._onMetaItemModified(attribute, metaItem, ev.detail)}" .type="${InputType.JSON}" .value="${displayValue}"></or-mwc-input>`;
        } else {
            const options: ValueInputProviderOptions = {
                label: Util.getMetaLabel(metaItem, descriptor!, this.liveAsset.type!, true),
                resizeVertical: true
            };
            const standardInputProvider = getValueHolderInputTemplateProvider(this.liveAsset.type!, displayMetaItem, descriptor, valueDescriptor, (detail) => this._onMetaItemModified(attribute, metaItem, detail), options);
            let provider = jsonFormsInputTemplateProvider(standardInputProvider)(this.liveAsset.type!, displayMetaItem, descriptor, valueDescriptor, (detail) => this._onMetaItemModified(attribute, metaItem, detail), options);

            if (!provider) {
                provider = standardInputProvider;
            }

            if (provider && provider.templateFunction) {
                content = html`${until(provider.templateFunction(displayValue, false, false, false, false, undefined), ``)}`;
            }
            if (provider.validator) {
                validator = () => {
                    return {
                        name: metaName,
                        valid: provider.validator!()
                    };
                };
            }
        }

        const removeMetaItem = () => {
            // Track deletion in editStates, don't mutate liveAsset directly
            let state = this.editStates.get(attrName);
            if (!state) {
                state = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
            }
            if (!state.userChange) state.userChange = {};
            if (!state.userChange.meta) state.userChange.meta = {};
            state.userChange.meta[metaName] = undefined; // Mark as deleted
            this.editStates.set(attrName, state);
            this._markDirty(attrName);
            this._onModified();
        };

        const template = html`
            <div class="meta-item-wrapper">
                ${content}
                <button class="button-clear" @click="${removeMetaItem}">
                    <or-icon icon="close-circle"></or-icon>
                    </input>
            </div>
        `;

        return {
            template: template,
            validator: validator
        };
    }

    protected _addAttribute() {
        const asset = this.liveAsset!;
        let attr: Attribute<any>;

        const isDisabled = (attribute: Attribute<any>) => {
            const existsInLive = asset.attributes && asset.attributes[attribute?.name!];
            const existsInAdded = this.addedAttributes[attribute?.name!];
            return !(attribute && attribute.name && !existsInLive && !existsInAdded && AssetNameRegex.test(attribute.name) && attribute.type);
        }

        const onAttributeChanged = (attribute: Attribute<any>) => {
            const addDisabled = isDisabled(attribute);
            const addBtn = dialog!.shadowRoot!.getElementById("add-btn") as OrMwcInput;
            addBtn!.disabled = addDisabled;
            attr = attribute;
        };

        const dialog = showDialog(new OrMwcDialog()
            .setContent(html`
                <or-add-attribute-panel .asset="${asset}" @or-add-attribute-panel-attribute-changed="${(ev: OrAddAttributePanelAttributeChangedEvent) => onAttributeChanged(ev.detail)}"></or-add-attribute-panel>
            `)
            .setStyles(html`
                <style>
                    .mdc-dialog__surface {
                        overflow-x: visible !important;
                        overflow-y: visible !important;
                    }
                    #dialog-content {
                        padding: 0;
                        overflow: visible;
                    }
                </style>
            `)
            .setHeading(i18next.t("addAttribute"))
            .setActions([
                {
                    actionName: "cancel",
                    content: "cancel"
                },
                {
                    default: true,
                    actionName: "add",
                    action: () => {
                        if (!isDisabled(attr)) {
                            this.addedAttributes[attr.name!] = attr;
                            this._onModified();
                        }
                    },
                    content: html`<or-mwc-input id="add-btn" .type="${InputType.BUTTON}" disabled label="add"></or-mwc-input>`
                }
            ])
            .setDismissAction(null));
    }

    protected _addMetaItems(attribute: Attribute<any>) {
        const assetTypeInfo = AssetModelUtil.getAssetTypeInfo(this.liveAsset!.type!);
        if (!assetTypeInfo || !assetTypeInfo.metaItemDescriptors) {
            return;
        }

        const meta = attribute.meta || {};

        const metaItemList: (ListItem | null)[] = assetTypeInfo.metaItemDescriptors.map((metaName) => AssetModelUtil.getMetaItemDescriptor(metaName)!)
            .filter((descriptor) => !meta.hasOwnProperty(descriptor.name!))
            .map((descriptor) => {
                return {
                    text: Util.getMetaLabel(undefined, descriptor, this.liveAsset!.type!, true),
                    value: descriptor.name!,
                    translate: false
                };
            }).sort(Util.sortByString((item) => item.text));

        const dialog = showDialog(new OrMwcDialog()
            .setContent(html`
                <div id="meta-creator">
                    <or-mwc-list id="meta-creator-list" .type="${ListType.MULTI_CHECKBOX}" .listItems="${metaItemList}"></or-mwc-list>
                </div>
            `)
            .setStyles(html`
                <style>
                    #meta-creator {
                        height: 600px;
                        max-height: 100%;
                    }
                    
                    #meta-creator > or-mwc-list {
                        height: 100%;
                    }

                    .mdc-dialog .mdc-dialog__content {
                        padding: 0 !important;
                    }
                </style>
            `)
            .setHeading(i18next.t("addMetaItems"))
            .setActions([
                {
                    actionName: "cancel",
                    content: "cancel"
                },
                {
                    default: true,
                    actionName: "add",
                    action: () => {
                        const list = dialog!.shadowRoot!.getElementById("meta-creator-list") as OrMwcList;
                        const selectedItems = list ? list.selectedItems : undefined;
                        if (selectedItems) {
                            const attrName = attribute.name!;
                            let state = this.editStates.get(attrName);
                            if (!state) {
                                state = { hasConflict: false, userChoseToKeep: false, isEditing: false, showUpdateFlash: false };
                            }
                            if (!state.userChange) state.userChange = {};
                            if (!state.userChange.meta) state.userChange.meta = {};

                            selectedItems.forEach((item) => {
                                const descriptor = AssetModelUtil.getMetaItemDescriptors().find((descriptor) => descriptor.name === item.value);
                                if (descriptor) {
                                    state!.userChange!.meta![descriptor.name!] = (descriptor.type === 'boolean') ? true : null;
                                }
                            });
                            this.editStates.set(attrName, state);
                            this._markDirty(attrName);
                            this._onModified();
                        }
                    },
                    content: "add"
                }
            ])
            .setDismissAction(null));
    }

    protected _getParentTemplate() {
        let dialog: OrMwcDialog;

        const setParent = () => {
            const assetTree = dialog.shadowRoot!.getElementById("parent-asset-tree") as OrAssetTree;
            const newParentId = assetTree.selectedIds!.length === 1 ? assetTree.selectedIds![0] : undefined;
            // Need to update the assets path as well
            const path = [this.liveAsset.id!];
            let parentNode = assetTree.selectedNodes[0];
            while (parentNode !== undefined) {
                path.unshift(parentNode.asset!.id!);
                parentNode = parentNode.parent;
            }
            this.assetLevelChanges.parentId = newParentId === undefined ? null : newParentId;
            this.assetLevelChanges.path = path;
            this._onModified();
        };

        const clearParent = () => {
            this.assetLevelChanges.parentId = null;
            this.assetLevelChanges.path = [this.liveAsset.id!];
            this._onModified();
        };

        const blockEvent = (ev: Event) => {
            ev.stopPropagation();
        };

        const parentSelector = (node: UiAssetTreeNode) => node.asset!.id !== this.liveAsset.id;
        const currentParentId = this.assetLevelChanges.parentId !== undefined
            ? (this.assetLevelChanges.parentId === null ? undefined : this.assetLevelChanges.parentId)
            : this.liveAsset.parentId;

        // Prevent change event from bubbling up as it will affect any ancestor listeners that are interested in a different asset tree
        const dialogContent = html`<or-asset-tree id="parent-asset-tree" disableSubscribe readonly .selectedIds="${currentParentId ? [currentParentId] : []}" @or-asset-tree-request-select="${blockEvent}" @or-asset-tree-selection-changed="${blockEvent}" .selector="${parentSelector}"></or-asset-tree>`;

        const dialogActions: DialogAction[] = [
            {
                actionName: "clear",
                content: "none",
                action: clearParent
            },
            {
                actionName: "ok",
                content: "ok",
                action: setParent
            },
            {
                default: true,
                actionName: "cancel",
                content: "cancel"
            }
        ];

        const openDialog = () => {
            dialog = showDialog(new OrMwcDialog()
                .setContent(dialogContent)
                .setActions(dialogActions)
                .setStyles(html`
                        <style>
                            .mdc-dialog__surface {
                                width: 400px;
                                height: 800px;
                                display: flex;
                                overflow: visible;
                                overflow-x: visible !important;
                                overflow-y: visible !important;
                            }
                            #dialog-content {
                                flex: 1;
                                overflow: visible;
                                min-height: 0;
                                padding: 0;
                            }
                            footer.mdc-dialog__actions {
                                border-top: 1px solid ${unsafeCSS(DefaultColor5)};
                            }
                            or-asset-tree {
                                height: 100%;
                            }
                        </style>
                    `)
                .setHeading(i18next.t("setParent"))
                .setDismissAction(null));
        };

        return html`
            <div id="parent-edit-wrapper">
                ${getPropertyTemplate(this.liveAsset, "parentId", this, undefined, undefined, {readonly: true, label: i18next.t("parent")})}
                <or-mwc-input id="change-parent-btn" type="${InputType.BUTTON}" outlined label="edit" @or-mwc-input-changed="${openDialog}"></or-mwc-input>
            </div>
        `;
    }
}
