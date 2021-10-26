import {importArticle, getCategories} from "./framework.js";

/**
 * Before filling the category tree, this method helps to store all WA article inside a map with category id as keys.
 * This is used to avoid looping on the whole article array each time a category leaf is filled.
 * 
 * While doing this, we fill each article data by adding info on article visibility. 
 * 
 * @param {object[]} rawArticles All WA articles, as retrieved from WA API
 * @param {object[]} entries All Journal entries which hae the world-anvil flag
 * @param {boolean} displayDraft If Draft article are to be taken into account
 * @param {boolean} displayWIP  If WIP article are to be taken into account
 * @returns A Map of all WA articles, stored by related categoryIds
 */
 function filterArticlesAndStoreThemByCategoryId( rawArticles, entries, displayDraft, displayWIP ) {
  const result = new Map();
  const filteredArticles = rawArticles.filter( article => {
    if ( article.is_draft && !displayDraft ) return false;
    if ( article.is_wip && !displayWIP ) return false;
    return true;

  }).map( article => {
    const articleLink = entries.find(j => j.getFlag("world-anvil", "articleId") === article.id) ?? null;

    const displayVisibilityButtons = articleLink != null;
    const visibleByPlayers = articleLink?.data.permission.default >= CONST.ENTITY_PERMISSIONS.OBSERVER;

    const entry = {
      present: articleLink != null,
      displayVisibilityButtons: displayVisibilityButtons,
      visibleByPlayers: visibleByPlayers,
      link: articleLink
    };
    return foundry.utils.mergeObject( {entry: entry}, article);
    
  }).sort( (a,b) => {
    return a.title.localeCompare(b.title);
  });
  
  filteredArticles.forEach( article => {
    const categoryId = article.category?.id ?? '0';

    const mapValue = result.get(categoryId) ?? [];
    result.set( categoryId, mapValue.concat( [article] ) );
  });
  return result;  
}

/**
 * Convenience function that go trhough the whole category tree and add data about related articles, and Journal folders
 * Warning: This method is recursive, and it will go through the whole category tree
 * 
 * @param {object} category rawCategory as retrieved from WA API (Will be updated)
 * @param {Map} articleMap All WA articles, stored in map will categoryId as key
 * @param {object[]} folders Current journal entries in the game which have the world-anvil flag
 * @param {int} currentTreeLevel How many parent categories this category have. Will be used on GUI to put a left margin
 * @returns 
 */
 function fillCategoryBranchWithFolderAndArticles( category, articleMap, folders, currentTreeLevel ) {

  const relatedArticles = articleMap.get( category.id ) ?? [];
  const categoryLink = folders.find(f => f.getFlag("world-anvil", "categoryId") === category.id) ?? null;

  const articlesWithVisibilityButton = relatedArticles.find( a => a.entry.displayVisibilityButtons ) ?? false;
  const visibleByPlayers = relatedArticles.find( a => a.entry.visibleByPlayers )?.entry.visibleByPlayers ?? false;

  const displayVisibilityButtons = categoryLink != null && articlesWithVisibilityButton;

  const folder= {
    present: categoryLink != null,
    displayVisibilityButtons: displayVisibilityButtons,
    visibleByPlayers: visibleByPlayers,
    link: categoryLink
  };

  const data = { 
    margin: currentTreeLevel * 20,
    folder: folder, 
    articles: relatedArticles 
  };
  foundry.utils.mergeObject(data, category);
  data.children = data.children.map( child => fillCategoryBranchWithFolderAndArticles(child, articleMap, folders, currentTreeLevel + 1) );

  return data;
}

/**
 * Used on the final step on building this.categories.
 * It goes from filled category stored as a tree to a simple array. Link between categories remain.
 * While doing this, the empty category with no articles and no child category are filtered.
 * Warning: This method is recursive, and it will create the whole array which will be stored in this.categories
 * 
 * @param {object} category The current node of the category tree which is currently handled
 * @param {object[]} result And array containing this category and its category childs (recursive)
 */
 function pushCategoryAndChildsInsideArray( category, result ) {

  const childResults = [];
  category.children.forEach( child => {
    pushCategoryAndChildsInsideArray(child, childResults);
  });

  if( category.articles.length > 0 || childResults.length > 0 ) {
    // Only put categories that aren't empty
    result.push( category );
    childResults.forEach( childResult => {
      result.push(childResult);
    });
  }
}


