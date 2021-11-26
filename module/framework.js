/* -------------------------------------------- */
/*   Configuration Variables                    */
/* -------------------------------------------- */

/**
 * A special string which is used to identify article sidebar sections
 * @type {string}
 */
const DISPLAY_SIDEBAR_SECTION_ID = 'displaySidebar';

/**
 * Special category ids which are used by the module
 * @enum {string}
 */
export const CATEGORY_ID = {
  root: 'root',
  uncategorized: 'uncategorized'
};

/**
 * Article main content, sections and secrets are all stored is separated div.
 * Each div got a css class related to what it is
 * @enum {string}
 */
export const ARTICLE_CSS_CLASSES = {
  ALL_PARTS: 'wa-section', // On every parts
  MAIN_CONTENT: 'main-content',
  PUBLIC_SECTION: 'public',
  SECRET_SECTION: 'secret'
};

/* -------------------------------------------- */
/*   Type Definitions                           */
/* -------------------------------------------- */

/**
 * @typedef {Object} Category
 * @property {string} id              The category ID
 * @property {string} title           The category title
 * @property {number} position        The category position in sort order
 * @property {Category[]} [children]  An array of child Category objects
 * @property {Category} [parent]      A parent category to which this category belongs
 * @property {Folder} [folder]        A folder document which contains journal entries in this category
 */

/**
 * @typedef {Map<string, Category>} CategoryMap
 */

/**
 * @typedef {Object} Article
 * @property {string} id              The article ID
 * @property {string} title           The article title
 * @property {number} position        The article position in sort order
 * @property {Category} [category]    A parent category to which this article belongs
 * @property {object[]} sections      Sections of the Article
 * @property {object[]} relations     Relations to the Article
 * @property {string} content_parsed  Parsed HTML content for the article
 * @property {string} portrait        A portrait image URL
 * @property {string} cover           A cover image URL
 * @property {JournalEntry} [entry]   A linked JournalEntry document for this article
 */

/**
 * @typedef {Object} ParsedArticleResult    Used by the hook WAParseArticle. It contains primary data which could be altered by additional modules
 * @property {string} html                  What will become the journal entry content. Is in html format
 * @property {Image} img                    What will become the journal entry image.
 * @property {object} waFlags               Journal entry flags which will be store inside entry.data.flags["world-anvil"]
 */


/* -------------------------------------------- */
/*  Cached Data                                 */
/* -------------------------------------------- */

/**
 * A cached mapping of Categories which appear in this World
 * @type {CategoryMap}
 */
export const cachedCategories = new Map();

/* -------------------------------------------- */
/*  Article Management                          */
/* -------------------------------------------- */

/**
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {boolean} [notify]            Whether to create a UI notification when the import has completed
 * @param {object} [options={}]         Additional options for journal entry import
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, {notify=true, options={}}={}) {
  const anvil = game.modules.get("world-anvil").anvil;

  // Reference Category structure
  const {categories} = await getCategories({cache: true});

  // Get the Article data from the API
  const article = await anvil.getArticle(articleId);
  if( article.category ) {
    article.category = categories.get(article.category.id);
  } else {
    article.category = categories.get(CATEGORY_ID.uncategorized);
  }

  // Format Article content
  const content = getArticleContent(article);

  // Update an existing Journal Entry
  let entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
  if ( entry ) {

    Hooks.callAll(`WAUpdateJournalEntry`, entry, content);

    await entry.update({
      name: article.title,
      content: content.html,
      img: content.img,
      "flags.world-anvil": content.waFlags
    });
    if ( notify ) ui.notifications.info(`Refreshed World Anvil article ${article.title}`);
    return entry;
  }

  // Determine the Folder which contains this article
  const folder = await getCategoryFolder(article.category);

  // Create a new Journal Entry
  Hooks.callAll(`WACreateJournalEntry`, entry, content);

  entry = await JournalEntry.create({
    name: article.title,
    content: content.html,
    img: content.img,
    folder: folder.id,
    "flags.world-anvil": content.waFlags
  }, options);
  if ( notify ) ui.notifications.info(`Imported World Anvil article ${article.title}`);
  return entry;
}

/* -------------------------------------------- */

/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {ParsedArticleResult}
 * @private
 */
