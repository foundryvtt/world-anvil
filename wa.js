import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";
import WorldAnvilBrowser from "./module/journal.js";
import * as api from "./module/framework.js";


/**
 * Initialization actions taken on Foundry Virtual Tabletop client init.
 */
Hooks.once("init", () => {

  // Register settings menu
  WorldAnvilConfig.registerSettings();

  // Register the World Anvil module
  const module = game.modules.get("world-anvil");
  module.anvil = new WorldAnvil();

  // Register some helper functions
  module.api = api;
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

  const title = html.find(".window-title");
  if (title) {

    // Add header button to re-sync (GM Only)
    if ( game.user.isGM ) {
      html.addClass("world-anvil");
      const sync = $(`<a class="wa-sync"><i class="fas fa-sync"></i>${game.i18n.localize("WA.Sync")}</a>`);
      sync.on("click", event => {
        event.preventDefault();
        api.importArticle(articleId);
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

  // Handle Journal Entry secrets
  const secrets = entry.getFlag("world-anvil", "secrets");
  const cssSecrets = "." + api.ARTICLE_CSS_CLASSES.ALL_PARTS + "." + api.ARTICLE_CSS_CLASSES.SECRET_SECTION;
  const htmlSecrets = html.find(cssSecrets);
  for( let htmlSecret of htmlSecrets ) {
    const secretId = htmlSecret.id;
    const revealed = secrets[secretId] ?? false;
    if ( game.user.isGM ) { // Not the same treatment for GM who sees all secret and other players
      htmlSecret.classList.add( revealed ? api.ARTICLE_CSS_CLASSES.SECRET_REVEALED_SUFFIX : api.ARTICLE_CSS_CLASSES.SECRET_HIDDEN_SUFFIX );

    } else { // For players
      if( revealed ) {
        htmlSecret.classList.replace(api.ARTICLE_CSS_CLASSES.SECRET_SECTION, api.ARTICLE_CSS_CLASSES.PUBLIC_SECTION);
      } else {
        htmlSecret.innerHTML = "";
      }
    }
  }

  // Capture click on secrets for gms to toggle their display
  if ( game.user.isGM ) {
    const htmlReveleadSecrets = html.find(cssSecrets + "." + api.ARTICLE_CSS_CLASSES.SECRET_REVEALED_SUFFIX);
    htmlReveleadSecrets.click( event => {
      const secretId = event.currentTarget.id;
      entry.setFlag("world-anvil", "secrets." + secretId, false);
    });

    const htmlHiddenSecrets = html.find(cssSecrets + "." + api.ARTICLE_CSS_CLASSES.SECRET_HIDDEN_SUFFIX);
    htmlHiddenSecrets.click( event => {
      const secretId = event.currentTarget.id;
      entry.setFlag("world-anvil", "secrets." + secretId, true);
    });
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