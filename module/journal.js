import {importArticle} from "./framework.js";

/**
 * A World Anvil Directory that allows you to see and manage your World Anvil content in Foundry VTT
 */
export default class WorldAnvilBrowser extends Application {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "world-anvil-config",
      classes: ["world-anvil"],
      template: "modules/world-anvil/templates/journal.html",
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
      categories: categories
    }
  }

	/* -------------------------------------------- */

  /**
   * Obtain and organize the articles for the World
   * @return {Promise<void>}
   */
  async getArticleCategories() {

    // Get folders and articles that could map to WA content
    const articles = await this._getArticles();
    const folders = game.folders.filter(f => (f.data.type === "JournalEntry") && f.data.flags["world-anvil"]);
    const entries = game.journal.filter(j => j.data.flags["world-anvil"]);

    // Organize the articles by category
    const categoryMap = articles.reduce((categories, a) => {

      // Reference or create the category
      let c = a.category || {id: "0", title: "Uncategorized Articles"};
      if ( !categories[c.id] ) {
        c.articles = [];
        c.link = folders.find(f => f.getFlag("world-anvil", "categoryId") === c.id);
        categories[c.id] = c;
      }
      c = categories[c.id];

      // Append the article
      a.link = entries.find(j => j.getFlag("world-anvil", "articleId") === a.id);
      c.articles.push(a);
      return categories;
    }, {});

    // Sort the categories alphabetically
    const categories = Object.values(categoryMap);
    categories.sort((a, b) => {
      if ( b.id === "0" ) return -1;
      return a.title.localeCompare(b.title);
    });
    return this.categories = categories;
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
    html.find("button.world-anvil-control").click(this._onClickControlButton.bind(this));
  }

	/* -------------------------------------------- */

  /**
   * Handle left-click events on a directory import button
   * @private
   */
  async _onClickControlButton(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    switch (action) {
      case "link-folder":
        const category = this.categories.find(c => c.id === button.dataset.categoryId);
        await Folder.create({
          name: `[WA] ${category.title}`,
          type: "JournalEntry",
          parent: null,
          "flags.world-anvil.categoryId": category.id
        });
        return Promise.all(category.articles.map(a => {
          return importArticle(a.id, {renderSheet: false});
        }));
      case "browse-folder":
        break;
      case "link-entry":
        return await importArticle(button.dataset.articleId, {renderSheet: true});
      case "browse-entry":
        const entry = game.journal.get(button.dataset.entryId);
        entry.sheet.render(true);
        break;
      case "sync-folder":
        let wa_category = this.categories.find(c => c.id === button.dataset.categoryId);
        return Promise.all(wa_category.articles.map(a => {
          let article = game.journal.find(e => e.getFlag("world-anvil", "articleId") === a.id);
          return importArticle(a.id, {entry: article, renderSheet: false});
        }));
    }
  }
}
