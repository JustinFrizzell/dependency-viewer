const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: false,
  entry: path.resolve(__dirname, 'src/index.js'),
  output: { path: path.resolve(__dirname, 'dist'), filename: 'dependency-viewer.js' },
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
  module: { rules: [{ test: /\.css$/, use: ['style-loader', 'css-loader'] }] },
};
