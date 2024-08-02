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
 * @property {object} html                  Each child is a string containing HTML data (HtmlElement.innerHTML). It will appear as a page inside the Journal entry
 * @property {object} images                Each child is an image url. It will also appear as a page inside the Journal entry
 * @property {object} waFlags               Journal entry flags which will be store inside entry.flags["world-anvil"]
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
  const pages = getArticleContent(article);

  // Update an existing JournalEntry, or create a new one
  let entry = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
  if ( entry ) return _updateExistingEntry(entry, article, pages, notify, options);
  return _createNewEntry(article, pages, notify, options)

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
    pages: _parsedArticleContentToJournalPages(content),
    "flags.world-anvil": content.waFlags
  }, {recursive: false, diff: false});

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
    pages: _parsedArticleContentToJournalPages(content),
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
 * Transform a ParsedArticleResult to a pages array which can be used for creating/updating journal entries
 * @param {ParsedArticleResult} content Article content previously parsed
 * @returns
 */
 function _parsedArticleContentToJournalPages(content) {

  const pages = [];
  const pageNames = content.waFlags.pageNames;

  // Add Html Pages (Order is important)
  [pageNames.mainArticle, pageNames.sideContent, pageNames.relationships, pageNames.secrets]
    .filter( header => {
      return !!content.html[header];
  }).forEach( header => {
    const pageContent = content.html[header];
    pages.push({
      name: header,
      type: "text",
      text: {
        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
        content: pageContent
      },
      sort: pages.length
    });
  });

  // Add image pages (Order is also important)
  [pageNames.cover, pageNames.portrait]
    .filter( header => {
      return !!content.images[header];
  }).forEach( header => {
    const imageUrl = content.images[header];
    pages.push({
      name: header,
      type: "image",
      src: imageUrl,
      sort: pages.length
    });
  });



  return pages;
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
  const waFlags = { articleId: article.id,  articleURL: article.url, pageNames: {} };
  const pageNames = waFlags.pageNames;
  addPageNameToPool(pageNames, "mainArticle", game.i18n.localize("WA.JournalPages.ArticleDefault"));
  addPageNameToPool(pageNames, "secrets", game.i18n.localize("WA.JournalPages.SecretsDefault"));
  addPageNameToPool(pageNames, "sideContent", game.i18n.localize("WA.JournalPages.SideContentDefault"));
  addPageNameToPool(pageNames, "portrait", game.i18n.localize("WA.JournalPages.PortraitDefault"));
  addPageNameToPool(pageNames, "cover", game.i18n.localize("WA.JournalPages.CoverDefault"));
  addPageNameToPool(pageNames, "relationships", game.i18n.localize("WA.JournalPages.RelationshipsDefault"));

  // Initialise pages and the potential names of each pages
  const pages = { html: {}, images: {}, waFlags: waFlags };

  // Article sections
  if ( article.sections ) {

    const sectionEntries = Array.from(Object.entries(article.sections));

    // Determine whether sidebars are displayed for this article
    const includeSidebars = sectionEntries.some(s => {
      const [id, section] = s;
      if ( id !== DISPLAY_SIDEBAR_SECTION_ID ) return false;
      return section.contentParsed === "1"
    });

    // Determine whether there are secrets inside this article
    
    const isSectionSecret = (section) => {
      const secretSectionIds = ["seeded"];
      return secretSectionIds.includes(section) || section.startsWith("ggm"); 
    }
    waFlags.hasSecrets = sectionEntries.some(s => {
      const [id, section] = s;
      return isSectionSecret(id);
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
        isSectionSecret(id) ?  ARTICLE_CSS_CLASSES.SECRET_SECTION : ARTICLE_CSS_CLASSES.PUBLIC_SECTION
      ].join(" ");

      let sectionInPages = `<section data-section-id="${id}" class="${cssClass}">`;

      // Title can be replaced by a localized name if the section id has been handled
      // Display long-format content as a paragraph section with a header
      const title = _getLocalizedTitle(id, section);
      const isLongContent = section.content.length > 100;
      if( isLongContent ) {
        sectionInPages += `<h2>${title}</h2>`;
        sectionInPages += `\n<p>${section.contentParsed}</p><hr/>`;
      }

      // Display short-format content as a details list
      else {
        sectionInPages += `<dl><dt>${title}</dt>`;
        sectionInPages += `<dd>${section.contentParsed}</dd></dl>`;
      }

      // End main section div
      sectionInPages += "</section>";

      const pageName = isSectionSecret(id) ? pageNames.secrets : pageNames.sideContent;
      pages.html[pageName] = pages.html[pageName] ?? "";
      pages.html[pageName] += sectionInPages;
    }
  }

  // Add all article relationships into an aside section
  let template = document.createElement('div');
  template.innerHTML = article.fullRender;
  const relationElements = template.querySelectorAll(".character-relationship-panel");
  if( relationElements.length > 0 ) {
    pages.html[pageNames.relationships] = "";
    for ( let relationElement of relationElements ) {

      const protagonists = {
        left: parseRelationProtagonist( relationElement, true ),
        right: parseRelationProtagonist( relationElement, false )
      };

      const leftIsThisArticle = ( protagonists.left.articleId === article.id );
      // const current = leftIsThisArticle ? protagonists.left : protagonists.right; Would only need it if we want to add some addtionnal data like affection level
      const relationshipWith = leftIsThisArticle ? protagonists.right : protagonists.left;

      pages.html[pageNames.relationships] += `<h2>${relationshipWith.role}</h2>`;
      pages.html[pageNames.relationships] += `<p class="wa-link" data-article-id="${relationshipWith.articleId}">${relationshipWith.personName}</p>`;
    }
  }

  // Combine content sections
  let content = `<section class="${ARTICLE_CSS_CLASSES.ALL_PARTS} ${ARTICLE_CSS_CLASSES.MAIN_CONTENT}">`;
  content += `<p>${article.contentParsed}</p>`;
  content += "</section>";
  pages.html[pageNames.mainArticle] = content;

  // Modify each page so that they really becomes HTML content
  Object.entries(pages.html).forEach( ([key, value]) => pages.html[key] = parsedContentToHTML(value) );

  // Add image pages
  addJournalImagePages(article, pages);

  /**
   * A hook event that fires when a WorldAnvil article is parsed
   * @function WACreateJournalEntry
   * @memberof hookEvents
   * @param {Article} article                 The original Article
   * @param {ParsedArticleResult} parsedData  The parsed article content
   */
  Hooks.callAll(`WAParseArticle`, article, pages);
  return pages;
}

