import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerPiAdapter from "../../.agents/adapters/pi/journal-hook.js";

export default function djournalExtension(pi: ExtensionAPI) {
	registerPiAdapter(pi);
}
