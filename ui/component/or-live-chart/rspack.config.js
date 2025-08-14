const path = require("path");

module.exports = {
    entry: "./lib/index.js",
    mode: "production",
    devtool: "source-map",
    module: {
        rules: [
            {
                test: /\.s[ac]ss$/i,
                use: ["lit-scss-loader", "sass-loader"],
            },
        ],
    },
    output: {
        filename: "index.bundle.js",
        path: path.resolve(__dirname, "dist", "umd"),
        library: "or-live-chart",
        libraryTarget: "umd"
    }
};