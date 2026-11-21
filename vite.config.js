import { resolve } from 'path';
import { defineConfig, normalizePath } from 'vite';

// Normalize drive letter to uppercase to match Node/Rollup on Windows
const cwd = process.cwd();
const normalizedCwd = normalizePath(cwd).replace(/^[a-z]:/i, (m) => m.toUpperCase());

const p = (rel) => normalizePath(resolve(normalizedCwd, rel));

export default defineConfig({
  root: normalizedCwd,
  publicDir: normalizePath(resolve(normalizedCwd, 'public')),
  build: {
    outDir: normalizePath(resolve(normalizedCwd, 'dist')),
    rollupOptions: {
      input: {
        main: p('index.html'),
        notFound: p('404.html'),
        admin: p('pages/admin-dashboard.html'),
        alur: p('pages/alur.html'),
        exam: p('pages/exam-room.html'),
        fitur: p('pages/fitur.html'),
        guru: p('pages/guru-dashboard.html'),
        kompatibilitas: p('pages/kompatibilitas.html'),
        proktor: p('pages/proktor-dashboard.html'),
        rbac: p('pages/rbac.html'),
        superadmin: p('pages/superadmin-dashboard.html'),
      },
    },
  },
});
