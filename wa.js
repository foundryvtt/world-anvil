import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilBrowser from "./module/journal.js";
import * as api from "./module/framework.js";

let module = undefined;

/**
 * Initialization actions taken on Foundry Virtual Tabletop client init.
 */
Hooks.once("init", () => {
  module = game.modules.get("world-anvil");

  // Register settings menu
  WorldAnvilConfig.registerSettings();

  /**
   * A singleton instance of the WorldAnvil client
   * @type {WorldAnvil}
   */
  module.anvil = new WorldAnvil();

  /**
   * A singleton instance of the WorldAnvilBrowser UI for importing content
   * @type {WorldAnvilBrowser}
   */
  module.browser = new WorldAnvilBrowser();

  /**
   * A singleton instance of the WorldAnvilConfig UI for configuring account integration
   * @type {WorldAnvilConfig}
   */
  module.config = new WorldAnvilConfig();

  // Register some helper functions
  module.api = api;
});


/* -------------------------------------------- */


/**
 * Initialization actions taken once data sources are ready
 */
Hooks.once("ready", () => {
  if ( !game.user.isGM ) return;
  return module.anvil.connect();
});


/* -------------------------------------------- */


/**
 * Add the World Anvil configuration button to the Journal Directory
 */
Hooks.on("renderJournalDirectory", (app, html, data) => {
  if ( !game.user.isGM ) return;

  // Add the World Anvil Button
  const button = $(`<button type="button" id="world-anvil">
    <img src="modules/world-anvil/icons/wa-icon.svg" title="${game.i18n.localize("WA.SidebarButton")}"/>
  </button>`);
  button.on("click", ev => {
    const anvil = game.modules.get("world-anvil").anvil;
    if ( anvil.worldId ) {
      module.browser.render(true);
    } else {
      module.config.render(true);
    }
  });
  html.find(".directory-header .action-buttons").append(button);

  // Re-render the browser, if it's active
  module.browser.render(false);
});


/* -------------------------------------------- */


/**
 * Augment rendered Journal sheets to add WorldAnvil content
 */
Hooks.on("renderJournalSheet", (app, html, data) => {

  // Get the rendered Journal entry
  const entry = app.object;
  const articleId = entry.getFlag("world-anvil", "articleId");
  if ( !articleId ) return;

  const title = html.find(".window-title");
  if (title) {

    // Add header button to re-sync (GM Only)
    if ( game.user.isGM ) {
      html.addClass("world-anvil");
      const sync = $(`<a class="wa-sync"><i class="fas fa-sync"></i>${game.i18n.localize("WA.Sync")}</a>`);
      sync.on("click", event => {
        event.preventDefault();
        return api.importArticle(articleId);
      });
      title.after(sync);
    }

    // Add WA shortcut on header
    const publicArticleLink = game.settings.get("world-anvil", "publicArticleLinks");
    const articleURL = entry.getFlag("world-anvil", "articleURL");
    if(articleURL) {
      if( game.user.isGM || publicArticleLink ) {
        const link = $(`<a id="wa-external-link" href="${articleURL}"><i class="fas fa-external-link-alt"></i>${game.i18n.localize("WA.OnWA")}</a>`);
        title.after(link);
      }
    }
  }

  // Activate cross-link listeners
  html.find(".wa-link").click(event => {
    event.preventDefault();
    const articleId = event.currentTarget.dataset.articleId;

    // View an existing linked article (OBSERVER+)
    const entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
    if ( entry ) {
      if ( !entry.hasPerm(game.user, "OBSERVER") ) {
        return ui.notifications.warn(game.i18n.localize("WA.NoPermissionView"));
      }
      return entry.sheet.render(true);
    }

    // Import a new article (GM Only)
    if ( !game.user.isGM ) {
      return ui.notifications.warn(game.i18n.localize("WA.NoPermissionView"));
    }
    return api.importArticle(articleId, {renderSheet: true});
  });
});
