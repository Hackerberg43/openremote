# or-live-chart

A real-time live chart component for OpenRemote that displays moving timeframe data using Apache ECharts.

## Features

- **Real-time data visualization** with moving time window
- **Configurable timeframes**: 5 minutes, 30 minutes, or 1 hour
- **Configurable refresh intervals**: 1 second or 1 minute
- **Automatic data gap filling** when no attribute events are received
- **Current value display** with asset icon and units
- **Visual design** based on or-attribute-card layout
- **ECharts integration** with smooth line charts and tooltips
- **Live status indicator** showing connection state

## Usage

### Basic Usage

```html
<or-live-chart 
    assetId="your-asset-id" 
    attributeName="your-attribute-name">
</or-live-chart>
```

### With Configuration

```html
<or-live-chart 
    assetId="your-asset-id" 
    attributeName="your-attribute-name"
    timeframe="30minutes"
    refreshInterval="1minute">
</or-live-chart>
```

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `assetId` | `string` | - | ID of the asset to monitor |
| `attributeName` | `string` | - | Name of the attribute to display |
| `timeframe` | `"5minutes" \| "30minutes" \| "1hour"` | `"30minutes"` | Time window to display |
| `refreshInterval` | `"1second" \| "1minute"` | `"1minute"` | Fixed refresh rate for data updates |
| `disabled` | `boolean` | `false` | Whether the component is disabled |
| `realm` | `string` | - | Realm to use (defaults to current realm) |

## How it Works

1. **Initial Data Load**: Queries the database for historical data within the timeframe using interval query with AVG formula and gap filling
2. **Real-time Updates**: Subscribes to attribute events for live data
3. **Fixed Refresh Rate**: Updates the chart at fixed intervals (refreshInterval), using:
   - The last received attribute event value if available
   - The previous value if no events received within the interval (gap filling)
   - Only the last event if multiple events received within the interval
4. **Moving Window**: Maintains a sliding time window, removing old data points as new ones are added

## Data Flow

```
Database Query (Initial) → ECharts Display
         ↓
Attribute Events → Fixed Timer → Data Processing → Chart Update
                     ↓
                Gap Filling Logic
```

## Dependencies

- `@openremote/core`
- `@openremote/model` 
- `@openremote/or-icon`
- `@openremote/or-mwc-components`
- `@openremote/or-components`
- `@openremote/or-translate`
- `echarts`
- `lit`
- `moment`