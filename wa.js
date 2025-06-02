import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilPageNames from "./module/pagenames.js";
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

  /**
   * A singleton instance of the WAPageNames for accessing to user page names
   * @type {WorldAnvilPageNames}
   */
  module.pageNames = new WorldAnvilPageNames();

  // Register some helper functions
  module.api = api;
});


/* -------------------------------------------- */


/**
 * Initialization actions taken once data sources are ready
 */
Hooks.once("ready", async () => {
  if ( !game.user.isGM ) return;
  await api.loadTimelineTemplateInMemory();
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
    <img class="wa-icon-in-directory" src="modules/world-anvil/icons/wa-icon.svg" title="${game.i18n.localize("WA.SidebarButton")}" />
  </button>`);
  button.on("click", ev => {
    const anvil = game.modules.get("world-anvil").anvil;
    if ( anvil.worldId ) {
      module.browser.render(true);
    } else {
      module.config.render(true);
    }
  });
  $(html).find(".directory-header .action-buttons").append(button);

  // Re-render the browser, if it's active
  module.browser.render(false);
});


/* -------------------------------------------- */


/**
 * Augment rendered Journal sheets to add WorldAnvil content
 */
Hooks.on("renderJournalEntrySheet", (app, html, data) => {

  // Get the rendered Journal entry
  const entry = app.document;
  const articleId = entry.getFlag("world-anvil", "articleId");
  if ( !articleId ) return;

  const html$ = $(html);
  const title = html$.find(".window-title");
  if (title && !html$.hasClass("world-anvil")) {
    html$.addClass("world-anvil");

    // Add header button to re-sync (GM Only)
    if ( game.user.isGM ) {
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
});

Hooks.on("renderJournalEntryPageSheet", (app, html, data) => {

  // Activate cross-link listeners
  const html$ = $(html);
  activeTimelineToggles(app, html$);
  activateWALinks(html$);
});

function activateWALinks(html$) {

  const activateClick = (event) => {
    const articleId = event.currentTarget.dataset.articleId;
    if( !articleId ) {
      return;
    }
    event.stopPropagation();

    // View an existing linked article (OBSERVER+)
    const entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
    if ( entry ) {
      if ( !entry.testUserPermission(game.user, "OBSERVER") ) {
        return ui.notifications.warn(game.i18n.localize("WA.NoPermissionView"));
      }
      return entry.sheet.render(true);
    }

    // Import a new article (GM Only)
    if ( !game.user.isGM ) {
      return ui.notifications.warn(game.i18n.localize("WA.NoPermissionView"));
    }
    return api.importArticle(articleId, {renderSheet: true});
  };

  html$.find(".wa-link").click(activateClick);
  html$.find(".wa-tooltip").click(activateClick);
}

function activeTimelineToggles(app, html$) {

  // Only for WA articles
  const journalEntry = app.document.parent;
  if( ! journalEntry.getFlag("world-anvil", "articleId") ) return;

  const minimizedEntries = html$.find('.wa-section.timeline-content .timeline-entry.minimized');
  minimizedEntries.click(event => {
    const entryId = event.currentTarget.dataset.entry;
    const _maximized = event.currentTarget.parentElement.querySelector(`.maximized[data-entry="${entryId}"`);
    event.currentTarget.classList.add("hidden");
    _maximized.classList.remove("hidden");
  });

  const maximizedEntries = html$.find('.wa-section.timeline-content .timeline-entry.maximized .first-line');
  maximizedEntries.click(event => {
    const _maximized = event.currentTarget.parentElement;
    const entryId = _maximized.dataset.entry;
    const _minimized = _maximized.parentElement.querySelector(`.minimized[data-entry="${entryId}"`);
    _maximized.classList.add("hidden");
    _minimized.classList.remove("hidden");
  });
}