/**
 * Check if a Journal exists for this category id. If not create it.
 * Warning: This method is recursive, and it will create the whole folder hierarchy for this folder leaf
 * @param {string} waCategoryId WA category id which match this folder
 * @param {object[]} categories All categories, with tree and articles filled
 * @returns The journal folder
 */
 async function createFolderIfNotExists( waCategoryId, categories ) {

  const category = categories.find( c => c.id === waCategoryId );
  if( category.folder.link ) {
    return category.folder.link;
  }

  const parentCategoryId = category.parent_category?.id ?? null;
  let parentFolderId = null;
  if( parentCategoryId ) {
    const parentFolder = await createFolderIfNotExists(parentCategoryId, categories);
    parentFolderId = parentFolder.id;
  }
  const folderTitle = parentFolderId ? category.title : '[WA] ' + category.title;

  category.folder.link = await Folder.create({
    name: folderTitle,
    type: "JournalEntry",
    parent: parentFolderId,
    "flags.world-anvil.categoryId": waCategoryId
  });

  return category.folder.link;
}

/**
 * Try to retrieve an existing article with the given articleId.
 * If found, refresh it. Otherwise : Create it.
 * @param {string} articleId WA article id which match the wanted article
 * @param {boolean} renderSheet Optinal parameter. renderSheet is for directly displaying Journal entry after importing it
 * @returns The article Journal entry
 */
async function importOrRefreshArticle( articleId, {renderSheet=false} = {} ) {
  const article = game.journal.find(e => e.getFlag("world-anvil", "articleId") === articleId);
  return importArticle(articleId, {entry: article, renderSheet: renderSheet});
}


/**
 * A World Anvil Directory that allows you to see and manage your World Anvil content in Foundry VTT
 */
export default class WorldAnvilBrowser extends Application {
  constructor(...args) {
    super(...args);
    this._displayDraft = true;
    this._displayWIP = true;
  }

	/* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "world-anvil-config",
      classes: ["world-anvil"],
      template: "modules/world-anvil/templates/journal.hbs",
      width: 720,
      height: "auto",
      scrollY: [".world-anvil-container"]
    });
  }

	/* -------------------------------------------- */

  get anvil() {
    return game.modules.get("world-anvil").anvil;
  }

	/* -------------------------------------------- */

  /** @override */
  get title() {
    const anvil = game.modules.get("world-anvil").anvil;
    return `World Anvil: ${anvil.world.name}`;
  }

	/* -------------------------------------------- */

  /** @override */
  async getData() {
    const world = this.anvil.world || await this.anvil.getWorld(this.anvil.worldId);
    const categories = await this.getArticleCategories();
    return {
      world: world,
      categories: categories,
      displayDraft: this._displayDraft,
      displayWIP: this._displayWIP
    }
  }

	/* -------------------------------------------- */

  /**
   * Obtain and organize the articles for the World
   * @return {Promise<void>}
   */
  async getArticleCategories() {

    // Get folders and articles that could map to WA content
    const rawCategories = await this._getCategories();
    const articles = await this._getArticles();

    const folders = game.folders.filter(f => (f.data.type === "JournalEntry") && f.data.flags["world-anvil"]);
    const entries = game.journal.filter(j => j.data.flags["world-anvil"]);

    // Building a category tree filled with related article and journal entries
    const articleMap = filterArticlesAndStoreThemByCategoryId(articles, entries, this._displayDraft, this._displayWIP )
    const updatedTree = rawCategories.tree.map( category => fillCategoryBranchWithFolderAndArticles(category, articleMap, folders, 0));

    // Remove empty ones and store it back into an array
    const sortedCategories = [];
    updatedTree.forEach( category => {
      pushCategoryAndChildsInsideArray(category, sortedCategories); 
    });

    return this.categories = sortedCategories;
  }

	/* -------------------------------------------- */

  /**
   * Get all World Anvil articles and cache them to this Application instance
   * @return {Promise<object[]>}
   * @private
   */
  async _getArticles() {
    if ( !this.articles ) {
      const request = await this.anvil.getArticles();
      this.articles = request.articles;
    }
    return this.articles;
  }

	/* -------------------------------------------- */

  /**
   * Get all World Anvil categories and cache them to this Application instance.
   * Then sort them and build a tree taking parents into account
   * @return {Promise<{all: Map<string, Category>, tree: Category[]}>}
   * @private
   */
   async _getCategories() {
    if (this._rawCategories) return this._rawCategories;
    const {categories, tree} = await getCategories();
    return this._rawCategories = {
      all: categories,
      tree: tree.children.concat(tree.uncategorized)
    };
  }

	/* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.world-anvil-control").click(this._onClickControlButton.bind(this));
  }

	/* -------------------------------------------- */

