# or-flow-grid Component

The `or-flow-grid` component creates a visual flow diagram with 4 fixed positions for `or-live-chart` components, connected to a central node with a lightning bolt icon. This component is perfect for displaying energy flow diagrams or similar interconnected system visualizations.

## Features

- **Fixed Layout**: 4 predefined positions (producers, storage, consumers, grid)
- **Central Node**: Blue circular node with lightning bolt icon representing the central hub
- **Responsive Connection Lines**: Dashed lines that dynamically connect each chart to the central node with proper routing (horizontal first, then angled)
- **Smart Positioning**: Lines automatically calculate connection points from actual chart element positions, scaling perfectly with any container size
- **Real-time Updates**: Connection lines recalculate automatically when container resizes or elements reposition
- **Live Charts**: Each position can contain a fully functional `or-live-chart` component

## Layout

The component follows this layout with perfect alignment:

```
[Producers]     
     |          
     |          
[Storage] ---- 💙⚡ ---- [Grid]
     |            
     |            
[Consumers]      
```

- **Storage**, **Grid**, and the **Central Node** are perfectly aligned at the same height
- **Producers** positioned above the central line
- **Consumers** positioned below the central line

## Usage

```typescript
import "@openremote/or-live-chart"; // This automatically includes or-flow-grid

<or-flow-grid
    .charts="${[
        {
            position: 'producers',
            assetId: 'your-producer-asset-id',
            attributeName: 'power',
            timeframe: '5minutes',
            refreshInterval: '1second',
            operatingStatus: 'running',
            linkUrl: 'http://localhost:9000/manager/#/assets/false/your-asset-id',
            statusMessage: 'Solar panels producing energy',
            additionalAttributes: [
                {
                    assetId: 'your-producer-asset-id',
                    attributeName: 'temperature',
                    icon: 'thermometer',
                    upperThreshold: 50,
                    lowerThreshold: 45
                }
            ]
        },
        {
            position: 'storage',
            assetId: 'your-storage-asset-id',
            attributeName: 'batteryLevel',
            // ... other properties
        },
        {
            position: 'consumers',
            assetId: 'your-consumer-asset-id',
            attributeName: 'consumption',
            // ... other properties
        },
        {
            position: 'grid',
            assetId: 'your-grid-asset-id',
            attributeName: 'gridPower',
            // ... other properties
        }
    ]}"
    style="height: 100%; width: 100%;">
</or-flow-grid>
```

## Properties

### FlowGridChart Interface

Each chart in the `charts` array should follow the `FlowGridChart` interface:

- `position`: `'producers' | 'storage' | 'consumers' | 'grid'` - The fixed position for this chart
- `assetId`: `string` - The asset ID for the live chart
- `attributeName`: `string` - The attribute name to display
- `timeframe?`: `"5minutes" | "30minutes" | "1hour"` - Chart timeframe (optional, defaults to "30minutes")
- `refreshInterval?`: `"1second" | "1minute"` - Refresh interval (optional, defaults to "1minute")
- `operatingStatus?`: `"running" | "dischargingOnly"` - Operating status (optional)
- `linkUrl?`: `string` - Link URL when chart is clicked (optional)
- `statusMessage?`: `string` - Status message to display (optional)
- `additionalAttributes?`: `AdditionalAttribute[]` - Additional attributes to show (optional)

### Component Properties

- `charts`: `FlowGridChart[]` - Array of chart configurations
- `disabled`: `boolean` - Whether the component is disabled (defaults to false)

## Styling

The component supports CSS custom properties for customization:

```css
or-flow-grid {
    --or-flow-grid-background-color: #f5f5f5;
    --or-flow-grid-text-color: #333;
    --or-flow-grid-line-color: #4CAF50;
}
```

## Example with All Positions

See the example in `/ui/component/or-dashboard-builder/src/widgets/kpi-widget.ts` for a complete implementation showing all 4 positions with different chart configurations.

## Technical Details

### Responsive Connection System
- **Dynamic Positioning**: Uses `ResizeObserver` and `MutationObserver` to detect changes and recalculate line positions
- **Accurate Connection Points**: Lines connect from chart edges to the central node with precise calculations
- **Real-time Updates**: Automatically adjusts when container size changes or charts reposition
- **Smart Routing**: Each position uses optimized connection routing:
  - **Producers**: Right edge → horizontal then diagonal to top-left of central node
  - **Storage**: Right edge → direct horizontal line to left edge of central node (same height)
  - **Consumers**: Right edge → horizontal then diagonal to bottom-left of central node
  - **Grid**: Left edge → direct horizontal line to right edge of central node (same height)

### Performance
- Efficient position calculations using `getBoundingClientRect()`
- Debounced updates to prevent excessive recalculations
- Optimized rendering with minimal DOM manipulation
- Adaptive line calculations that scale with container size
- Smart detection of alignment for direct vs. angled connections

## Notes

- If a chart is not provided for a position, a placeholder "No [Position] Chart" will be displayed with a dashed border
- Each chart position has a label above it (Producers, Storage, Consumers, Grid)
- Connection lines automatically scale with any container size - from small widgets to full-screen displays
- The central node is always positioned at the center of the container
- All `or-live-chart` features are available for each position including tooltips, status indicators, and additional attributes
- Lines will reconnect properly even if individual charts change size or the container is dynamically resized