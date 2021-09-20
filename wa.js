import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilBrowser from "./module/journal.js";
import {importArticle, WAMethods} from "./module/framework.js";


/**
 * Initialization actions taken on Foundry Virtual Tabletop client init.
 */
Hooks.once("init", () => {

  console.log('WA-Anvil | Initializing World Anvil Module');
  
  // Register settings menu
  WorldAnvilConfig.registerSettings();

  // Register the World Anvil module
  const module = game.modules.get("world-anvil");
  module.anvil = new WorldAnvil();

  // Register some helper functions
  module.importArticle = importArticle;
  module.helpers = new WAMethods();
});


/* -------------------------------------------- */


/**
 * Initialization actions taken once data sources are ready
 */
Hooks.once("ready", () => {
  if ( !game.user.isGM ) return;

  // Connect to World Anvil
  const anvil = game.modules.get("world-anvil").anvil;
  anvil.connect();
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
      const journal = new WorldAnvilBrowser();
      journal.render(true);
    } else {
      const config = new WorldAnvilConfig();
      config.render(true);
    }
  });
  html.find(".directory-header .action-buttons").append(button);

  // Re-render the browser, if it's active
  const browser = Object.values(ui.windows).find(a => a.constructor === WorldAnvilBrowser);
  if ( browser ) browser.render(false);
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

  const useSecrets = game.settings.get("world-anvil", "useSecrets") ?? false;
  const secretsSearch = html.find('.wa-secrets');
  const displaySecrets = entry.getFlag("world-anvil", "secretsDisplayed") ?? false;

  const title = html.find(".window-title");
  if (title) {

    if( useSecrets ) {
      // Add button to display or hide secrets
      if ( secretsSearch.length > 0 && game.user.isGM ) {
        const secretIcon = displaySecrets ? 'fa-lock' : 'fa-lock-open';
        const secretLabel = displaySecrets ? game.i18n.localize("WA.Secrets.Hide.Btn") : game.i18n.localize("WA.Secrets.Display.Btn");
        const secretBtn = $(`<a class="wa-secret-btn"><i class="fas ${secretIcon}"></i>${secretLabel}</a>`);
        secretBtn.on("click", async (event) => {
          event.preventDefault();
          await entry.setFlag("world-anvil", "secretsDisplayed", !displaySecrets);
          await importArticle(articleId, {entry: entry});
          //FIXME : I don't understand why Journal header is not refreshed.
        });
        title.after(secretBtn);
      }
    }

    // Add header button to re-sync (GM Only)
    if ( game.user.isGM ) {
      html.addClass("world-anvil");
      const sync = $(`<a class="wa-sync"><i class="fas fa-sync"></i>${game.i18n.localize("WA.Sync")}</a>`);
      sync.on("click", event => {
        event.preventDefault();
        importArticle(articleId, {entry: entry});
      });
      title.after(sync);
    }

    // Add WA shortcut on header
    const linkOnHeader = game.settings.get("world-anvil", "linkOnHeader");
    const linkOutsideGMs = game.settings.get("world-anvil", "linkOutsideGMs");
    const articleURL = entry.getFlag("world-anvil", "articleURL");
    if(articleURL && linkOnHeader) {
      if( game.user.isGM || linkOutsideGMs ) {
        const link = $(`<a id="wa-external-link" href="${articleURL}"><i class="fas fa-external-link-alt"></i>${game.i18n.localize("WA.OnWA")}</a>`);
        title.after(link);
      }
    }
  }

  // Hide seeds to non-gm players
  if(useSecrets && !displaySecrets && !game.user.isGM) {
    secretsSearch.hide();
  }

  // Activate cross-link listeners
  const waHelpers = game.modules.get("world-anvil").helpers;
  html.find(".wa-link").click(event => waHelpers.displayWALink(event));

  // Scroll to registered anchor if needed
  waHelpers.scrollToRegisteredAnchor(articleId, app);
});

/**
 * Hide secrets on generated Actor sheet if needed
 */
Hooks.on("renderActorSheet", (app, html, data) => {

  // Get the rendered Journal entry
  const actor = app.object;
  const articleId = actor.getFlag("world-anvil", "articleId");
  if ( !articleId ) return;

  const entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
  const displaySecrets = entry?.getFlag("world-anvil", "secretsDisplayed") ?? false;

  const secretsSearch = html.find('.wa-secrets');

  // Add link to journal entry
  const title = html.find(".window-title");
  if (title) {

    if(entry) {
      const link = $(`<a class="wa-journal"><i class="fas fa-book"></i>${game.i18n.localize("WA.JournalEntry")}</a>`);
      link.on("click", event => {
        event.preventDefault();
        entry.sheet.render(true);
      });
      title.after(link);
    }
  }

  // Hide seeds to non-gm players
  if(!displaySecrets && !game.user.isGM) {
    secretsSearch.hide();
  }
});
