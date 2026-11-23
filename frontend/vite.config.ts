import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// Everything the browser talks to lives on the Pipecat runner (backend/bot.py, port 7860):
// /api/*      dashboard REST + SSE, and the runner's own WebRTC offer route
// /start      creates a bot session
// /sessions/* per-session WebRTC signalling (offer / ICE candidates)
const backend = process.env.BACKEND_URL ?? 'http://localhost:7860'

const toBackend: ProxyOptions = {
  target: backend,
  // If the backend dies mid-stream, Vite logs ECONNRESET but leaves the browser's response open, so
  // the SSE client never notices and shows "Live" forever. Close it so EventSource can reconnect.
  configure: (proxy) =>
    proxy.on('error', (_err, _req, res) => {
      if (!('headersSent' in res) || res.headersSent) res.destroy()
    }),
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': toBackend,
      '/start': toBackend,
      '/sessions': toBackend,
    },
  },
})
