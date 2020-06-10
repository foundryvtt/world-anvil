import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilJournal from "./module/journal.js";

/**
 * Initialization actions taken on Foundry Virtual Tabletop client init.
 */
Hooks.once("init", () => {

  // Register settings menu
  WorldAnvilConfig.registerSettings();

  // Register the World Anvil module
  const module = game.modules.get("world-anvil");
  module.anvil = new WorldAnvil();
});


/* -------------------------------------------- */


/**
 * Initialization actions taken once data sources are ready
 */
Hooks.once("ready", () => {

  // Connect to World Anvil, if the user can create Journal content
  if ( game.user.can("JOURNAL_CREATE") ) {
    const anvil = game.modules.get("world-anvil").anvil;
    anvil.connect();
  }
});


/* -------------------------------------------- */


/**
 * Add the World Anvil configuration button to the Journal Directory
 */
Hooks.on("renderJournalDirectory", (app, html, data) => {
  const button = $(`<button type="button" id="world-anvil">
    <img src="modules/world-anvil/icons/wa-icon.svg" title="${game.i18n.localize("WA.SidebarButton")}"/>
  </button>`);
  button.on("click", ev => {
    const anvil = game.modules.get("world-anvil").anvil;
    if ( anvil.worldId ) {
      const journal = new WorldAnvilJournal();
      journal.render(true);
    } else {
      const config = new WorldAnvilConfig();
      config.render(true);
    }
  });
  html.find(".directory-footer").append(button);
});


/* -------------------------------------------- */