function addPageNameToPool( pool, pageType, defaultName ) {
  let pageName = game.settings.get("world-anvil", pageType + "Page") ?? "";
  if( pageName == "" ) {
    pageName = defaultName;
  }
  pool[pageType] = pageName;
}

/**
 * Article API from WA doesn't described relationships in depth. We can only retrieve them from the fullRender
 * @param {HTMLElement} htmlRelation The div from article fullRender which describe this relationship
 * @param {boolean} leftOne Each relation described in WA has two protagonists. One on the left, one on the right
 * @returns {personName: string, articleId: string, role: string} data for the given protagonist
 */
function parseRelationProtagonist(htmlRelation, leftOne=true) {
  const base = htmlRelation.querySelector(".character-relationships-" + (leftOne ? "left" : "right") );

  return {
    personName: base.children[0].children[0].text,
    articleId: base.children[0].children[1].getAttribute("data-id"),
    role: base.querySelector(".character-relationship-importance")?.textContent ?? ""
  };
}

/**
 * Modify content by substituting image paths, adding paragraph break and wa-link elements
 * @param {string} content parsed article content
 * @returns {string} Content in HTML format (HtmlElement.innerHTML)
 */
export function parsedContentToHTML(content) {

  if( content === "" ) { return ""; }

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

    // Set image source
    let img = new Image();
    img.src = (i.dataset.src.startsWith("/") ? "https://worldanvil.com" : "") + i.dataset.src;
    delete i.dataset.src;
    img.alt = i.alt;
    img.title = i.title;
    img.style.cssText = i.style.cssText; // Retain custum sizing

    // We remove <a .../> element surrounding the image, since now Foundry is able to see a fine version of the image by itself
    let replacedElement = i;
    if( i.parentElement.tagName === "A" ) {
      replacedElement = i.parentElement;
    }
    replacedElement.parentElement.replaceChild(img, replacedElement);
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
  return htmlElement.innerHTML;
}

