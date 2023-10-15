/**
 * Easy access to localized page names
 */
export default class WorldAnvilPageNames {

    #fromSettings(pageKey) {
      let pageName = game.settings.get("world-anvil", pageKey + "Page") ?? "";
      if( pageName == "" ) {
        const forI18n = pageKey.substring(0,1).toUpperCase() + pageKey.substring(1);
        pageName = game.i18n.localize(`WA.JournalPages.${forI18n}Default`);
      }
      return pageName;
    }
  
    /**
     * @returns {string} name of the main page
     */
    get mainArticle() { return this.#fromSettings("mainArticle"); }
  
    /**
     * @returns {string} name of the main page
     */
    get secrets() { return this.#fromSettings("secrets"); }
  
    /**
     * @returns {string} name of the main page
     */
    get sideContent() { return this.#fromSettings("sideContent"); }
  
    /**
     * @returns {string} name of the main page
     */
    get portrait() { return this.#fromSettings("portrait"); }
  
    /**
     * @returns {string} name of the main page
     */
    get organizationFlag() { return this.#fromSettings("organizationFlag"); }
  
    /**
     * @returns {string} name of the main page
     */
    get cover() { return this.#fromSettings("cover"); }
  
    /**
     * @returns {string} name of the main page
     */
    get relationships() { return this.#fromSettings("relationships"); }
  
    /**
     * @returns {string} name of the main page
     */
    get timeline() { return this.#fromSettings("timeline"); }
}
  