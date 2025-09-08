import { useState, useEffect, useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import { ConnectionStatus } from "../types";
import { SocketService, SocketEventHandlers } from "../services/SocketService";
import { createErrorLog } from "./useLogs";
import { LoggingConfig, isWebUiLoggingEnabled } from "../config/logging";

export interface UseSocketConnectionReturn {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
}

export const useSocketConnection = (
  onLogMessage: (log: any) => void,
  onServicesUpdate: (services: any[]) => void,
  loggingConfig?: LoggingConfig
): UseSocketConnectionReturn => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    connecting: false,
  });

  const socketServiceRef = useRef<SocketService | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketServiceRef.current?.isConnected()) {
      return;
    }

    setConnectionStatus({ connected: false, connecting: true });

    // Create new socket service instance
    socketServiceRef.current = new SocketService();

    // Set up event handlers
    const eventHandlers: SocketEventHandlers = {
      onConnect: (connectedSocket: Socket) => {
        setConnectionStatus({ connected: true, connecting: false });
        setSocket(connectedSocket);
      },

      onDisconnect: () => {
        setConnectionStatus({ connected: false, connecting: false });
        setSocket(null);
      },

      onConnectError: (error: Error) => {
        setConnectionStatus({
          connected: false,
          connecting: false,
          error: error.message,
        });

        // Add error log only if web UI logging is enabled
        if (loggingConfig && isWebUiLoggingEnabled(loggingConfig)) {
          const errorLog = createErrorLog(error.message);
          onLogMessage(errorLog);
        }
      },

      onLogMessage: (logMessage: any) => {
        // Only process log messages if web UI logging is enabled
        if (loggingConfig && isWebUiLoggingEnabled(loggingConfig)) {
          onLogMessage(logMessage);
        }
      },

      onServicesUpdate: (servicesData: any[]) => {
        onServicesUpdate(servicesData);
      },
    };

    socketServiceRef.current.setEventHandlers(eventHandlers);
    const connectedSocket = socketServiceRef.current.connect();
    setSocket(connectedSocket);
  }, [onLogMessage, onServicesUpdate, loggingConfig]);

  const disconnect = useCallback(() => {
    if (socketServiceRef.current) {
      socketServiceRef.current.disconnect();
      socketServiceRef.current = null;
    }
    setSocket(null);
    setConnectionStatus({ connected: false, connecting: false });
  }, []);

  // Reconnect when logging configuration changes
  useEffect(() => {
    if (socketServiceRef.current?.isConnected()) {
      // Update event handlers with new configuration
      const eventHandlers: SocketEventHandlers = {
        onConnect: (connectedSocket: Socket) => {
          setConnectionStatus({ connected: true, connecting: false });
          setSocket(connectedSocket);
        },

        onDisconnect: () => {
          setConnectionStatus({ connected: false, connecting: false });
          setSocket(null);
        },

        onConnectError: (error: Error) => {
          setConnectionStatus({
            connected: false,
            connecting: false,
            error: error.message,
          });

          // Add error log only if web UI logging is enabled
          if (loggingConfig && isWebUiLoggingEnabled(loggingConfig)) {
            const errorLog = createErrorLog(error.message);
            onLogMessage(errorLog);
          }
        },

        onLogMessage: (logMessage: any) => {
          // Only process log messages if web UI logging is enabled
          if (loggingConfig && isWebUiLoggingEnabled(loggingConfig)) {
            onLogMessage(logMessage);
          }
        },

        onServicesUpdate: (servicesData: any[]) => {
          onServicesUpdate(servicesData);
        },
      };

      socketServiceRef.current.setEventHandlers(eventHandlers);
    }
  }, [loggingConfig, onLogMessage, onServicesUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    socket,
    connectionStatus,
    connect,
    disconnect,
    isConnected: connectionStatus.connected,
  };
};