export function getArticleContent(article) {

  // Build article flags which will be put inside journal entry
  const waFlags = { articleId: article.id,  articleURL: article.url };

  // Article sections
  let sections = "";
  if ( article.sections ) {

    const sectionEntries = Array.from(Object.entries(article.sections));

    // Determine whether sidebars are displayed for this article
    const includeSidebars = sectionEntries.some(s => {
      const [id, section] = s;
      if ( id !== DISPLAY_SIDEBAR_SECTION_ID ) return false;
      return section.content_parsed === "1"
    });

    // Determine whether there are secrets inside this article
    const secretSectionIds = ["seeded"];
    waFlags.hasSecrets = sectionEntries.some(s => {
      const [id, section] = s;
      return secretSectionIds.includes(id);
    });

    // Filter sections, removing ignored ones.
    const ignoredSectionIds = [DISPLAY_SIDEBAR_SECTION_ID, "issystem"];
    const filteredEntries = sectionEntries.filter( ([id, section]) => {
      if( ignoredSectionIds.includes(id) ) { return false; }
      if( !includeSidebars ) {
        return !id.includes("sidebar") && !id.includes("sidepanel");
      }
      return true;
    });

    // Format section data
    for ( let [id, section] of filteredEntries ) {

      // Each section data are stored inside a separated div
      const isSecretSection = secretSectionIds.includes(id);
      const cssClass = ARTICLE_CSS_CLASSES.ALL_PARTS + " " + ( isSecretSection ?  ARTICLE_CSS_CLASSES.SECRET_SECTION : ARTICLE_CSS_CLASSES.PUBLIC_SECTION );
      sections += `<section data-section-id="${id}" class="${cssClass}">`;

      // Title can be replaced by a localized name if the section id has been handled
      const title = _getLocalizedTitle(id, section);

      // Display long-format content as a paragraph section with a header
      const isLongContent = section.content.length > 100;
      if( isLongContent ) {
        sections += `<h2>${title}</h2>`;
        sections += `\n<p>${section.content_parsed}</p><hr/>`;
      }

      // Display short-format content as a details list
      else {
        sections += `<dl><dt>${title}</dt>`;
        sections += `<dd>${section.content_parsed}</dd></dl>`;
      }

      // End main section div
      sections += "</section>";
    }
  }

  // Article relations
  let aside = "";
  if ( article.relations ) {

    for ( let [id, section] of Object.entries(article.relations) ) {
      
      if( !section.items ) { continue; } // Some relations, like timelines, have no .items attribute. => Skipped
      if( fromHooks.handledRelations.includes(id) ) { continue; }
      
      const title = section.title || id.titleCase();
      const items = section.items instanceof Array ? section.items: [section.items];  // Items can be one or many
      const relations = items.map(i => `<span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span>`);
      
      aside += `<dt>${title}:</dt><dd>${relations.join(", ")}</dd>`
    }

    if( aside ) { aside = `<aside><dl>${aside}</dl></aside>`; }
  }

  // Combine content sections
  let content = `<section class="${ARTICLE_CSS_CLASSES.ALL_PARTS} ${ARTICLE_CSS_CLASSES.MAIN_CONTENT}">`;
  content += `<p>${article.content_parsed}</p>`;
  content += "</section><hr/>";
  content += aside;
  content += sections;

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

  // Return content, image and flags
  const parsedData = {
    html: html,
    img: image,
    waFlags: waFlags
  }
  Hooks.callAll(`WAParseArticle`, article, parsedData);

  return parsedData;
}

/* -------------------------------------------- */

/**
 * For some sectionId, the title will be retrieved from the module translations
 * @param {string} sectionId The id as retrieved via Object.entries
 * @param {string} section The section content
 * @returns The actual title
 */
function _getLocalizedTitle( sectionId, section ) {

  // For each sectionId, we try to retrieve a matching translation.
  // Except for generalDetailsIds, which will all have 'WA.Header.GeneralDetails' for translation
  const generalDetailsIds = ['sidebarcontent', 'sidepanelcontenttop', 'sidepanelcontent', 'sidebarcontentbottom'];
  const key = generalDetailsIds.includes(sectionId) ? "WA.Header.GeneralDetails" : "WA.Header." + sectionId.titleCase();
  
  const localized = game.i18n.localize(key);
  if( localized != key ) { // Meaning the translation was found
    return localized;
  }
  return section.title || sectionId.titleCase();
}

/* -------------------------------------------- */
/*  Category Management                         */
/* -------------------------------------------- */

