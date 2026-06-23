/**
 * Creator / operator authoring — themed templates + the console panel for spinning up and
 * running branded competitions. Built on the events engine (read-only over org / VIP for
 * eligibility); all money moves through `core` in the events store. No separate money path.
 */

export { TEMPLATES, TEMPLATE_ORDER, draftFromTemplate, type DraftTemplate } from './authoring.js'

export { CompetitionsConsolePanel } from './ui/CreatorConsolePanel.js'
export { competitionsManifests } from './manifest.js'
