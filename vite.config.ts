import { defineConfig } from "vite";
import typegpu from "unplugin-typegpu/vite";
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [typegpu({}), react()], 
});
