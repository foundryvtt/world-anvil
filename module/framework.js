const WA_PARENT_NODE_CLASS = 'wa-parent-node';

/**
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {JournalEntry|null} entry     An existing Journal Entry to sync
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, {entry=null, renderSheet=false}={}) {
  const anvil = game.modules.get("world-anvil").anvil;
  const article = await anvil.getArticle(articleId);
  const categoryId = article.category ? article.category.id : "0";
  const folder = game.folders.find(f => {
    return f.data.type == 'JournalEntry' && f.getFlag("world-anvil", "categoryId") === categoryId;
  });

  const displaySecretsOnEntry = entry?.getFlag("world-anvil", "secretsDisplayed") ?? false;
  const content = _getArticleContent(article, displaySecretsOnEntry);

  // Handle automatic character creation if the option is toggled
  await updateRelatedCharacters(article, content, folder);

  // Update an existing Journal Entry
  if ( entry ) {
    await entry.update({
      name: article.title,
      content: content.html,
      img: content.img
    });
    ui.notifications.info(`Refreshed World Anvil article ${article.title}`);
    return entry;
  }

  // Create a new Journal Entry
  entry = await JournalEntry.create({
    name: article.title,
    content: content.html,
    img: content.img,
    folder: folder ? folder.id : null,
    "flags.world-anvil": { articleId: article.id, articleURL: article.url }
  }, {renderSheet});
  ui.notifications.info(`Imported World Anvil article ${article.title}`);
  return entry;
}


/* -------------------------------------------- */


/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @param {boolean} displaySecretsOnEntry : If the secrets should be displayed
 * @return {{img: string, html: string}}
 * @private
 */
function _getArticleContent(article, displaySecretsOnEntry=false) {
  let body = "";
  let aside = "";

  const includeSidebars = game.settings.get("world-anvil", "includeSidebars");
  const repeatTitle = game.settings.get("world-anvil", "repeatTitle");
  const linkOnHeader = game.settings.get("world-anvil", "linkOnHeader");

  // Article sections
  if ( article.sections ) {
    for ( let [id, section] of Object.entries(article.sections) ) {

      let title = section.title || id.titleCase();

      const isSeeds = id == 'seeded';
      if( isSeeds ) {
        title = displaySecretsOnEntry ? game.i18n.localize('WA.Secrets.Display.Header') : game.i18n.localize('WA.Secrets.Hide.Header');
      }

      // Check if sidebars need to be imported
      const isSidebar = title?.toLowerCase()?.includes('sidebar') || title?.toLowerCase()?.includes('sidepanel');
      if( !includeSidebars && isSidebar ) continue;

      // Build content
      if ( title === "Sidebarcontent" ) title = "General Details";
      const bigContent = (section.content.length > 100) && !isSeeds;
      let contentToAdd = bigContent?  `<h2>${title}</h2>` : `<dt>${title}</dt>`;
      contentToAdd += bigContent?  `\n<p>${section.content_parsed}</p><hr/>` : `<dd>${section.content_parsed}</dd>`;

      // Check if it is the Seeds part
      if( isSeeds ) {
        contentToAdd = '<div class="wa-secrets">' + contentToAdd + '</div>';
      }

      body += contentToAdd;
    }
  }

  // Article relations
  if ( article.relations ) {
    for ( let [id, section] of Object.entries(article.relations) ) {
      if( section.items ) { // Some relations, like timelines, have no .items attribute. => Skipped
          const title = section.title || id.titleCase();
          const items = section.items instanceof Array ? section.items: [section.items];  // Items can be one or many
          const relations = items.map(i => `<span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span>`);
          aside += `<dt>${title}:</dt><dd>${relations.join(", ")}</dd>`
        }
    }
  }

  // Combine content sections
  let content = repeatTitle ? `<h1>${article.title}</h1>\n` : '';
  content += linkOnHeader ? '' : `<p><a href="${article.url}" title="${article.title} ${game.i18n.localize("WA.OnWA")}" target="_blank">${article.url}</a></p>\n`;
  content += `<p>${article.content_parsed}</p><hr/>`;
  if ( aside ) content += `<aside><dl>${aside}</dl></aside>`;
  if ( body ) content += body;

  // Disable image source attributes so that they do not begin loading immediately
  content = content.replace(/src=/g, "data-src=");

  // Encapsulate in a div so that it can easily be referenced in css
  content = `<div class="${WA_PARENT_NODE_CLASS}">${content}</div>`;

  // HTML formatting
  const div = document.createElement("div");
  div.innerHTML = content;

  // Paragraph Breaks
  const t = document.createTextNode("%p%");
  div.querySelectorAll("span.line-spacer").forEach(s => s.parentElement.replaceChild(t.cloneNode(), s));

  // Portrait Image as Featured or Cover image if no Portrait
  let image = null;
  if ( article.portrait ) {
    image = article.portrait.url.replace("http://", "https://");
  } else if ( article.cover ) {
    image = article.cover.url.replace("http://", "https://");
  }

  // Image from body
  div.querySelectorAll("img").forEach(i => {
    let img = new Image();
    img.src = `https://worldanvil.com${i.dataset.src}`;
    delete i.dataset.src;
    img.alt = i.alt;
    img.title = i.title;
    img.style.cssText = i.style.cssText; //Retain custum img size
    i.parentElement.replaceChild(img, i);
    image = image || img.src;
  });

  // World Anvil Content Links
  div.querySelectorAll('span[data-article-id]').forEach(el => {
    el.classList.add("entity-link", "wa-link");
  });
  div.querySelectorAll('a[data-article-id]').forEach(el => {
    el.classList.add("entity-link", "wa-link");
    const span = document.createElement("span");
    span.classList = el.classList;
    Object.entries(el.dataset).forEach(e => span.dataset[e[0]] = e[1]);
    span.textContent = el.textContent;
    el.replaceWith(span);
  });

  // Regex formatting
  let html = div.innerHTML;
  html = html.replace(/%p%/g, "</p>\n<p>");

  // Return content and image
  return {
    html: html,
    img: image
  }
}


