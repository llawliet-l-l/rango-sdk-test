import path from "node:path";

export const ROOT_PATH = process.cwd();
export const TEMPLATES_PATH = path.join(process.cwd(), "templates");
export const HUSKY_TEMPLATES_PATH = path.join(TEMPLATES_PATH, 'husky');
export const LINT_TEMPLATES_PATH = path.join(TEMPLATES_PATH, 'lint');
export const FORMAT_TEMPLATES_PATH = path.join(TEMPLATES_PATH, 'format');
