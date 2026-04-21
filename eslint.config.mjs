// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      files: ["chrome-extension/**/*.js"],
      languageOptions: {
        globals: {
          atob: "readonly",
          chrome: "readonly",
          clearTimeout: "readonly",
          console: "readonly",
          fetch: "readonly",
          history: "readonly",
          location: "readonly",
          setTimeout: "readonly",
          URLSearchParams: "readonly",
          window: "readonly",
        },
      },
    },
    {
      files: ["addon/content/**/*.js"],
      languageOptions: {
        globals: {
          document: "readonly",
          window: "readonly",
          Zotero: "readonly",
        },
      },
    },
  ],
});
