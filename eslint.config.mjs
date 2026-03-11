import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Warn on missing deps in hooks (don't block build)
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [
      ".next/",
      "node_modules/",
      "netlify/",
      "supabase/",
      ".claude/",
    ],
  },
];

export default eslintConfig;
