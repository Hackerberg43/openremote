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
import { html } from "lit";
import {
    JsonFormsStateContext,
    getTemplateWrapper,
    JsonFormsRendererRegistryEntry,
    RankedTester,
    rankWith,
    ControlProps,
    mapStateToControlProps,
    mapDispatchToControlProps,
    and,
    uiTypeIs,
    schemaMatches,
} from "@openremote/or-json-forms";
import { OrReplayEditorChangedEvent, ReplayDatapoint } from "./or-replay-editor";
import "./or-replay-editor";

const DEFAULT_DURATION_SEC = 24 * 3600;

const replayTester: RankedTester = rankWith(
    6,
    and(
        uiTypeIs("Control"),
        schemaMatches((schema) => schema.format === "simulator-replay")
    )
);

function resolveDuration(state: JsonFormsStateContext): number {
    const schedule: any = state?.core?.data?.schedule;
    if (schedule && typeof schedule.start === "number" && typeof schedule.end === "number") {
        const dur = Math.round((schedule.end - schedule.start) / 1000);
        if (dur > 0) return dur;
    }
    return DEFAULT_DURATION_SEC;
}

const replayRenderer = (state: JsonFormsStateContext, props: ControlProps) => {
    props = {
        ...props,
        ...mapStateToControlProps({ jsonforms: { ...state } }, props),
        ...mapDispatchToControlProps(state.dispatch),
    };

    const duration = resolveDuration(state);
    const data: ReplayDatapoint[] = Array.isArray(props.data) ? props.data : [];

    const onChanged = (ev: OrReplayEditorChangedEvent) => {
        props.handleChange(props.path, ev.detail.value);
    };

    let deleteHandler: undefined | (() => void);
    if (!props.required && props.path) {
        deleteHandler = () => props.handleChange(props.path, undefined);
    }

    const enabled = (props as { enabled?: boolean }).enabled;
    return getTemplateWrapper(html`
        <or-replay-editor
            .datapoints="${data}"
            .duration="${duration}"
            .readonly="${enabled === false}"
            @or-replay-editor-changed="${onChanged}">
        </or-replay-editor>
    `, deleteHandler);
};

export const replayRendererRegistryEntry: JsonFormsRendererRegistryEntry = {
    tester: replayTester,
    renderer: replayRenderer,
};
