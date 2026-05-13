import { action as huskyAction } from "../../husky/init/mod.js"
import { findMissingDependencies } from "../../../../utils/packageJson.js";
import {yarnCommands} from "../../../../utils/yarn.js";
import { copyDir } from "../../../../utils/fs.js";
import { LINT_TEMPLATES_PATH, ROOT_PATH } from "../../../../constants.js"


const REQUIRED_DEV_DEPENDENCIES = ["eslint", "eslint-config-rango", "@eslint/compat", "@eslint/eslintrc", "@eslint/js", "@typescript-eslint/eslint-plugin", "@typescript-eslint/parser", "eslint", "eslint-config-prettier", "eslint-plugin-destructuring", "eslint-plugin-import", "eslint-plugin-jsx-id-attribute-enforcement", "eslint-plugin-prettier", "eslint-plugin-react", "eslint-plugin-react-hooks"];

export async function action(_commandOptions: unknown) {

        // Husky should be installed.
        await huskyAction({ silent: true });


        // For linting some packages are required.
        const missingPackages = await findMissingDependencies(REQUIRED_DEV_DEPENDENCIES);
        if (missingPackages.length > 0) {
                await yarnCommands.add(missingPackages, "dev");
        }


        // Copy tempalates for eslint, lintstaged, commitlint
        copyDir(LINT_TEMPLATES_PATH, ROOT_PATH);
        console.log("ok, we are done.")
}




