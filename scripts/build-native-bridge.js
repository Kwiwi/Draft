const esbuild = require('esbuild');
const path = require('path');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'native-entry.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(__dirname, '..', 'vendor', 'draft-native.js'),
  platform: 'browser',
  logLevel: 'info'
});
