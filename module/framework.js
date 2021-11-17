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
    await entry.update({
      name: article.title,
      content: content.html,
      img: content.img
    });
    if ( notify ) ui.notifications.info(`Refreshed World Anvil article ${article.title}`);
    return entry;
  }

  // Determine the Folder which contains this article
  const folder = await getCategoryFolder(article.category);

  // Create a new Journal Entry
  entry = await JournalEntry.create({
    name: article.title,
    content: content.html,
    img: content.img,
    folder: folder.id,
    "flags.world-anvil": { articleId: article.id, articleURL: article.url }
  }, options);
  if ( notify ) ui.notifications.info(`Imported World Anvil article ${article.title}`);
  return entry;
}

/* -------------------------------------------- */

/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {{img: string, html: string}}
 * @private
 */
export function getArticleContent(article) {

  // Article sections
  let sections = "";
  if ( article.sections ) {

    // Determine whether sidebars are displayed for this article
    const includeSidebars = Array.from(Object.entries(article.sections)).some(s => {
      const [id, section] = s;
      if ( id !== DISPLAY_SIDEBAR_SECTION_ID ) return false;
      return section.content_parsed === "1"
    });

    // Format section data
    for ( let [id, section] of Object.entries(article.sections) ) {

      // Ignore some sections
      if( id === DISPLAY_SIDEBAR_SECTION_ID ) continue; // Only useful for knowing if sidebars are present
      const isSidebar = id.includes("sidebar") || id.includes("sidepanel");
      if ( !includeSidebars && isSidebar ) continue;

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
    }
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

/**
 * For some sectionId, the title will be retrieved from the module translations
 * @param {string} sectionId The id as retrieved via Object.entries
 * @param {string} section The section content
 * @returns The actual title
 */
function _getLocalizedTitle( sectionId, section ) {
  const localizedIds = ['sidebarcontent', 'sidepanelcontenttop', 'sidepanelcontent', 'sidebarcontentbottom'];
  if( localizedIds.includes( sectionId ) ) {
    return game.i18n.localize("WA.HeaderGeneralDetails");
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
  const folder = game.folders.find(f => f.getFlag("world-anvil", "categoryId") === category.id);
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
