import * as path from 'node:path';
import * as fs from 'node:fs';
import HtmlWebpackPlugin = require('html-webpack-plugin');
import HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
import TerserPlugin = require('terser-webpack-plugin');
import type { Configuration } from 'webpack';

const config: Configuration = {
  mode: 'production',
  devtool: false,
  entry: path.resolve(__dirname, 'src/index.ts'),
  output: { path: path.resolve(__dirname, 'dist'), filename: 'dependency-viewer.js' },
  resolve: { extensions: ['.ts', '.js'] },
  optimization: {
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: { format: { comments: /@license|@preserve|^!/i } },
      }),
    ],
  },
  performance: false,
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/index.html'),
      filename: 'dependency-viewer.html',
      inject: 'body',
      minify: false,
      projectLicense: fs.readFileSync(path.resolve(__dirname, 'LICENSE'), 'utf8'),
      thirdPartyNotices: fs.readFileSync(path.resolve(__dirname, 'THIRD_PARTY_NOTICES.txt'), 'utf8'),
    }),
    new HtmlInlineScriptPlugin(),
  ],
  module: {
    rules: [
      { test: /\.ts$/, use: { loader: 'esbuild-loader', options: { target: 'es2020' } }, exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
};

export = config;
