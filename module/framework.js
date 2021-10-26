const DISPLAY_SIDEBAR_SECTION_ID = 'displaySidebar';

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
  const folder = game.folders.find(f => f.getFlag("world-anvil", "categoryId") === categoryId);
  const content = _getArticleContent(article);

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
 * Loop through articles section and look for the one named displaysidebar.
 * Ifit's content is 1 => sidebar are displayed 
 * @param {entries} sectionsEntries  article sections
 * @returns TRUE if sidebars should be displayed
 */
function _findIfSidebarsAreDisplayed( sectionsEntries ) {
  return sectionsEntries.filter( ([id, section]) => {
    return id == DISPLAY_SIDEBAR_SECTION_ID;
  }).map( ([id, section]) => {
    return section.content_parsed;
  }).reduce( (result, current) => {
    return result || (current == '1');
  }, false);
}

/**
 * For some sectionId, the title will be retrieved from the module translations
 * @param {string} sectionId The id as retrieved via Object.entries
 * @param {string} section The section content
 * @returns The actual title
 */
function _localizedTitle( sectionId, section ) {
  const localizedIds = ['sidebarcontent', 'sidepanelcontenttop', 'sidepanelcontent', 'sidebarcontentbottom'];
  if( localizedIds.includes( sectionId ) ) {
    return game.i18n.localize("WA.HeaderGeneralDetails");
  }
  return section.title || sectionId.titleCase();
}

/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {{img: string, html: string}}
 * @private
 */
function _getArticleContent(article) {

  // Article sections
  let sections = "";
  if ( article.sections ) {

    const sectionsEntries = Object.entries(article.sections) ;
    const includeSidebars = _findIfSidebarsAreDisplayed(sectionsEntries);

    sectionsEntries.filter( ([id, section]) => {
      // displaysidebar section is only useful for knowing if sidebars should be displayed
      if( id == DISPLAY_SIDEBAR_SECTION_ID ) { return false; }

      // Check if sidebars need to be imported
      const isSidebar = id.includes('sidebar') || id.includes('sidepanel');
      return includeSidebars || !isSidebar;

    } ).forEach( ([id, section]) => {
      // Title can be replaced by a localized name if the section id has been handled
      const title = _localizedTitle(id, section);

      // Determine whether the section is body vs. aside (if short)
      const isLongContent = (section.content.length > 100); 
      if( isLongContent ) { // Another prior condition will come here later. That's why a rewrote it
        sections += `<h2>${title}</h2>`;
        sections += `\n<p>${section.content_parsed}</p><hr/>`;

      } else {
        sections += `<dl><dt>${title}</dt>`;
        sections += `<dd>${section.content_parsed}</dd></dl>`;
      }
    });
  }

  // Article relations
  let aside = "";
  if ( article.relations ) {
    for ( let [id, section] of Object.entries(article.relations) ) {
      
      if( !section.items ) { continue; } // Some relations, like timelines, have no .items attribute. => Skipped
      
      const title = section.title || id.titleCase();
      const items = section.items instanceof Array ? section.items: [section.items];  // Items can be one or many
      const relations = items.map(i => `<span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span>`);
      aside += `<dt>${title}:</dt><dd>${relations.join(", ")}</dd>`
    }
  }

  // Combine content sections
  let content = `<p>${article.content_parsed}</p><hr/>`;
  if ( aside ) content += `<aside><dl>${aside}</dl></aside>`;
  if ( sections ) content += sections;

  // Disable image source attributes so that they do not begin loading immediately
  content = content.replace(/src=/g, "data-src=");

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
/*  Category Management                         */
/* -------------------------------------------- */

/**
 * @typedef {Object} Category
 * @property {string} id              The category ID
 * @property {string} title           The category title
 * @property {number} position        The category position in sort order
 * @property {Category[]} [children]  An array of child Category objects
 */

/**
 * Get the category tree structure for this World.
 * @returns {Promise<{categories: Map<string, Category>, tree: Category[]}>}
 */
export async function getCategories() {
  const anvil = game.modules.get("world-anvil").anvil;

  // API Request
  const request = await anvil.getCategories();
  const pending = request?.categories || [];
  const categories = new Map(pending.map(c => [c.id, c]));
  if ( !categories.size ) return categories;

  // Build the tree, tracking uncategorized results
  const tree = {id: undefined, title: "WA.CategoriesPrimary", position: 0};
  let _depth = 0;
  tree.uncategorized = _buildCategoryBranch(tree, pending, _depth);
  tree.uncategorized.sort(_sortCategories);
  return {categories, tree};
}

/* -------------------------------------------- */

/**
 * Recursively build a branch of the category tree.
 * @param {Category} parent             A parent category
 * @param {Category[]} categories       Categories which have not yet been allocated to a parent
 * @param {number} _depth               Recursive overflow protection
 * @returns {Category[]}                Categories which still have not been allocated to a parent
 * @private
 */
function _buildCategoryBranch(parent, categories, _depth=0) {
  if ( _depth > 1000 ) throw new Error("Recursive category depth exceeded. Something went wrong!");
  _depth++;

  // Allocate pending categories which have this parent category
  let [pending, children] = categories.partition(c => c["parent_category"] === parent.id);
  children.sort(_sortCategories);
  parent["children"] = children;

  // Recursively build child branches
  for ( let c of children ) {
    pending = _buildCategoryBranch(c, pending, _depth);
  }
  return pending;
}

/* -------------------------------------------- */

/**
 * A comparison function for sorting categories
 * @param {Category} a              The first category
 * @param {Category} b              The second category
 * @returns {number}                The comparison between the two
 * @private
 */
function _sortCategories(a, b) {
  if ( Number.isNumeric(a.position) && Number.isNumeric(b.position) ) return a.position - b.position;
  return a.title.localeCompare(b.title);
}

/* -------------------------------------------- */
