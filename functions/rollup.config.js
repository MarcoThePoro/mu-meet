import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import fs from 'fs';
import path from 'path';

const pkgPath = path.resolve(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath).toString());

export default {
  entry: 'src/index.js',
  format: 'cjs',
  dest: 'index.js',
  external: [
    ...Object.keys(pkg.dependencies).filter(dep => dep !== 'awaiting'),
    'assert',
  ],
  plugins: [
    resolve({ main: true, preferBuiltins: true }),
    commonjs({
      include: 'node_modules/**',
    }),
    json(),
    babel({
      // awaiting is made for node 7.x and must be transpiled to run on 6.x
      exclude: 'node_modules/!(awaiting)/**/*.*',
    }),
  ],
};
