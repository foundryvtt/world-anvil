import {importArticle, getArticleContent, getCategories, CATEGORY_ID} from "./framework.js";

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
   * On first init, close subcategories
   * @type {boolean}
   */
  _firstInit = true;

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

  /**
   * Storing which categories were collapsed
   * @type {string[]}
   * @private
   */
  _collapsedCategories = [];

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
    this._refreshCategoryVisibility();
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
    const {categories, tree} = await getCategories();
    this.categories = categories;
    this.tree = tree;
    const articles = await this._getArticles();
    let contentTree = tree.children;

    // Reset status of each category
    for ( let category of categories.values() ) {
      category.articles = [];
      category.unsortedArticles = [];
    }
    const uncategorized = categories.get( CATEGORY_ID.uncategorized );

    // Organize articles into their parent category
    const entries = game.journal.filter(j => j.flags["world-anvil"]);
    for ( let article of articles ) {

      // Skip articles which should not be displayed
      if ( article.is_draft && !this._displayDraft ) continue;
      if ( article.is_wip && !this._displayWIP ) continue;

      // Check linked entry permissions
      article.entry = entries.find(e => e.getFlag("world-anvil", "articleId") === article.id);
      article.visibleByPlayers = article.entry?.ownership.default >= CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;

      // Get the category to which the article belongs
      const category = categories.get(article.category?.id) || uncategorized;
      category.unsortedArticles.push(article);
    }

    // Sort articles within each category
    for ( let category of categories.values() ) {
      category.articles = category.articleIds
        .map( id => category.unsortedArticles.find( a => a.id === id )  )
        .filter( a => !!a );
      
      // Some may not be referenced (created after)
      const unreferencedArticles = category.unsortedArticles.filter(a => !category.articles.find( a2 => a == a2) );
      unreferencedArticles.sort( (a,b) => {
        const titleA = a.title ?? "";
        const titleB = b.title ?? "";
        return titleA.localeCompare(titleB);
      });
      category.articles.push(...unreferencedArticles);
    }
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

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".article-title").click(this._onClickArticleTitle.bind(this));
    html.find("button.world-anvil-control").click(this._onClickControlButton.bind(this));
    html.find(".collapsed-icon").click(this._onClickCollapseFolder.bind(this));
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
      case "refresh-all":
        return this._refreshAll();
      case "import-all":
        return this._importCategory(this.tree);
      case "sync-all":
        return this._importCategory(this.tree, {sync: true} );
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
   * Collapse inside the category inside journal display. (Or expand it)
   * @private
   */
   async _onClickCollapseFolder(event) {
    const icon = event.currentTarget;
    const categoryId = icon.closest(".category").dataset.categoryId;
    const alreadyCollapsed = this._collapsedCategories.includes( categoryId );
    if( alreadyCollapsed ) {
      this._collapsedCategories = this._collapsedCategories.filter( id => id != categoryId );
    } else {
      this._collapsedCategories.push( categoryId );
    }
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Call WA to refresh the categories and the articles.
   * Category tree will be rebuild when render() is called
   */
   async _refreshAll() {
    await getCategories({cache: false});
    this.articles = undefined;
    this.render();
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
      return !a.entry?.ownership.default < CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;
    }).map( a => {
      return {
        _id: a.entry.id,
        permission: { default: CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER }
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
      return a.entry?.ownership.default >= CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;
    }).map( a => {
      return {
        _id: a.entry.id,
        permission: { default: CONST.DOCUMENT_PERMISSION_LEVELS.NONE }
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
      default: CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER
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
      default: CONST.DOCUMENT_PERMISSION_LEVELS.NONE
    };

    await entry.update({permission: perms}, {diff: false, recursive: false, noHook: true});
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Import all articles contained within a single Category.
   * @param {Category} category           The Category for which we are importing content
   * @param {boolean} [sync=false]        Only sync articles which have already been imported
   * @private
   */
  async _importCategory( category, {sync=false} = {} ) {
    ui.notifications.info(`Bulk importing articles in ${category.title}, please be patient.`);
    const articles = this._getAllArticlesUnderCategory(category);
    for ( const article of articles ) {
      if ( sync && !article.entry ) continue;
      await importArticle(article.id, {categories: this.categories, notify: false, renderSheet: false});
    }
    ui.notifications.info("Bulk article import completed successfully!")
  }

  /* -------------------------------------------- */

  /**
   * Create an array of all articles which belong to a certain category node.
   * Recursively add articles belonging to sub-categories.
   * @param {object} node Category tree branch. Can be the root element
   * @returns {object[]} All articles, with the ones from the upper leaf first
   */
  _getAllArticlesUnderCategory( node ) {
    const result = [];
    for ( let article of (node.articles || []) ) {
      result.push(article);
    }
    for ( let category of node.children ) {
      result.push(...this._getAllArticlesUnderCategory(category));
    }
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Calls ._calculateCategoryVisibility
   * On first call will init ._collapsedCategories before calling it.
   */
  _refreshCategoryVisibility() {
    if(this._firstInit) {
      const firstLevelsIds = this.tree.children.map( c => c.id );
      firstLevelsIds.push(CATEGORY_ID.root);

      this._collapsedCategories = [...this.categories.values()]
        .map( cat => cat.id )
        .filter(catId => !firstLevelsIds.includes(catId));
    }
    this._calculateCategoryVisibility(this.tree);
    this._firstInit = false;
  }

  /**
   * Recursive
   * Set .displayVisibilityButtons, .visibleByPlayers, .hasChildrenWithContent, .hasContent
   * Article visibility : default permission on article is at least OBSERVER
   * Category visibility : is visible if it at least one of its articles is visible
   * Category with content : Has some articles (visible or not) or has a child which have some
   * @param {object} node Category tree branch. Can be the root element
   */
   _calculateCategoryVisibility( node ) {
    node.children.forEach(child => this._calculateCategoryVisibility(child) );
    node.displayVisibilityButtons = node.folder && node.articles.findIndex( a => a.entry ) !== -1;
    node.visibleByPlayers = node.articles.findIndex( a => a.visibleByPlayers ) !== -1;

    node.hasChildrenWithContent = node.children.filter( child => child.hasContent).length > 0;
    node.hasContent = node.hasChildrenWithContent || node.articles.length > 0;

    node.hasBeenCollapsed = this._collapsedCategories.includes( node.id );
  }
}

