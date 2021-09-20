import {importArticle} from "./framework.js";


// Convenience function that build a category branch and subbranches
const buildCategoryBranch = ( category, rawCategories, categoryMap ) => {

  const rawChilds = rawCategories.filter( c => {
    return c.parent_category?.id === category.id; 
  }).sort( (a,b) => a.title.localeCompare(b.title));

  const childs = rawChilds.map( c => {
    return buildCategoryBranch(c, rawCategories, categoryMap);
  });
  
  const data = mergeObject( {childs: childs}, category );
  categoryMap.set( data.id, data );
  return data;
}

const filterArticlesAndStoreThemByCategoryId = (rawArticles, entries, displayDraft, displayWIP ) => {
  const result = new Map();
  const filteredArticles = rawArticles.filter( article => {
    if ( article.is_draft && !displayDraft ) return false;
    if ( article.is_wip && !displayWIP ) return false;
    return true;

  }).map( article => {
    const articleLink = entries.find(j => j.getFlag("world-anvil", "articleId") === article.id) ?? null;

    const displayVisibilityButtons = articleLink != null;
    const visibleByPlayers = articleLink?.data.permission.default >= CONST.ENTITY_PERMISSIONS.OBSERVER;

    const useSecrets = game.settings.get("world-anvil", "useSecrets") ?? false;
    const displaySecretButtons = visibleByPlayers && useSecrets;
    const entrySecretsAreVisible = articleLink?.getFlag("world-anvil", "secretsDisplayed") ?? false;

    const entry = {
      present: articleLink != null,
      displayVisibilityButtons: displayVisibilityButtons,
      visibleByPlayers: visibleByPlayers,
      displaySecretButtons: displaySecretButtons,
      entrySecretsAreVisible: entrySecretsAreVisible,
      link: articleLink
    };
    return mergeObject( {entry: entry}, article);
    
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

// Convenience function that build a category branch and subbranches
const fillCategoryBranchWithFolderAndArticles = ( category, articleMap, folders, currentTreeLevel ) => {

  const relatedArticles = articleMap.get( category.id ) ?? [];
  const categoryLink = folders.find(f => f.getFlag("world-anvil", "categoryId") === category.id) ?? null;

  const displayVisibilityButtons = relatedArticles.length > 0 && categoryLink != null;
  const visibleByPlayers = relatedArticles.find( a => a.entry.visibleByPlayers )?.entry.visibleByPlayers ?? false;

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
  mergeObject(data, category);
  data.childs = data.childs.map( child => fillCategoryBranchWithFolderAndArticles(child, articleMap, folders, currentTreeLevel + 1) );

  return data;
}

const pushCategoryAndChildsInsideArray = ( category, result ) => {

  const childResults = [];
  category.childs.forEach( child => {
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


const createFolderIfNotExists = async (waCategoryId, categories) => {

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
    return mergeObject(super.defaultOptions, {
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
    const categories = await this._getCategories();
    const articles = await this._getArticles();

    const folders = game.folders.filter(f => (f.data.type === "JournalEntry") && f.data.flags["world-anvil"]);
    const entries = game.journal.filter(j => j.data.flags["world-anvil"]);

    const articleMap = filterArticlesAndStoreThemByCategoryId(articles, entries, this._displayDraft, this._displayWIP )
    const updatedTree = categories.tree.map( category => fillCategoryBranchWithFolderAndArticles(category, articleMap, folders, 0));

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

  /**
   * Get all World Anvil categories and cache them to this Application instance.
   * Then sort them and build a tree taking parents into account
   * @return {Promise<object[]>}
   * @private
   */
   async _getCategories() {

    if ( !this._categories ) {

      // API request
      const request = await this.anvil.getCategories();
      const rawCategories = request?.categories ?? [];
      const categoryMap = new Map();

      const categoryTree = rawCategories.filter( c => {
        return !c.parent_category;
      }).map( c => {
        return buildCategoryBranch( c, rawCategories, categoryMap );
      }).sort( (a,b) => a.title.localeCompare(b.title) );
      
      // Add a new category ofr uncategorized article
      const uncategorized = { 
        id: '0', 
        title: game.i18n.localize('WA.uncategorized'),
        childs : []
      };
      categoryMap.set(uncategorized.id, uncategorized);
      categoryTree.push(uncategorized);

      this._categories = {
        all: categoryMap,
        tree: categoryTree
      };
    }
    return this._categories;
  }

	/* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.world-anvil-control.link-folder").click(this._onClickLinkFolder.bind(this));
    html.find("button.world-anvil-control.display-folder").click(this._onClickDisplayFolder.bind(this));
    html.find("button.world-anvil-control.hide-folder").click(this._onClickHideFolder.bind(this));
    html.find("button.world-anvil-control.sync-folder").click(this._onClickSyncFolder.bind(this));
    html.find("button.world-anvil-control.link-entry").click(this._onClickLinkEntry.bind(this));
    html.find("button.world-anvil-control.browse-entry").click(this._onClickBrowseEntry.bind(this));
    html.find("button.world-anvil-control.display-entry").click(this._onClickDisplayEntry.bind(this));
    html.find("button.world-anvil-control.hide-entry").click(this._onClickHideEntry.bind(this));
    html.find("button.world-anvil-control.display-secrets").click(this._onClickDisplaySecrets.bind(this));
    html.find("button.world-anvil-control.hide-secrets").click(this._onClickHideSecrets.bind(this));
    html.find("button.world-anvil-control.toggle-drafts").click(this._onClickToggleDrafts.bind(this));
    html.find("button.world-anvil-control.toggle-wip").click(this._onClickToggleWIP.bind(this));
  }

	/* -------------------------------------------- */

  async _onClickLinkFolder(event) {
    const button = event.currentTarget;
    
    await createFolderIfNotExists(button.dataset.categoryId, this.categories);
    return Promise.all(category.articles.map(a => {
      return importArticle(a.id, {renderSheet: false});
    }));
  }

  async _onClickDisplayFolder(event) {
    // Toggle visiblity of every related article. Let child category as they are
    const button = event.currentTarget;
    const categoryId = button.dataset.categoryId;

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

  async _onClickHideFolder(event) {
    // Toggle visiblity of every related article. Let child category as they are
    const button = event.currentTarget;
    const categoryId = button.dataset.categoryId;

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

  async _onClickSyncFolder(event) {
    const button = event.currentTarget;
    
    const waCategory = this.categories.find(c => c.id === button.dataset.categoryId);
    return Promise.all(waCategory.articles.map(a => {
      const article = game.journal.find(e => e.getFlag("world-anvil", "articleId") === a.id);
      return importArticle(a.id, {entry: article, renderSheet: false});
    }));
  }

  async _onClickLinkEntry(event) {
    const button = event.currentTarget;
    
    return await importArticle(button.dataset.articleId, {renderSheet: true});
  }

  async _onClickBrowseEntry(event) {
    const button = event.currentTarget;
    
    const entry = game.journal.get(button.dataset.entryId);
    entry.sheet.render(true);
  }

  async _onClickDisplayEntry(event) {
    const button = event.currentTarget;
    const entryId = button.dataset.entryId;
    
    const entry = game.journal.find(j => j.id === entryId) ?? null;
    if( !entry ) { throw 'Can\'t find journal entry with id : ' + entryId; }

    const perms = {
      default: CONST.ENTITY_PERMISSIONS.OBSERVER
    };

    await entry.update({permission: perms}, {diff: false, recursive: false, noHook: true});
    this.render();
  }

  async _onClickHideEntry(event) {
    const button = event.currentTarget;
    const entryId = button.dataset.entryId;
    
    const entry = game.journal.find(j => j.id === entryId) ?? null;
    if( !entry ) { throw 'Can\'t find journal entry with id : ' + entryId; }

    const perms = {
      default: CONST.ENTITY_PERMISSIONS.NONE
    };

    await entry.update({permission: perms}, {diff: false, recursive: false, noHook: true});
    this.render();
  }

  async _onClickDisplaySecrets(event) {
    const button = event.currentTarget;
    const articleId = button.dataset.articleId;
    const entryId = button.dataset.entryId;
    
    const entry = game.journal.find(j => j.id === entryId) ?? null;
    if( !entry ) { throw 'Can\'t find journal entry with id : ' + entryId; }

    await entry.setFlag("world-anvil", "secretsDisplayed", true);
    await importArticle(articleId, {entry: entry, renderSheet: false});

    this.render();
  }

  async _onClickHideSecrets(event) {
    const button = event.currentTarget;
    const articleId = button.dataset.articleId;
    const entryId = button.dataset.entryId;
    
    const entry = game.journal.find(j => j.id === entryId) ?? null;
    if( !entry ) { throw 'Can\'t find journal entry with id : ' + entryId; }

    await entry.setFlag("world-anvil", "secretsDisplayed", false);
    await importArticle(articleId, {entry: entry, renderSheet: false});

    this.render();
  }

  async _onClickToggleDrafts(event) {
    this._displayDraft = !this._displayDraft;
    return this.render();
  }

  async _onClickToggleWIP(event) {
    this._displayWIP = !this._displayWIP;
    return this.render();
  }

}
