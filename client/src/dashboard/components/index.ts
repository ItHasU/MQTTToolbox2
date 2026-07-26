/**
 * Registers every dashboard web component (Dagda ROADMAP tranche 4,
 * FEATURES §6.1) — imported once, for its side effects, before a dashboard's
 * own HTML is ever rendered, the same way `registerAppFieldEditors()` is
 * called before the publish page's template can reference a field editor.
 */
import "./mqtt-value";
import "./mqtt-json";
import "./mqtt-date";
import "./mqtt-age";
import "./mqtt-if";
