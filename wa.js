import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilPageNames from "./module/pagenames.js";
import WorldAnvilBrowser from "./module/journal.js";
import * as api from "./module/framework.js";

let module = undefined;

/**
 * Initialization actions taken on Foundry Virtual Tabletop client init.
 */
Hooks.once("init", async () => {
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
  const button = document.createElement("button");
  button.type = "button";
  button.id = "world-anvil";
  button.innerHTML = `<img class="wa-theme-dependant" src="modules/world-anvil/icons/wa-icon.svg" title="${game.i18n.localize("WA.SidebarButton")}" />`;

  button.addEventListener("click", async ev => {
    if ( module.anvil.worldId ) {
      await module.anvil.getWorld(module.anvil.worldId);
      module.browser.render(true);
    } else {
      module.config.render(true);
    }
  });
  html.querySelectorAll(".directory-header .action-buttons").forEach( buttons => {
    buttons.append(button);
  });

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

  const title = html.querySelector(".window-title")
  if (title && !html.classList.contains("world-anvil")) {
    html.classList.add("world-anvil");

    // Add header button to re-sync (GM Only)
    if ( game.user.isGM ) {
      const sync = document.createElement("a");
      sync.classList.add("wa-sync");
      sync.innerHTML = `<i class="fas fa-sync"></i>${game.i18n.localize("WA.Sync")}`;
      sync.addEventListener("click", event => {
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
        const link = document.createElement("a");
        link.id ="external-link";
        link.href = articleURL;
        link.innerHTML = `<i class="fas fa-external-link-alt"></i>${game.i18n.localize("WA.OnWA")}`;
        title.after(link);
      }
    }
  }
});

Hooks.on("renderJournalEntryPageSheet", (app, html, data) => {

  // Activate cross-link listeners
  const html$ = $(html);
  activeTimelineToggles(app, html);
  activateWALinks(html);
});

function activateWALinks(html) {

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

  html.querySelectorAll(".wa-link, .wa-tooltip").forEach( link => {
    link.addEventListener("click", event => activateClick(event));
  });
}

function activeTimelineToggles(app, html) {

  // Only for WA articles
  const journalEntry = app.document.parent;
  if( ! journalEntry.getFlag("world-anvil", "articleId") ) return;

  html.querySelectorAll(".wa-section.timeline-content .timeline-entry.minimized").forEach( minimizedEntry => {
    minimizedEntry.addEventListener("click", event => {
      const entryId = event.currentTarget.dataset.entry;
      const _maximized = event.currentTarget.parentElement.querySelector(`.maximized[data-entry="${entryId}"`);
      event.currentTarget.classList.add("hidden");
      _maximized.classList.remove("hidden");
    });
  });

  html.querySelectorAll(".wa-section.timeline-content .timeline-entry.maximized .first-line").forEach( maximizedFirstLine => {
    maximizedFirstLine.addEventListener("click", event => {
      const _maximized = event.currentTarget.parentElement;
      const entryId = _maximized.dataset.entry;
      const _minimized = _maximized.parentElement.querySelector(`.minimized[data-entry="${entryId}"`);
      _maximized.classList.add("hidden");
      _minimized.classList.remove("hidden");
    });
  });
}
