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
 * @property {string} contentParsed   Parsed HTML content for the article
 * @property {string} portrait        A portrait image URL
 * @property {string} cover           A cover image URL
 * @property {JournalEntry} [entry]   A linked JournalEntry document for this article
 */

/**
 * @typedef {Object} ArticleSection
 * @property {string} title           The section title
 * @property {string} position        A special positional assignment for the section
 * @property {string} content         The original WorldAnvil content in bbCode format
 * @property {string} contentParsed   The HTML parsed content of the section
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

  // Update an existing JournalEntry, or create a new one
  let entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
  if ( entry ) return _updateExistingEntry(entry, article, content, notify, options);
  return _createNewEntry(article, content, notify, options)

}

/* -------------------------------------------- */

/**
 * Update an existing JournalEntry document using the contents of an Article
 * @param {JournalEntry} entry              The JournalEntry to update
 * @param {Article} article                 The original Article
 * @param {ParsedArticleResult} content     The parsed article content
 * @param {boolean} notify                  Whether to create a UI notification when the import has completed
 * @param {DocumentModificationContext} options Entry update options
 * @returns {Promise<JournalEntry>}         The updated entry
 * @private
 */
async function _updateExistingEntry(entry, article, content, notify, options) {
  /**
   * A hook event that fires when the user is updating an existing JournalEntry from a WorldAnvil article.
   * @function WAUpdateJournalEntry
   * @memberof hookEvents
   * @param {JournalEntry} entry            The JournalEntry document being updated
   * @param {Article} article               The original Article
   * @param {ParsedArticleResult} content   The parsed article content
   */
  Hooks.callAll(`WAUpdateJournalEntry`, entry, content);

  // Update the entry
  await entry.update({
    name: article.title,
    content: content.html,
    img: content.img,
    "flags.world-anvil": content.waFlags
  });

  // Notify and return
  if ( notify ) ui.notifications.info(`Refreshed World Anvil article ${article.title}`);
  return entry;
}

/* -------------------------------------------- */

/**
 * Create a new JournalEntry document using the contents of an Article
 * @param {Article} article                 The original Article
 * @param {ParsedArticleResult} content     The parsed article content
 * @returns {Promise<JournalEntry>}         The created entry
 * @param {boolean} notify                  Whether to create a UI notification when the import has completed
 * @param {DocumentModificationContext} options Entry creation options
 * @returns {Promise<JournalEntry>}         The created entry
 * @private
 */
async function _createNewEntry(article, content, notify, options) {

  // Get or create the appropriate folder
  const folder = await getCategoryFolder(article.category);

  // Define the data to import
  const entryData = {
    name: article.title,
    content: content.html,
    img: content.img,
    folder: folder.id,
    "flags.world-anvil": content.waFlags
  }

  /**
   * A hook event that fires when the user is creating a new JournalEntry from a WorldAnvil article.
   * @function WACreateJournalEntry
   * @memberof hookEvents
   * @param {JournalEntryData} entryData    The JournalEntry data which will be created
   * @param {Article} article                 The original Article
   * @param {ParsedArticleResult} content   The parsed article content
   */
  Hooks.callAll(`WACreateJournalEntry`, entryData, article, content);

  // Create the entry, notify, and return
  const entry = await JournalEntry.create(entryData, options);
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
      return section.contentParsed === "1"
    });

    // Determine whether there are secrets inside this article
    const secretSectionIds = ["seeded"];
    waFlags.hasSecrets = sectionEntries.some(s => {
      const [id, section] = s;
      return secretSectionIds.includes(id);
    });

    // Filter sections, removing ignored ones.
    const ignoredSectionIds = [DISPLAY_SIDEBAR_SECTION_ID, "issystem", "folderId"];
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
      const cssClass = [
        ARTICLE_CSS_CLASSES.ALL_PARTS,
        secretSectionIds.includes(id) ?  ARTICLE_CSS_CLASSES.SECRET_SECTION : ARTICLE_CSS_CLASSES.PUBLIC_SECTION
      ].join(" ");
      sections += `<section data-section-id="${id}" class="${cssClass}">`;

      // Title can be replaced by a localized name if the section id has been handled
      const title = _getLocalizedTitle(id, section);

      // Display long-format content as a paragraph section with a header
      const isLongContent = section.content.length > 100;
      if( isLongContent ) {
        sections += `<h2>${title}</h2>`;
        sections += `\n<p>${section.contentParsed}</p><hr/>`;
      }

      // Display short-format content as a details list
      else {
        sections += `<dl><dt>${title}</dt>`;
        sections += `<dd>${section.contentParsed}</dd></dl>`;
      }

      // End main section div
      sections += "</section>";
    }
  }

  // Add all article relations into an aside section
  let aside = "";
  if ( article.relations ) {
    for ( let [id, section] of Object.entries(article.relations) ) {
      if( !section.items ) { continue; } // Some relations, like timelines, have no .items attribute. => Skipped
      const title = section.title || id.titleCase();
      const items = section.items instanceof Array ? section.items: [section.items];  // Items can be one or many
      const relations = items.map(i => `<span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span>`);
      aside += `<dt>${title}:</dt><dd>${relations.join(", ")}</dd>`
    }
    if( aside ) { aside = `<aside><dl>${aside}</dl></aside>`; }
  }

  // Combine content sections
  let content = `<section class="${ARTICLE_CSS_CLASSES.ALL_PARTS} ${ARTICLE_CSS_CLASSES.MAIN_CONTENT}">`;
  content += `<p>${article.contentParsed}</p>`;
  content += "</section><hr/>";
  content += aside;
  content += sections;

  const htmlContent = parsedContentToHTML(content);
  const image = chooseJournalEntyImage(article, htmlContent);

  // Return content, image and flags
  const parsedData = {
    html: htmlContent.innerHTML,
    img: image,
    waFlags: waFlags
  }
  /**
   * A hook event that fires when a WorldAnvil article is parsed
   * @function WACreateJournalEntry
   * @memberof hookEvents
   * @param {Article} article                 The original Article
   * @param {ParsedArticleResult} parsedData  The parsed article content
   */
  Hooks.callAll(`WAParseArticle`, article, parsedData);
  return parsedData;
}

