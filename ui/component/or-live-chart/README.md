# or-live-chart

A real-time live chart component for OpenRemote that displays moving timeframe data using Apache ECharts.

## Features

- **Real-time data visualization** with moving time window
- **Configurable timeframes**: 5 minutes, 30 minutes, or 1 hour
- **Configurable refresh intervals**: 1 second or 1 minute
- **Automatic data gap filling** when no attribute events are received
- **Current value display** with asset icon and units
- **Additional attribute indicators** up to 6 attributes (3 string + 3 numeric) in a 2x3 grid layout with custom icons and status-based color coding
- **Error state visualization** with smooth flashing border and glow effect when error thresholds are exceeded
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

### With Additional Attribute Indicators (2x3 Grid)

```html
<or-live-chart 
    assetId="your-asset-id" 
    attributeName="your-attribute-name"
    .numericAttributes="${[
        {
            assetId: 'temp-sensor-id',
            attributeName: 'temperature',
            icon: 'thermometer',
            upperThreshold: 80,
            lowerThreshold: 10
        },
        {
            assetId: 'pressure-sensor-id', 
            attributeName: 'pressure',
            icon: 'gauge',
            upperThreshold: 100
        }
    ]}"
    .stringAttributes="${[
        {
            assetId: 'status-sensor-id',
            attributeName: 'connectionStatus',
            icon: 'connection',
            okValues: ['connected', 'online'],
            warningValues: ['connecting'],
            errorValues: ['disconnected', 'offline']
        }
    ]}">
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
| `additionalAttributes` | `AdditionalAttribute[]` | `[]` | Legacy: Array of additional attributes (use numericAttributes/stringAttributes instead) |
| `numericAttributes` | `NumericAdditionalAttribute[]` | `[]` | Array of numeric attributes for right column (max 3) |
| `stringAttributes` | `StringAdditionalAttribute[]` | `[]` | Array of string attributes for left column (max 3) |

### NumericAdditionalAttribute Interface (Right Column)

| Property | Type | Description |
|----------|------|--------------|
| `assetId` | `string` | ID of the asset containing the attribute |
| `attributeName` | `string` | Name of the attribute to monitor |
| `icon` | `string` | Icon name to display (from or-icon library) |
| `upperThreshold` | `number?` | Upper threshold - values above this show as error (red) |
| `lowerThreshold` | `number?` | Lower threshold - values below this show as error (red) |

### StringAdditionalAttribute Interface (Left Column)

| Property | Type | Description |
|----------|------|--------------|
| `assetId` | `string` | ID of the asset containing the attribute |
| `attributeName` | `string` | Name of the attribute to monitor |
| `icon` | `string` | Icon name to display (from or-icon library) |
| `okValues` | `string[]?` | String values that indicate OK status (green) |
| `warningValues` | `string[]?` | String values that indicate warning status (orange) |
| `errorValues` | `string[]?` | String values that indicate error status (red) |

### Status Colors

**For Numeric Attributes:**
- **Green (ok)**: Value is within acceptable range
- **Orange (warning)**: Value is approaching thresholds (within 10% of threshold)
- **Red (error)**: Value has exceeded thresholds - causes border flashing

**For String Attributes:**
- **Green (ok)**: Value matches any string in `okValues` array
- **Orange (warning)**: Value matches any string in `warningValues` array  
- **Red (error)**: Value matches any string in `errorValues` array - causes border flashing

### Layout

The controls area uses a **2x3 grid layout**:
- **Left Column**: String attributes (aligned left) + Status indicator (top-left)
- **Right Column**: Numeric attributes with units (aligned right)

## How it Works

1. **Initial Data Load**: Queries the database for historical data within the timeframe using interval query with AVG formula and gap filling
2. **Real-time Updates**: Subscribes to attribute events for live data
3. **Fixed Refresh Rate**: Updates the chart at fixed intervals (refreshInterval), using:
   - The last received attribute event value if available
   - The previous value if no events received within the interval (gap filling)
   - Only the last event if multiple events received within the interval
4. **Moving Window**: Maintains a sliding time window, removing old data points as new ones are added
5. **Additional Attributes**: Monitors up to 6 additional attributes (3 string + 3 numeric) in a 2x3 grid with real-time status checking and indicators using dedicated sub-components for optimal performance

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