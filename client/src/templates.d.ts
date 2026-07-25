/**
 * Component templates are plain HTML files imported as strings.
 * Served by html-loader in the bundle, and by a plugin in the test runner.
 * See packages/client/src/templates.d.ts in the framework.
 */
declare module "*.html" {
    const content: string;
    export default content;
}
