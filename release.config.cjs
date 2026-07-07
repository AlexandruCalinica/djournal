"use strict";

module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    "./scripts/analyze-release.cjs",
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    [
      "@semantic-release/github",
      {
        failComment: false,
        labels: false,
        releasedLabels: false,
        successComment: false,
      },
    ],
  ],
};
