# React Log Viewer

A modern, real-time log streaming application built with React, featuring virtualization for high-performance log display and Tilt-like service controls.

## Features

### 🚀 Real-time Log Streaming

- WebSocket-based real-time log streaming
- Automatic reconnection handling
- Live log updates with minimal latency

### 📊 Advanced Log Filtering

- **Service Filtering**: Filter logs by specific services
- **Level Filtering**: Filter by log levels (info, warn, error, debug)
- **Search Filtering**: Real-time text search in log messages
- **Type Filtering**: Separate real processes and mock services
- **Active Filter Indicators**: Visual feedback for applied filters

### 🎯 Virtualized Log Display

- **React Window**: High-performance virtualization for large log lists
- **Auto-scroll**: Automatic scrolling to latest logs
- **Pause/Resume**: Pause log streaming for analysis
- **Log Highlighting**: Color-coded logs by level and service type
- **Responsive Design**: Works on desktop and mobile

### 🎛️ Service Controls

- **Service Status**: Real-time status indicators
- **Service Actions**: Start services
- **Health Monitoring**: Service health indicators
- **Resource Metrics**: CPU, memory, uptime display
- **Expandable Details**: Click to see service details

### 📈 Live Statistics

- **Log Counts**: Total, errors, warnings, info, debug
- **Error Rates**: Percentage-based error and warning rates
- **Health Status**: Overall system health indicator
- **Service Count**: Number of active services

## Installation

1. **Install Dependencies**:

   ```bash
   cd react-log-viewer
   npm install
   ```

2. **Configure Backend URL (Optional)**:
   Create a `.env` file in the project root:

   ```bash
   VITE_BACKEND_URL=http://localhost:3001
   ```

3. **Start Development Server**:

   ```bash
   npm run dev
   ```

4. **Access the Application**:
   Open [http://localhost:3002](http://localhost:3002) in your browser

## Configuration

### Backend URL Configuration

The application uses a centralized URL configuration system located in `src/config/urls.ts`. This provides a single source of truth for all backend connections.

#### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_BACKEND_URL=http://localhost:3001
VITE_APP_TITLE=React Log Viewer
```

#### Configuration File

The main configuration is in `src/config/urls.ts`:

```typescript
export const BACKEND_CONFIG = {
  BASE_URL: import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",
  API: {
    SERVICES: "/api/services",
    PROCESS_ACTION: "/api/process-action",
    HEALTH: "/health",
  },
  SOCKET: {
    TRANSPORTS: ["websocket", "polling"],
    TIMEOUT: 5000,
  },
};
```

#### Usage

All components use the centralized configuration:

```typescript
import { getApiUrl, BACKEND_CONFIG } from "./config/urls";

// API calls
const response = await fetch(getApiUrl(BACKEND_CONFIG.API.SERVICES));

// Socket connection
const socket = io(getSocketUrl());
```

### Proxy Configuration

The application is configured to connect to the log server at `http://localhost:3001`. You can modify the proxy settings in `vite.config.ts` if needed.

## Usage

### Connecting to Log Server

1. Ensure your log server is running on port 3001
2. The React app will automatically connect via WebSocket
3. Connection status is displayed in the top-left corner

### Filtering Logs

1. **Search**: Use the search box to filter logs by text content
2. **Log Levels**: Click level buttons to show/hide specific log levels
3. **Services**: Check/uncheck services to filter by specific services

### Managing Services

1. **View Services**: Services are listed in the left sidebar
2. **Service Actions**: Click start buttons on service cards
3. **Service Details**: Click the expand arrow to see service metrics
4. **Health Status**: Monitor service health indicators

### Log Viewer Controls

1. **Auto-scroll**: Toggle automatic scrolling to latest logs
2. **Pause**: Pause log streaming for analysis
3. **Clear**: Clear all logs from the viewer
4. **Scroll to Bottom**: Jump to latest logs

## Architecture

### Components

- **App**: Main application component with state management
- **LogViewer**: Virtualized log display with controls
- **ServiceList**: Tilt-like service management interface
- **LogFilters**: Advanced filtering controls
- **ConnectionStatus**: WebSocket connection status
- **LogStats**: Real-time statistics and metrics

### State Management

- **Logs**: Array of log entries with virtualization
- **Services**: Service list with status and controls
- **Filters**: Active filter state
- **Connection**: WebSocket connection status
- **Stats**: Real-time log statistics

### Performance Features

- **React Window**: Virtualization for large log lists
- **Debounced Search**: Optimized search filtering
- **Memoized Components**: Efficient re-rendering
- **WebSocket Optimization**: Efficient real-time updates

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Project Structure

```
src/
├── components/          # React components
│   ├── LogViewer.tsx   # Main log display
│   ├── ServiceList.tsx # Service controls
│   ├── LogFilters.tsx  # Filtering interface
│   ├── ConnectionStatus.tsx
│   └── LogStats.tsx
├── types.ts            # TypeScript types
├── utils/              # Utility functions
│   └── cn.ts          # Class name utility
├── App.tsx            # Main app component
├── main.tsx           # React entry point
└── index.css          # Global styles
```

## Integration

This React app is designed to work with the existing shikamaro log streaming system. It connects to:

- **WebSocket**: `/socket.io` for real-time log streaming
- **REST API**: `/api/*` endpoints for service management
- **Process Management**: Service start actions

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT License - see LICENSE file for details