/**
 * Add pages for images to pages if necessary.
 * See waFlags.pageNames.cover/portrait
 * @param {Article} article Wa article
 * @param {object} pages Each child contains an HTMLElement with will be displayed as a page.
 */
 function addJournalImagePages( article, pages ) {

  const createImagePage = ( pageName, imageSrc ) => {
    pages.images[pageName] = imageSrc.replace("http://", "https://");
  }
  
  const pageNames = pages.waFlags.pageNames;

  // Retrieve images from main page
  const htmlElement = document.createElement("div");
  htmlElement.innerHTML = pages.html[pageNames.mainArticle];
  const images = htmlElement.querySelectorAll("img");

  // Portrait Image
  if ( article.portrait ) {
    createImagePage(pageNames.portrait, article.portrait.url );

  } else if ( article.template === 'person' && images.length == 1 ) {
    createImagePage(pageNames.portrait, images[0].src );
  }

  // Cover Image
  if ( article.cover?.url ) { // FIXME : Waiting for answers from WA developers
    createImagePage(pageNames.cover, article.cover.url );
  }
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
    articles: [],
    articleIds: [],
    children: [],
    childrenIds: [],
    folder: null
  };
  categories.set(root.id, root);

  // Add an uncategorized node
  const uncategorized = {
    id: CATEGORY_ID.uncategorized,
    title: game.i18n.localize('WA.CategoryUncategorized'),
    position: 9e9,
    articles: [],
    articleIds: [],
    children: [],
    childrenIds: [],
    isUncategorized: true
  };
  categories.set(uncategorized.id, uncategorized);

  // Retrieve categories from the World Anvil API (build map)
  const request = await anvil.getCategories();
  
  // First loop : Store in map
  const reqCategories = (request?.categories || []);
  for ( let c of reqCategories ) {
    categories.set(c.id, c);
  }

  // Second loop : Add id listings and set category.children
  for ( let c of reqCategories ) {
    c.articleIds = (c.articles ?? []).map( a => a.id );
    c.childrenIds = (c.children ?? []).map( ch => ch.id );
    c.articles = [];
    c.children = c.childrenIds.map( id => {
      const child = categories.get(id);
      child.parent = c;
      return child;
    });
  }

  // Third loop : Put the ones without parent as root children
  root.children = reqCategories.filter( c => {
    if ( c.parent ) return false;
    c.parent = root;
    return true;
  });

  root.children.sort( (a,b) => {
    const titleA = a.title ?? "";
    const titleB = b.title ?? "";
    return titleA.localeCompare(titleB);
  });

  // Add uncategorized on last place
  uncategorized.parent = root;
  root.children.push(uncategorized);

  return categories;
}

/* -------------------------------------------- */

/**
 * Associated Categories from the WA hierarchy with existing Folders within the World.
 * @param {CategoryMap} categories      The categories being mapped
 */
export function associateCategoryFolders(categories) {
  const folders = game.folders.filter(f => (f.type === "JournalEntry") && f.flags["world-anvil"]);
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
  const folder = game.folders.find(f => ( f.type === "JournalEntry" ) && ( f.getFlag("world-anvil", "categoryId") === category.id) );
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