/* -------------------------------------------- */

/**
 * Will try to look for existing characters with the articleId in their flags.
 * If found, it will update them.
 * Otherwise, it will create a new character in the correct folder.
 */
const updateRelatedCharacters = async(article, content, entryFolder) => {

  if( !game.settings.get("world-anvil", "createCharacters") || article.template != 'person' ) { 
    return; 
  }

  const defaultType = game.settings.get("world-anvil", "characterType");
  const defaultField = game.settings.get("world-anvil", "characterBio");
  const defaultToken = game.settings.get("world-anvil", "characterToken");

  const relatedCharacters = game.actors.entities.filter(a => {
    const flag = a.getFlag('world-anvil', 'articleId') ?? '';
    return flag === article.id;
  });

  // Update current ones if some are present
  if( relatedCharacters.length > 0 ) {

    for( let actor of relatedCharacters ) {
      const data = {
        img: content.img
      };
      data['data.' + defaultField] = content.html;
      await actor.update(data);
      ui.notifications.info(`Character ${actor.name} has been updated`);
    }
    return;
  } 
  
  // We will need to create a new actor.

  // - First, check if there is a folder where it can be stored
  let actorFolder = null;
  if( entryFolder ) {
    const categoryId = entryFolder.getFlag("world-anvil", "categoryId");
    actorFolder = game.folders.find(f => {
      return categoryId != null && f.data.type == 'Actor' && f.getFlag("world-anvil", "categoryId") === categoryId;
    }) ?? null;

    if( !actorFolder ) {
      actorFolder = await Folder.create({
        name: entryFolder.data.name,
        type: "Actor",
        parent: null,
        "flags.world-anvil.categoryId": categoryId
      });
    }
  }

  // - Then create the actor
  const data = {
    name: article.title,
    type: defaultType,
    img: content.img,
    folder: actorFolder ? actorFolder.id : null,
    token: {
      img: defaultToken,
      displayName: 30,
      disposition: 0,
      actorLink: true
    },
    "flags.world-anvil": { articleId: article.id, articleURL: article.url }
  };
  data['data.' + defaultField] = content.html;

  await Actor.create(data);
  ui.notifications.info(`Character ${article.title} has been created`);
}

/**
 * Open existing Journal entry or try to import a new new if the article Id is not yet known
 * @param {String} articleId : WA article Id
 * @returns The journalEntry
 * @throws Error if not permitted
 */
const openJournalEntryFromArticleId = async (articleId) => {

  if(! articleId || articleId == '') { throw game.i18n.localize("WA.NoPermissionView"); }

  // View an existing linked article (OBSERVER+)
  const entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
  if ( entry ) {
    if ( !entry.hasPerm(game.user, "OBSERVER") ) { throw game.i18n.localize("WA.NoPermissionView"); }

    await entry.sheet.render(true);
    return entry;
  }

  // Import a new article (GM Only)
  if ( !game.user.isGM ) { throw game.i18n.localize("WA.NoPermissionView"); }

  return importArticle(articleId, {renderSheet: true});

}

export class WAMethods {

  get shortcutsInserted() {
    return this._shortcutsInserted ?? false;
  }
  
