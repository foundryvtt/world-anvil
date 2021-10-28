const DISPLAY_SIDEBAR_SECTION_ID = 'displaySidebar';

/* -------------------------------------------- */
/*  Article Management                          */
/* -------------------------------------------- */

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
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {boolean} [notify]            Whether to create a UI notification when the import has completed
 * @param {object} [options={}]         Additional options for journal entry import
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, {notify=true, options={}}={}) {

  // Get the article data from the API
  const anvil = game.modules.get("world-anvil").anvil;
  const article = await anvil.getArticle(articleId);
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
  let folder = null;
  if ( article.category ) {
    folder = await getCategoryFolder(article.category);
  } else {
    folder = await getRootFolder();
  }

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
 * @typedef {Object} Category
 * @property {string} id              The category ID
 * @property {string} title           The category title
 * @property {number} position        The category position in sort order
 * @property {Category[]} [children]  An array of child Category objects
 * @property {Category} [parent]      A parent category to which this category belongs
 * @property {Folder} [folder]        A folder document which contains journal entries in this category
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

  // Create a Category mapping
  const categories = new Map(pending.map(c => {
    c.children = [];
    c.folder = undefined;
    return [c.id, c]
  }));

  // Build the tree, tracking uncategorized results
  let _depth = 0;
  const tree = {id: null, title: "Root", position: 0, children: [], folder: null};
  const uncategorized = _buildCategoryBranch(tree, pending, _depth);

  // Handle uncategorized categories
  uncategorized.sort(_sortCategories);
  tree.children.push(...uncategorized);
  return {categories, tree};
}

/* -------------------------------------------- */

/**
 * Get or create a Folder for a certain Category
 * @param {Category} category         The category of interest
 * @returns {Promise<Folder>}         The Folder document which contains entries in this category
 */
export async function getCategoryFolder(category) {
  if ( category === undefined ) return getRootFolder();
  if ( category.folder ) return category.folder;
  if ( category.parent && !category.parent.folder ) await getCategoryFolder(category.parent);

  // Check whether a Folder already exists for this Category
  let folder = game.folders.find(f => f.getFlag("world-anvil", "categoryId") === category.id);
  if ( folder ) return category.folder = folder;

  // Create a root-level folder if one does not yet exist
  let parent = category.parent?.folder;
  if ( !parent ) parent = await getRootFolder();

  // Create a new Folder
  return category.folder = await Folder.create({
    name: category.title,
    type: "JournalEntry",
    parent: parent.id,
    "flags.world-anvil.categoryId": category.id
  });
}

/* -------------------------------------------- */

/**
 * Get or create a root-level Folder for all imported content
 * @returns {Promise<Folder>}         The root Folder for this World
 */
export async function getRootFolder() {

  // Determine whether a root folder already exists
  let root = game.folders.find(f => (f.data.type === "JournalEntry") && f.getFlag("world-anvil", "root"));
  if ( root ) return root;

  // Create a root folder
  const anvil = game.modules.get("world-anvil").anvil;
  return Folder.create({
    name: `[WA] ${anvil.world.name}`,
    type: "JournalEntry",
    parent: null,
    "flags.world-anvil.root": true
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
  let [pending, children] = categories.partition(c => c["parent_category"] === parent.id);
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
