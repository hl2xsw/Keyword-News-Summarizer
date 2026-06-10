import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// peaceful silence of the development proxy HMR websocket warnings in AI Studio preview mode
if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
  try {
    const OriginalWebSocket = window.WebSocket;
    class MockViteWebSocket {
      url: string;
      readyState: number = 3; // CLOSED
      onclose: any = null;
      onerror: any = null;
      onmessage: any = null;
      onopen: any = null;

      constructor(url: string, protocols?: string | string[]) {
        this.url = url;
        if (url.includes('vite') || url.includes('3000')) {
          setTimeout(() => {
            if (typeof this.onclose === 'function') {
              this.onclose({ wasClean: true, code: 1000, reason: "Bypassed HMR in preview sandbox mode" });
            }
          }, 50);
        } else {
          return new OriginalWebSocket(url, protocols) as any;
        }
      }
      addEventListener(type: string, listener: any) {
        if (type === 'close') this.onclose = listener;
        if (type === 'error') this.onerror = listener;
        if (type === 'message') this.onmessage = listener;
        if (type === 'open') this.onopen = listener;
      }
      removeEventListener() {}
      send() {}
      close() {}
    }
    
    try {
      Object.defineProperty(window, 'WebSocket', {
        value: MockViteWebSocket,
        configurable: true,
        writable: true
      });
    } catch {
      (window as any).WebSocket = MockViteWebSocket;
    }
  } catch (err) {
    console.log("[Notice] WebSocket configuration bypassed due to context limitations.");
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

