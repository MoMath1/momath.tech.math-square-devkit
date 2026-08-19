// © 2026 National Museum of Mathematics. All rights reserved.
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

// --- Discover behavior entry points ---
const behFiles = readdirSync('behs')
  .filter(f => f.endsWith('.js'))
  .map(f => `behs/${f}`);

const entryPoints = ['main.ts', ...behFiles];

// --- Rebuild logger plugin ---
const rebuildLoggerPlugin = {
  name: 'rebuild-logger',
  setup(build) {
    let buildCount = 0;
    build.onEnd(result => {
      buildCount++;
      const timestamp = new Date().toLocaleTimeString();
      if (result.errors.length > 0) {
        console.error(`\n[${timestamp}] Rebuild #${buildCount} failed with ${result.errors.length} error(s):`);
        for (const err of result.errors) {
          const loc = err.location;
          if (loc) {
            console.error(`  ${loc.file}:${loc.line}:${loc.column} - ${err.text}`);
          } else {
            console.error(`  ${err.text}`);
          }
        }
        console.error('Last good bundle preserved.');
      } else {
        const warnings = result.warnings.length > 0 ? ` (${result.warnings.length} warning(s))` : '';
        console.log(`[${timestamp}] Rebuild #${buildCount} succeeded${warnings}`);
      }
    });
  },
};

// --- esbuild configuration for dev ---
const buildOptions = {
  entryPoints,
  outdir: DIST,
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'chrome126',
  platform: 'browser',
  sourcemap: true,
  minify: false,
  treeShaking: true,
  alias: {
    'sensors': './sensors.ts',
    'display': './display.ts',
    'floor': './floor.ts',
    'prod': './prod.json',
    'lib/noise': './lib/noise.js',
  },
  external: ['electron', 'electron-log'],
  loader: { '.json': 'json' },
  plugins: [rebuildLoggerPlugin],
};

// --- HTML transformation ---
function transformHtml(inputPath) {
  let html = readFileSync(inputPath, 'utf-8');

  // Remove SystemJS script tag
  html = html.replace(/[ \t]*<script src="packages\/system\.js"><\/script>\r?\n?/g, '');

  // Remove config.js script tag
  html = html.replace(/[ \t]*<script src="config\.js"><\/script>\r?\n?/g, '');

  // Remove inline SystemJS bootstrap script block
  html = html.replace(/[ \t]*<script>\s*function main\(\)\s*\{[^}]*\}\s*<\/script>\r?\n?/g, '');

  // Remove onload attribute from body
  html = html.replace(/<body\s+onload="main\(\)">/g, '<body>');

  // Add module script tag before </head> only if not already present
  if (!html.includes('<script type="module" src="main.js"></script>')) {
    html = html.replace('</head>', '    <script type="module" src="main.js"></script>\n  </head>');
  }

  return html;
}

// --- Copy static assets ---
function copyAssets() {
  mkdirSync(DIST, { recursive: true });

  // Write dist/package.json for Electron to find the app entry point
  // and to ensure app.js is treated as CommonJS (not affected by root "type": "module")
  writeFileSync(join(DIST, 'package.json'), JSON.stringify({
    name: "momath-devkit-mathsquare",
    main: "app.js",
    type: "commonjs"
  }, null, 2), 'utf-8');

  // Copy app.js unchanged
  copyFileSync('app.js', join(DIST, 'app.js'));

  // Copy style.css unchanged
  copyFileSync('style.css', join(DIST, 'style.css'));

  // Copy icon.png if it exists
  if (existsSync('icon.png')) {
    copyFileSync('icon.png', join(DIST, 'icon.png'));
  }

  // Copy prod.json for reference
  copyFileSync('prod.json', join(DIST, 'prod.json'));

  // Example behaviors may ship models / static files next to the source
  if (existsSync('examples')) {
    cpSync('examples', join(DIST, 'examples'), { recursive: true });
  }

  // ONNX Runtime Web WASM sidecars (loaded at runtime via ort.env.wasm.wasmPaths)
  const ortSrc = join('node_modules', 'onnxruntime-web', 'dist');
  if (existsSync(ortSrc)) {
    const ortDst = join(DIST, 'ort');
    mkdirSync(ortDst, { recursive: true });
    for (const f of readdirSync(ortSrc)) {
      if (f.endsWith('.wasm') || /^ort-wasm.*\.(mjs|js)$/.test(f)) {
        copyFileSync(join(ortSrc, f), join(ortDst, f));
      }
    }
  }

  // Transform and write HTML files
  for (const htmlFile of ['index.html', 'dev.html']) {
    if (existsSync(htmlFile)) {
      const transformed = transformHtml(htmlFile);
      writeFileSync(join(DIST, htmlFile), transformed, 'utf-8');
    }
  }
}

// --- Spawn Electron ---
function spawnElectron() {
  const electronProcess = spawn('npx', ['electron', './dist', '--dev'], {
    stdio: 'inherit',
    shell: true,
  });

  electronProcess.on('close', (code) => {
    console.log(`Electron process exited with code ${code}`);
    process.exit(code ?? 0);
  });

  electronProcess.on('error', (err) => {
    console.error('Failed to start Electron:', err.message);
  });

  return electronProcess;
}

// --- Main dev workflow ---
async function dev() {
  console.log('Starting development mode...');

  // Copy static assets and transform HTML on startup
  copyAssets();
  console.log('Static assets copied and HTML files transformed.');

  // Create esbuild context with watch mode
  const ctx = await esbuild.context(buildOptions);

  // Start watching for file changes
  await ctx.watch();
  console.log('esbuild watching for changes...');

  // Spawn Electron with --dev flag
  console.log('Launching Electron...');
  const electronProcess = spawnElectron();

  // Clean up on process exit
  process.on('SIGINT', async () => {
    console.log('\nStopping dev mode...');
    await ctx.dispose();
    electronProcess.kill();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await ctx.dispose();
    electronProcess.kill();
    process.exit(0);
  });
}

dev();