  get shortcuts() {
    // Waiting for i18 initialization. Seems like I've initialized it a little too soon
    if(! this._shortcuts && game.i18n.has('WA.shortcut.default')) { 
      
      const defaultShortcut = {
        label: game.i18n.localize('WA.shortcut.default'),
        articleId: '',
        classes: ['not-found']
      }

      const noShortcuts = {
        label: '[...]',
        articleId: ''
      };
      
      this._shortcuts = {
        default: defaultShortcut,
        noShortcuts: noShortcuts
      };
    }
    return this._shortcuts;
  }

  /** Map of registered anchors that should be displayed once the sheet is rendered. */
  get registeredAnchors() {

    if(!this._registeredAnchors) { this._registeredAnchors = new Map(); }
    return this._registeredAnchors;
  }

  /**
   * _shortcuts structure :
   * {
   *  path: {
   *    to: {
   *      shortcut: {
   *        articleId: 'Link to WA article',
   *        label: 'displayed Name',  // Optionnal. If null or empty, will be ignored
   *        classes : []              // Optionnal. Allow to add css class on the fly
   *        path: {
   *          to: {
   *            child: {              // A shortcut can have multiple childs. Child may override label, articleId and anchor
   *               anchor: 'Id of your paragraph',
   *               label: 'displayed Name when anchor is used',  // Optionnal. If null or empty, will be ignored
   * [...] }
   * @typedef {label: string, articleId: string} WAShortcut
   * @param {WAShortcut} newShortcuts 
   */
  registerShortcuts(newShortcuts) {
    if(! this.shortcuts ) { throw 'Registering too soon. Translation file not yet loaded'; }
    this._shortcutsInserted = true;
    this._shortcuts = mergeObject(this.shortcuts, newShortcuts);
  }

  substituteShortcutsAndHandleClicks(html, {classes=['.wa-link'], changeLabels=true}={}) {
    classes.forEach(c => {
      if( changeLabels ) { this.fillShortcutNames(html, c); }
      html.find(c).click(event => this.displayWALink(event));
    });
  }

  fillShortcutNames(html, shortcutClass='.wa-link') {
    
    const links = Array.from(html.find(shortcutClass));
    links.forEach(link => {
      const shortcutPath = link.dataset.shortcut;
      const childPath = link.dataset.child;
      if(shortcutPath) {
        const shortcut = this.articleFromShortcut(shortcutPath, childPath);

        if(shortcut.label && shortcut.label != '') { link.textContent = shortcut.label; }
        if(shortcut.classes && shortcut.classes instanceof Array) { shortcut.classes.forEach(c => link.classList.add(c)); }
      }
    });
  }

  async displayWALink(event) {
    event.preventDefault();
    const dataset = event.currentTarget.dataset;
    const shortcutPath = dataset.shortcut;
    const childPath = dataset.child;

    // Data-shortcut takes priority
    const defaultShortcut = { articleId: dataset.articleId };
    const shortcut = shortcutPath ? this.articleFromShortcut(shortcutPath, childPath) : defaultShortcut;

    // Get WA Article
    try {
      const journalEntry = await openJournalEntryFromArticleId(shortcut.articleId);
      
      if( shortcut.anchor) { 
        this.registeredAnchors.set(shortcut.articleId, shortcut.anchor);
        await journalEntry.sheet.render(true); //Render again
      }

    } catch(e) {
      return ui.notifications.warn(e);
    }
  }

  articleFromShortcut(shortcutPath, childPath) {
  
    if( !this.shortcutsInserted ) {return getProperty(this.shortcuts, 'noShortcuts'); }
    const shortcut = getProperty(this.shortcuts, shortcutPath);
  
    if( !shortcut ) { return getProperty(this.shortcuts, 'default'); }

    const child = !childPath ? null : getProperty(shortcut, childPath);

    return {
      label: child?.label ?? shortcut.label,
      articleId: child?.articleId ?? shortcut.articleId,
      anchor: child?.anchor ?? shortcut.anchor
    };
  }
  
  

  scrollToRegisteredAnchor(articleId, entrySheet) {
    const anchorId = this.registeredAnchors.get(articleId);
    if( ! anchorId ) { return; }

    const document = entrySheet.element[0];
    let scrollToElement = document.querySelector('#'+anchorId);
    const containerHeight = document.clientHeight;

    const movableNode = scrollToElement.parentNode.parentNode;

    if (movableNode.scrollTop + containerHeight < scrollToElement.offsetTop) {
      movableNode.scrollTop = scrollToElement.offsetTop;

    } else if ( scrollToElement.offsetTop < movableNode.scrollTop) {
      movableNode.scrollTop = scrollToElement.offsetTop;
    };

    this.registeredAnchors.delete(articleId);
  }
}