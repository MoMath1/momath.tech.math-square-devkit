// © 2026 National Museum of Mathematics. All rights reserved.
import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

// --- Discover behavior entry points ---
const behFiles = readdirSync('behs')
  .filter(f => f.endsWith('.js'))
  .map(f => `behs/${f}`);

const entryPoints = ['main.ts', ...behFiles];

// --- esbuild configuration ---
const buildOptions = {
  entryPoints,
  outdir: DIST,
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'chrome126',
  platform: 'browser',
  sourcemap: false,
  minify: true,
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

// --- Run type checking ---
function typeCheck() {
  try {
    execSync('npx tsc --noEmit', { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// --- Main build ---
async function build() {
  console.log('Building production bundle...');

  try {
    // Run esbuild
    const result = await esbuild.build(buildOptions);

    if (result.errors.length > 0) {
      console.error('esbuild errors:', result.errors);
      process.exit(1);
    }

    if (result.warnings.length > 0) {
      console.warn('esbuild warnings:', result.warnings);
    }

    console.log(`Bundled ${entryPoints.length} entry points to ${DIST}/`);

    // Copy static assets and transform HTML
    copyAssets();
    console.log('Static assets copied and HTML files transformed.');

    // Run type checking
    console.log('Running type check...');
    const typeCheckPassed = typeCheck();
    if (!typeCheckPassed) {
      console.error('Type checking failed.');
      process.exit(1);
    }
    console.log('Type check passed.');

    console.log('Production build complete.');
    process.exit(0);
  } catch (err) {
    console.error('Build failed:', err.message || err);
    process.exit(1);
  }
}

build();
