import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        target: 'esnext'
    },
    base: '/',
    server: {
        // Local development only. Production is the static build served by nginx
        // at typhoon.tonyxtian.com (see `npm run deploy`).
        host: '127.0.0.1',
        port: 5176,
        strictPort: true
    }
})
