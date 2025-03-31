const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./src/index.ts", // Your main TypeScript file
  devtool: "inline-source-map",
  mode: "development", // Use 'production' for releases
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true, // Clean the dist folder before each build
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"), // Serve from dist
    },
    compress: true,
    port: 9000,
    hot: true, // Enable hot module replacement
    liveReload: true, // Enable live reloading
    watchFiles: ["src/**/*"], // Watch all files in src directory
    client: {
      overlay: true, // Show errors in browser
    },
    open: {
      target: ["index.html"],
      app: {
        name: "chrome",
        arguments: ["--new-window"],
      },
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    },
  },
  plugins: [
    // Copy assets from 'assets' folder to 'dist/assets'
    new CopyPlugin({
      patterns: [{ from: "assets", to: "assets" }],
    }),
    // Generate an index.html file
    new HtmlWebpackPlugin({
      template: "src/index.html", // Path to your template index.html
    }),
  ],
};
