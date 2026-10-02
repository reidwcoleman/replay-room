import { defineConfig } from 'vite';
export default defineConfig({ base: process.env.GH_PAGES ? '/replay-room/' : '/', build: { target: 'es2022' } });