   /***
   * Handle left-click events on a directory import button
   * @private
   */
  async _onClickControlButton(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    switch (action) {
      case "link-folder":
        return this._linkFolder(button.dataset.categoryId);

      case "browse-folder":
        break;

      case "link-entry":
        return this._linkEntry(button.dataset.articleId);

      case "browse-entry":
        return this._browseEntry(button.dataset.entryId);

      case "sync-folder":
        return this._syncFolder(button.dataset.categoryId);

      case "toggle-drafts":
        this._displayDraft = !this._displayDraft;
        return this.render();

      case "toggle-wip":
        this._displayWIP = !this._displayWIP;
        return this.render();

      case "display-folder":
        return this._displayFolder(button.dataset.categoryId);

      case "hide-folder":
        return this._hideFolder(button.dataset.categoryId);

      case "display-entry":
        return this._displayEntry(button.dataset.entryId);

      case "hide-entry":
        return this._hideEntry(button.dataset.entryId);
    }

  }

  /**
   * Convenience function used to synchronize all articles related to a given category
   * This is not recursive, and doesn't go the category childs
   * @param {string} categoryId WA category id
   * @returns A promise which waits that all articles are refresh or imported
   */
  _syncCategoryArticles(categoryId) {

    const waCategory = this.categories.find( c => c.id === categoryId );
    return Promise.all(waCategory.articles.map(a => {
      return importOrRefreshArticle(a.id);
    }));
  }

  /**
   * Create a folder for a category and import all related articles
   * @param {string} categoryId WA category id
   */
  async _linkFolder(categoryId) {
    await createFolderIfNotExists(categoryId, this.categories);
    return this._syncCategoryArticles(categoryId);
  }

  /**
   * Import or refresh an article, and then display it
   * @param {string} articleId WA article id
   */
   async _linkEntry(articleId) {
    return importOrRefreshArticle(articleId, {renderSheet: true});
  }

  /**
   * Display a given Journal entry
   * @param {string} entryId Foundry journal entry id
   */
  async _browseEntry(entryId) {
    const entry = game.journal.get(entryId);
    entry.sheet.render(true);
  }

  /**
   * Import or refresh every articles inside a category
   * @param {string} categoryId WA category id
   */
   async _syncFolder(categoryId) {
    return this._syncCategoryArticles(categoryId);
  }

  /**
   * Make every related article of a category visible. Let child category as they are
   * @param {string} categoryId WA category id
   */
  async _displayFolder(categoryId) {
    const category = this.categories.find(c => c.id === categoryId);
    const articles = category?.articles ?? [];
    const updates = articles.filter( a => {
      return a.entry.link?.data.permission.default < CONST.ENTITY_PERMISSIONS.OBSERVER;
    }).map( a => {
      return {
        _id: a.entry.link.id,
        permission: { default: CONST.ENTITY_PERMISSIONS.OBSERVER }
      }
    });

    if( updates.length > 0 ) {
      await JournalEntry.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
    }
    this.render();
  }

  /**
   * Make every related article of a category hidden. Let child category as they are
   * @param {string} categoryId WA category id
   */
  async _hideFolder(categoryId) {
    const category = this.categories.find(c => c.id === categoryId);
    const articles = category?.articles ?? [];
    const updates = articles.filter( a => {
      return a.entry.link?.data.permission.default >= CONST.ENTITY_PERMISSIONS.OBSERVER;
    }).map( a => {
      return {
        _id: a.entry.link.id,
        permission: { default: CONST.ENTITY_PERMISSIONS.NONE }
      }
    });

    if( updates.length > 0 ) {
      await JournalEntry.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
    }
    this.render();
  }

  /**
   * Make an article entry visibile for all players
   * @param {string} entryId Foundry journal entry id
   */
   async _displayEntry(entryId) {
    const entry = game.journal.find(j => j.id === entryId) ?? null;
    if( !entry ) { throw 'Can\'t find journal entry with id : ' + entryId; }

    const perms = {
      default: CONST.ENTITY_PERMISSIONS.OBSERVER
    };

    await entry.update({permission: perms}, {diff: false, recursive: false, noHook: true});
    this.render();
  }

  /**
   * Make an article entry hidden for all players
   * @param {string} entryId Foundry journal entry id
   */
   async _hideEntry(entryId) {
    const entry = game.journal.find(j => j.id === entryId) ?? null;
    if( !entry ) { throw 'Can\'t find journal entry with id : ' + entryId; }

    const perms = {
      default: CONST.ENTITY_PERMISSIONS.NONE
    };

    await entry.update({permission: perms}, {diff: false, recursive: false, noHook: true});
    this.render();
  }

}