/**
 * Modify content by substituting image paths, adding paragraph break and wa-link elements
 * @param {string} content parsed article content
 * @returns {HTMLElement} formated content, inside a HTML div element
 */
export function parsedContentToHTML(content) {

  // Disable image source attributes so that they do not begin loading immediately
  content = content.replace(/src=/g, "data-src=");

  // HTML formatting
  const htmlElement = document.createElement("div");
  htmlElement.innerHTML = content;

  // Paragraph Breaks
  const t = document.createTextNode("%p%");
  htmlElement.querySelectorAll("span.line-spacer").forEach(s => s.parentElement.replaceChild(t.cloneNode(), s));

  // Image from body
  htmlElement.querySelectorAll("img").forEach(i => {

    // Default href link to hosted foundry server, and not WA. => it needs to be set
    if( i.parentElement.tagName === "A" ) {
      i.parentElement.href = `https://worldanvil.com/${i.parentElement.pathname}`;
    }

    // Set image source
    let img = new Image();
    img.src = `https://worldanvil.com${i.dataset.src}`;
    delete i.dataset.src;
    img.alt = i.alt;
    img.title = i.title;
    img.style.cssText = i.style.cssText; // Retain custum sizing
    i.parentElement.replaceChild(img, i);
  });

  // World Anvil Content Links
  htmlElement.querySelectorAll('span[data-article-id]').forEach(el => {
    el.classList.add("entity-link", "wa-link");
  });
  htmlElement.querySelectorAll('a[data-article-id]').forEach(el => {
    el.classList.add("entity-link", "wa-link");
    const span = document.createElement("span");
    span.classList = el.classList;
    Object.entries(el.dataset).forEach(e => span.dataset[e[0]] = e[1]);
    span.textContent = el.textContent;
    el.replaceWith(span);
  });

  // Regex formatting
  htmlElement.innerHTML = htmlElement.innerHTML.replace(/%p%/g, "</p>\n<p>");
  return htmlElement;
}

/**
 * Retrive the image that will be displayed as the journal entry image
 * @param {Article} article Wa article
 * @param {HTMLElement} htmlContent Journal entry content, in html format
 * @returns {string|null} The featured image path, or null if no image was present
 */
 function chooseJournalEntyImage( article, htmlContent ) {

  // Case 1 : There is a portrait Image
  if ( article.portrait ) {
    return article.portrait.url.replace("http://", "https://");
  } 
  
  // Case 2 : There is a cover Image
  if ( article.cover ) {
    return article.cover.url.replace("http://", "https://");
  }

  // Default behavior : Take the first image inside article content
  const images = htmlContent.querySelectorAll("img");
  return images[0]?.src || null;
}

/* -------------------------------------------- */

/**
 * For some sectionId, the title will be retrieved from the module translations.
 * Except for generalDetailsIds, which will all have 'WA.Header.GeneralDetails' for translation.
 * @param {string} sectionId The id as retrieved via Object.entries
 * @param {string} section The section content
 * @returns The actual title
 */
function _getLocalizedTitle( sectionId, section ) {
  const generalDetailsIds = ['sidebarcontent', 'sidepanelcontenttop', 'sidepanelcontent', 'sidebarcontentbottom'];
  const key = `WA.Header.${generalDetailsIds.includes(sectionId) ? "GeneralDetails" : sectionId.titleCase()}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : section.title || sectionId.titleCase();
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

  // Associate categories with Folder documents
  associateCategoryFolders(categories);

  // Tree starts with root
  const tree = categories.get(CATEGORY_ID.root);

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
    copyForSort: [],
    children: [],
    folder: null
  };
  categories.set(root.id, root);

  // Add an uncategorized node
  const uncategorized = {
    id: CATEGORY_ID.uncategorized,
    title: game.i18n.localize('WA.CategoryUncategorized'),
    position: 9e9,
    copyForSort: [],
    children : [],
    parent: root,
    isUncategorized: true
  };
  categories.set(uncategorized.id, uncategorized);

  // Retrieve categories from the World Anvil API (build map)
  const request = await anvil.getCategories();
  for ( let c of (request?.categories || []) ) {
    categories.set(c.id, c);
    c.copyForSort = c.children?.categories ?? [];
    c.children = [];
    c.folder = undefined;
  }
  // Append children 
  for( let c of (request?.categories || []) ) {
    const parentId = c.parentCategory?.id ?? CATEGORY_ID.root;
    const parent = categories.get(parentId);
    c.parent = parent;
    parent.children.push(c);
  }
  // Sort children
  for( let c of categories.values() ) {

    c.children.sort( (a,b) => {
      const indexA = c.copyForSort.findIndex( cc => cc.id === a.id );
      const indexB = c.copyForSort.findIndex( cc => cc.id === b.id );
      const substr = indexA - indexB;
      if( substr != 0 ) { return substr; }
      return a.title.localeCompare(b.title);
    });
    c.copyForSort = undefined;
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
