import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `eslint-config-next` 16 ha portato `eslint-plugin-react-hooks` v7, che abilita
    // il nuovo set di regole "React Compiler" (set-state-in-effect, purity, immutability,
    // static-components, refs, use-memo). Sono regole di stile molto aggressive su pattern
    // React idiomatici già presenti in tutta l'app (setState dentro effect di sync,
    // Date.now() in render per lo stato "live", ecc.): non sono bug e la build passa.
    // Le disattiviamo a livello di progetto — un'adozione incrementale sarebbe un refactor
    // a parte. Restano ATTIVE `rules-of-hooks` (bug veri) ed `exhaustive-deps` (warning).
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/use-memo": "off",
    },
  },
]);

export default eslintConfig;