/**
 * Get the full mapping of Categories which exist in this World and the tree structure which organizes them.
 * @param {boolean} cache     Use a cached set of categories, otherwise retrieve fresh from the World Anvil API.
 * @returns {Promise<{categories: CategoryMap, tree: Category}>}
 */
export async function getCategories({cache=true}={}) {

  // Get the category mapping
  const categories = await _getCategories({cache});

  // Build the tree structure
  let _depth = 0;
  const tree = categories.get(CATEGORY_ID.root);
  const pending = Array.from(categories.values()).filter(c => c.id !== CATEGORY_ID.root);
  const unmapped = _buildCategoryBranch(tree, pending, _depth);

  // Add un-mapped categories as children of the root
  if ( unmapped.length ) {
    unmapped.sort(_sortCategories);
    for ( let c of unmapped ) {
      console.warn(`World-Anvil | Category ${c.title} failed to map to a parent category`);
      c.parent = undefined;
      tree.children.push(c);
    }
  }

  // Associate categories with Folder documents
  associateCategoryFolders(categories);
  return {categories, tree};
}

/* -------------------------------------------- */

/**
 * Get the mapping of world anvil categories from the API (or from local cache).
 * @param {boolean} cache     Use a cached set of categories, otherwise retrieve fresh from the World Anvil API.
 * @returns {Promise<CategoryMap>}
 * @private
 */
async function _getCategories({cache=true}={}) {
  const anvil = game.modules.get("world-anvil").anvil;
  const categories = cachedCategories;

  // Return the category mapping from cache
  if ( cache && categories.size ) {
    associateCategoryFolders(categories);
    return categories;
  }

  // Create a new category mapping
  categories.clear();

  // Make sure WA world has already been retrieved
  if( !anvil.world ) {
    await anvil.getWorld(anvil.worldId);
  }

  // Add a root node
  const root = {
    id: CATEGORY_ID.root,
    title:  `[WA] ${anvil.world.name}`,
    position: 0,
    children: [],
    folder: null
  };
  categories.set(root.id, root);

  // Add an uncategorized node
  const uncategorized = {
    id: CATEGORY_ID.uncategorized,
    title: game.i18n.localize('WA.CategoryUncategorized'),
    position: 9e9,
    children : [],
    parent: root,
    isUncategorized: true
  };
  categories.set(uncategorized.id, uncategorized);

  // Retrieve categories from the World Anvil API
  const request = await anvil.getCategories();
  for ( let c of (request?.categories || []) ) {
    c.children = [];
    c.folder = undefined;
    categories.set(c.id, c);
  }
  return categories;
}

/* -------------------------------------------- */

/**
 * Associated Categories from the WA hierarchy with existing Folders within the World.
 * @param {CategoryMap} categories      The categories being mapped
 */
export function associateCategoryFolders(categories) {
  const folders = game.folders.filter(f => (f.data.type === "JournalEntry") && f.data.flags["world-anvil"]);
  for ( let [id, category] of categories ) {
    if ( id === CATEGORY_ID.root ) category.folder = null;
    else category.folder = folders.find(f => f.getFlag("world-anvil", "categoryId") === id);
  }
}

/* -------------------------------------------- */

/**
 * Get or create a Folder for a certain Category
 * @param {Category} category         The category of interest
 * @returns {Promise<Folder>}         The Folder document which contains entries in this category
 */
export async function getCategoryFolder(category) {
  if ( category.folder !== undefined ) return category.folder;
  if ( category.parent && !category.parent.folder ) await getCategoryFolder(category.parent);

  // Check whether a Folder already exists for this Category
  const folder = game.folders.find(f => ( f.data.type === "JournalEntry" ) && ( f.getFlag("world-anvil", "categoryId") === category.id) );
  if ( folder ) return category.folder = folder;

  // Create a new Folder
  return category.folder = await Folder.create({
    name: `[WA] ${category.title}`,
    type: "JournalEntry",
    parent: category.parent?.folder?.id,
    sorting: 'm',
    "flags.world-anvil.categoryId": category.id
  });
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
  let [pending, children] = categories.partition(c => {
    let parentId = c.parent_category?.id;
    if ( !parentId && (c.id !== CATEGORY_ID.root) ) parentId = CATEGORY_ID.root;
    return parentId === parent.id;
  });
  children.forEach(c => c.parent = parent);
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
