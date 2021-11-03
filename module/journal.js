import {importArticle, getArticleContent, getCategories, refreshCategoryFolders, CATEGORY_ID} from "./framework.js";

/**
 * A World Anvil Directory that allows you to see and manage your World Anvil content in Foundry VTT
 */
export default class WorldAnvilBrowser extends Application {

  /**
   * An array of Articles which appear in this World
   * TODO: Refactor as Map
   * @type {Article[]}
   */
  articles;

  /**
   * A mapping of Categories which appear in this World
   * @type {Map<string, Category>}
   */
  categories;

  /**
   * Flag whether to display draft articles
   * @type {boolean}
   * @private
   */
  _displayDraft = true;

  /**
   * Flag whether to display WIP articles
   * @type {boolean}
   * @private
   */
  _displayWIP = true;

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "world-anvil-browser",
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
    const tree = await this.getContentTree();
    return {
      world: world,
      tree: tree,
      displayDraft: this._displayDraft,
      displayWIP: this._displayWIP
    }
  }

	/* -------------------------------------------- */

  /**
   * Obtain and organize the articles for the World
   * @return {Promise<Category[]>}
   */
  async getContentTree() {

    // Get all articles and folders from the World Anvil API
    const {categories, tree} = await this._getCategories();
    const articles = await this._getArticles();
    let contentTree = tree.children;

    // Get all Folder and JournalEntry documents which contain imported World Anvil data
    refreshCategoryFolders(categories);

    // Reset status of each category
    for ( let [id, category] of categories ) {
      category.articles = [];
    }
    const uncategorized = categories.get( CATEGORY_ID.uncategorized );

    // Organize articles into their parent category
    const entries = game.journal.filter(j => j.data.flags["world-anvil"]);
    for ( let article of articles ) {

      // Skip articles which should not be displayed
      if ( article.is_draft && !this._displayDraft ) continue;
      if ( article.is_wip && !this._displayWIP ) continue;

      // Check linked entry permissions
      article.entry = entries.find(e => e.getFlag("world-anvil", "articleId") === article.id);
      article.visibleByPlayers = article.entry?.data.permission.default >= CONST.ENTITY_PERMISSIONS.OBSERVER;

      // Get the category to which the article belongs
      const category = categories.get(article.category?.id) || uncategorized;
      category.articles.push(article);
    }

    // Sort articles within each category
    for ( let category of categories.values() ) {
      category.articles.sort( (a,b) => a.title.localeCompare(b.title) );
    }

    // Add empty attribute on categories. 
    this._calculateCategoryEmptyness(this.tree);
    this._calculateCategoryVisibility(this.tree);

    return contentTree;
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
    if ( !this.categories ) {
      const {categories, tree} = await getCategories();
      this.categories = categories;
      this.tree = tree;
    }
    return {categories: this.categories, tree: this.tree};
  }

	/* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".article-title").click(this._onClickArticleTitle.bind(this));
    html.find("button.world-anvil-control").click(this._onClickControlButton.bind(this));
  }

	/* -------------------------------------------- */

  /**
   * Handle left-click events on an article title
   * @private
   */
  async _onClickArticleTitle(event) {
    event.preventDefault();
    const el = event.currentTarget.closest(".article");

    // Already imported entry
    let entry = game.journal.get(el.dataset.entryId);
    if ( entry ) return entry.sheet.render(true);

    // New temporary entry
    const article = await this.anvil.getArticle(el.dataset.articleId);
    const content = getArticleContent(article);
    entry = new JournalEntry({
      name: article.title,
      content: content.html,
      img: content.img
    });
    return entry.sheet.render(true, {editable: false});
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

      // Header control buttons
      case "import-all":
        return this._importCategory(this.tree);
      case "sync-all":
        return this._importCategory(this.tree, {onlyExistingOnes:true} );
      case "toggle-drafts":
        this._displayDraft = !this._displayDraft;
        return this.render();
      case "toggle-wip":
        this._displayWIP = !this._displayWIP;
        return this.render();

      // Category control buttons
      case "sync-folder":
        return this._syncFolder(button.closest(".category").dataset.categoryId);
      case "display-folder":
        return this._displayFolder(button.closest(".category").dataset.categoryId);
      case "hide-folder":
        return this._hideFolder(button.closest(".category").dataset.categoryId);

      // Article control buttons
      case "sync-entry":
        return this._syncEntry(button.closest(".article").dataset.articleId);
      case "display-entry":
        return this._displayEntry(button.closest(".article").dataset.entryId);
      case "hide-entry":
        return this._hideEntry(button.closest(".article").dataset.entryId);
    }
  }

  /* -------------------------------------------- */

  /**
   * Fully link a category by creating a Folder and importing all its contained articles.
   * @param {string} categoryId     World Anvil category ID
   */
  async _syncFolder(categoryId) {
    const category = this.categories.get(categoryId);
    await this._importCategory(category);
  }

  /* -------------------------------------------- */

  /**
   * Import or refresh an article, and then display it
   * @param {string} categoryId     World Anvil article ID
   */
   async _syncEntry(articleId) {
    return importArticle(articleId, {categories: this.categories});
  }

  /* -------------------------------------------- */

  /**
   * Make every related article of a category visible. Let child category as they are
   * @param {string} categoryId WA category id
   */
  async _displayFolder(categoryId) {
    const category = this.categories.get(categoryId);
    const articles = category?.articles ?? [];
    const updates = articles.filter( a => {
      return !a.entry?.data.permission.default < CONST.ENTITY_PERMISSIONS.OBSERVER;
    }).map( a => {
      return {
        _id: a.entry.id,
        permission: { default: CONST.ENTITY_PERMISSIONS.OBSERVER }
      }
    });

    if( updates.length > 0 ) {
      await JournalEntry.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
    }
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Make every related article of a category hidden. Let child category as they are
   * @param {string} categoryId WA category id
   */
  async _hideFolder(categoryId) {
    const category = this.categories.get(categoryId);
    const articles = category?.articles ?? [];
    const updates = articles.filter( a => {
      return a.entry?.data.permission.default >= CONST.ENTITY_PERMISSIONS.OBSERVER;
    }).map( a => {
      return {
        _id: a.entry.id,
        permission: { default: CONST.ENTITY_PERMISSIONS.NONE }
      }
    });

    if( updates.length > 0 ) {
      await JournalEntry.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
    }
    this.render();
  }

  /* -------------------------------------------- */

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

  /* -------------------------------------------- */

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

  /* -------------------------------------------- */

  async _importCategory( category, {onlyExistingOnes=false} = {} ) {
    ui.notifications.info(`Bulk importing articles in ${category.title}, please be patient.`);
    const articles = this._articlesFromNode(category);
    for ( const article of articles ) {
      if ( onlyExistingOnes && !article.entry ) continue;
      await importArticle(article.id, {categories: this.categories, notify: false, renderSheet: false});
    }
    ui.notifications.info("Bulk article import completed successfully!")
  }

  /**
   * See for this category and its subcategory if it has content or not.
   * A category is empty if it has no articles and its subcategory are empty too
   * Set its empty attribute.
   * @param {object} node Category tree branch. Can be the root element
   */
  _calculateCategoryEmptyness( node ) {

    node.children.forEach(child => this._calculateCategoryEmptyness(child) );

    const noArticle = node.articles.length == 0;
    const emptyChildren = node.children.reduce( (empty, current) => {
      return empty && current.empty;
    }, true);

    node.empty = noArticle && emptyChildren;
  }

  /**
   * See for this category and its subcategory if its content is visible or not.
   * A category is visible if it at least one of its articles is visible
   * Set its visibility attribute.
   * @param {object} node Category tree branch. Can be the root element
   */
   _calculateCategoryVisibility( node ) {

    node.children.forEach(child => this._calculateCategoryVisibility(child) );

    node.displayVisibilityButtons = node.folder && node.articles.findIndex( a => a.entry ) != -1;
    node.visibleByPlayers = node.articles.findIndex( a => a.visibleByPlayers ) != -1;
  }

  /**
   * Retrieve a part of the articles, sorted in a way that upper leaf will be handled before the lower ones
   * @param {object} node Category tree branch. Can be the root element
   * @returns {object[]} All articles, with the ones from the upper leaf first
   */
  _articlesFromNode( node ) {
    const result = [];
    if( node.articles ) { // Some node have no articles (like the root one)
      result.push(...node.articles);
    }
    node.children.forEach(child => {
      result.push(...this._articlesFromNode(child) );
    });
    return result;
  }
}

