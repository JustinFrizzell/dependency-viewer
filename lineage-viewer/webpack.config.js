const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: false,
  entry: path.resolve(__dirname, 'index.js'),
  output: { path: path.resolve(__dirname, '../dist'), filename: 'lineage-viewer.js' },
  optimization: {
    minimizer: [new TerserPlugin({
      extractComments: false,
      terserOptions: { format: { comments: /@license|@preserve|^!/i } },
    })],
  },
  performance: false,
  plugins: [
    new HtmlWebpackPlugin({ template: path.resolve(__dirname, 'index.html'), filename: 'lineage-viewer.html', inject: 'body', minify: false }),
    new HtmlInlineScriptPlugin(),
  ],
  module: { rules: [{ test: /\.css$/, use: ['style-loader', 'css-loader'] }] },
};
