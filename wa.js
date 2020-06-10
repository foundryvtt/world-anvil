import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilBrowser from "./module/journal.js";
import {importArticle} from "./module/framework.js";


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

  // Add the World Anvil Button
  const button = $(`<button type="button" id="world-anvil">
    <img src="modules/world-anvil/icons/wa-icon.svg" title="${game.i18n.localize("WA.SidebarButton")}"/>
  </button>`);
  button.on("click", ev => {
    const anvil = game.modules.get("world-anvil").anvil;
    if ( anvil.worldId ) {
      const journal = new WorldAnvilBrowser();
      journal.render(true);
    } else {
      const config = new WorldAnvilConfig();
      config.render(true);
    }
  });
  html.find(".directory-footer").append(button);

  // Re-render the browser, if it's active
  const browser = Object.values(ui.windows).find(a => a.constructor === WorldAnvilBrowser);
  if ( browser ) browser.render(false);
});


/* -------------------------------------------- */


/**
 * Augment rendered Journal sheets to add WorldAnvil content
 */
Hooks.on("renderJournalSheet", (app, html, data) => {
  const entry = app.object;
  const articleId = entry.getFlag("world-anvil", "articleId");
  if ( !articleId ) return;

  // Add header button to re-sync
  let title = html.find(".window-title");
  if ( title ) {
    const sync = $(`<a class="wa-sync"><i class="fas fa-sync"></i>WA Sync</a>`);
    sync.on("click", event => {
      event.preventDefault();
      importArticle(articleId, {entry});
    });
    title.after(sync);
  }

  // Activate cross-link listeners
  html.find(".wa-link").click(event => {
    event.preventDefault();
    const articleId = event.currentTarget.dataset.articleId;
    const entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
    if ( entry ) entry.sheet.render(true);
    else importArticle(articleId, {renderSheet: true});
  });
});