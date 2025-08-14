# or-live-chart Usage Examples

## Basic Usage

### HTML
```html
<!-- Basic usage with default settings (30 minutes, 1 minute refresh) -->
<or-live-chart 
    assetId="your-asset-id" 
    attributeName="temperature">
</or-live-chart>

<!-- Custom configuration -->
<or-live-chart 
    assetId="sensor-001" 
    attributeName="humidity"
    timeframe="5minutes"
    refreshInterval="1second">
</or-live-chart>
```

### JavaScript
```javascript
// Create programmatically
const liveChart = document.createElement('or-live-chart');
liveChart.assetId = 'sensor-001';
liveChart.attributeName = 'temperature';
liveChart.timeframe = '1hour';
liveChart.refreshInterval = '1minute';
document.body.appendChild(liveChart);

// Update configuration dynamically
liveChart.timeframe = '30minutes';
liveChart.refreshInterval = '1second';
```

### TypeScript/Lit Element
```typescript
import '@openremote/or-live-chart';

// In your render method
render() {
    return html`
        <or-live-chart 
            .assetId="${this.selectedAssetId}"
            .attributeName="${this.selectedAttribute}"
            timeframe="30minutes"
            refreshInterval="1minute"
            ?disabled="${!this.isConnected}">
        </or-live-chart>
    `;
}
```

## Integration Examples

### Dashboard Widget
```typescript
import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import '@openremote/or-live-chart';

@customElement('sensor-dashboard-widget')
export class SensorDashboardWidget extends LitElement {
    @property() assetId: string;
    @property() attributeName: string;
    
    render() {
        return html`
            <div class="widget-container">
                <h3>Live Sensor Data</h3>
                <or-live-chart
                    .assetId="${this.assetId}"
                    .attributeName="${this.attributeName}"
                    timeframe="30minutes"
                    refreshInterval="1minute">
                </or-live-chart>
            </div>
        `;
    }
}
```

### Multi-sensor Display
```typescript
render() {
    return html`
        <div class="sensors-grid">
            ${this.sensors.map(sensor => html`
                <or-live-chart
                    .assetId="${sensor.id}"
                    .attributeName="${sensor.attribute}"
                    timeframe="5minutes"
                    refreshInterval="1second"
                    style="height: 300px; width: 100%;">
                </or-live-chart>
            `)}
        </div>
    `;
}
```

## Styling

### CSS Custom Properties
```css
or-live-chart {
    /* Background color */
    --or-live-chart-background-color: #ffffff;
    
    /* Border color */
    --or-live-chart-border-color: #e0e0e0;
    
    /* Text color */
    --or-live-chart-text-color: #333333;
    
    /* Chart line color */
    --or-live-chart-graph-line-color: #2196f3;
}
```

### Component Sizing
```css
or-live-chart {
    height: 400px;
    width: 100%;
    max-width: 800px;
}

.chart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.chart-grid or-live-chart {
    height: 250px;
}
```

## Event Handling

The component uses OpenRemote's event system internally, but you can listen to standard DOM events:

```typescript
const liveChart = document.querySelector('or-live-chart');

// Listen for component ready
liveChart.addEventListener('or-chart-event', (event) => {
    console.log('Chart event:', event.detail);
});

// Component lifecycle
liveChart.addEventListener('DOMNodeInserted', () => {
    console.log('Chart component added to DOM');
});
```

## Configuration Options

| Property | Type | Options | Default | Description |
|----------|------|---------|---------|-------------|
| `timeframe` | `string` | `"5minutes"`, `"30minutes"`, `"1hour"` | `"30minutes"` | Time window to display |
| `refreshInterval` | `string` | `"1second"`, `"1minute"` | `"1minute"` | Update frequency |
| `assetId` | `string` | Any valid asset ID | - | Asset to monitor |
| `attributeName` | `string` | Any valid attribute name | - | Attribute to display |
| `disabled` | `boolean` | `true`, `false` | `false` | Disable the component |
| `realm` | `string` | Any valid realm | Current realm | Realm to use |

## Real-world Examples

### Temperature Monitoring
```html
<or-live-chart 
    assetId="hvac-sensor-01" 
    attributeName="temperature"
    timeframe="1hour"
    refreshInterval="1minute">
</or-live-chart>
```

### High-frequency Data (IoT Sensor)
```html
<or-live-chart 
    assetId="vibration-sensor-01" 
    attributeName="acceleration"
    timeframe="5minutes"
    refreshInterval="1second">
</or-live-chart>
```

### Energy Consumption Monitoring
```html
<or-live-chart 
    assetId="smart-meter-01" 
    attributeName="power"
    timeframe="30minutes"
    refreshInterval="1minute">
</or-live-chart>
```