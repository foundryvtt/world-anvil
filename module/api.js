/**
 * A collection of methods for interacting with the World Anvil API
 * https://www.worldanvil.com/api/aragorn/documentation
 */
export default class WorldAnvil {
  constructor() {
    const config = game.settings.get("world-anvil", "configuration");

    /**
     * The Foundry VTT Application API key
     * @type {string}
     */
    this.applicationKey = "LP2TqRQpsCqcfM6UnQ8vhtE7WPHLXZDS7HgD";

    /**
     * The World Anvil user token
     * @type {string|null}
     */
    this.authToken = config.authToken;

    /**
     * An array of World IDs which belong to the World Anvil user
     * @type {string[]}
     */
    this.worlds = [];

    /**
     * The currently associated World ID
     * @type {string|null}
     */
    this.worldId = config.worldId;

    /**
     * The Flag to indicate the use of World level CSS
     * @type{boolean|null}
     */
    this.enableWorldCSS = game.settings.get("world-anvil", "enableWorldCSS");

    /**
     * The Flag to indicate the use of Article level CSS
     * @type{boolean|null}
     */
    this.enableArticleCSS = game.settings.get("world-anvil", "enableArticleCSS");

    /**
     * The currently associated World Anvil User
     * @type {object|null}
     */
    this.user = null;
  }

	/* -------------------------------------------- */

  /**
   * Report whether we have connected to the World Anvil service by obtaining the User
   * @return {boolean}
   */
  get connected() {
    return !!this.user;
  }

	/* -------------------------------------------- */

  /**
   * Submit an API request to a World Anvil API endpoint
   * @param {string} endpoint     The endpoint name
   * @param {object} params       Additional request parameters
   * @return {Promise<object>}    The World Anvil API response
   * @private
   */
  async _fetch(endpoint, params={}) {
    if ( !this.authToken ) throw new Error("An authentication token has not been set for the World Anvil API.");

    // Structure the endpoint
    endpoint = `https://www.worldanvil.com/api/aragorn/${endpoint}`;

    // Construct querystring
    params["x-application-key"] = this.applicationKey;
    params["x-auth-token"] = this.authToken;
    const query = Object.entries(params).map(e => `${e[0]}=${e[1]}`).join('&');
    endpoint += "?"+query;

    // Submit the request
    console.log(`World Anvil | Submitting API request to ${endpoint}`);
    const response = await fetch(endpoint);
    if ( response.status !== 200 ) {
      throw new Error(`World Anvil API request failed for endpoint ${endpoint}`);
    }
    return response.json();
  }

	/* -------------------------------------------- */

  /**
   * Establish a new connection to the World Anvil API, obtaining a list of Worlds
   * @param {string} [authToken]
   */
  async connect(authToken) {
    if ( authToken !== undefined ) this.authToken = authToken;
    if ( !this.authToken ) return;
    this.user = await this.getUser();
    console.log(`World Anvil | Connected to World Anvil API as User ${this.user.username}`);
  }

	/* -------------------------------------------- */

  /**
   * Fetch
   * @param articleId
   * @return {Promise<object>}
   */
  async getArticle(articleId) {
    return this._fetch(`article/${articleId}`);
  }

	/* -------------------------------------------- */

  /**
   * Fetch all articles from within a World, optionally filtering with a specific search query
   * @param {object} [params]       An optional query parameters
   * @return {Promise<object[]>}    An array of Article objects
   */
  async getArticles(params={}) {
    params.limit = parseInt(params.limit) || 50;
    params.offset = parseInt(params.offset) || 0;

    // Query paged articles until we have retrieved them all
    let hasMore = true;
    let result = null;
    while ( hasMore ) {
      let batch = await this._fetch(`world/${this.worldId}/articles`, params);
      batch.articles = batch.articles || [];
      const nReturned = batch.articles.length;
      hasMore = nReturned === params.limit;  // There may be more
      params.offset += nReturned; // Increment the pagination
      if ( !result ) result = batch;  // Store the 1st result
      else result.articles = result.articles.concat(batch.articles); // Append additional results
    }

    // Return the complete result
    return result;
  }

	/* -------------------------------------------- */

  /**
   * Fetch all articles from within a World, optionally filtering with a specific search query
   * @return {Promise<object>}    The World Anvil User object
   */
  async getUser() {
    return this._fetch("user");
  }

	/* -------------------------------------------- */

  /**
   * Fetch the available Worlds for the current User.
   * Cache the list of worlds in the API object for later reference.
   * @return {Promise<object>}
   */
  async getWorlds() {
    if ( !this.connected ) return [];
    const request = await this._fetch(`user/${this.user.id}/worlds`);
    return this.worlds = request.worlds;
  }

	/* -------------------------------------------- */

  /**
   * Fetch the complete data for a specific World and cache it to the API object
   * @param {string} worldId        The World ID
   * @return {Promise<object>}    An array of Article objects
   */
  async getWorld(worldId) {
    if ( worldId !== undefined ) this.worldId = worldId;
    const world = await this._fetch(`world/${this.worldId}`);
    this.worldId = worldId;
    return this.world = world;
  }


  /**
   * Prepare the provided CSS by:
   *   - Replacing all instances of .user-css with .world-anvil
   *   - Replacing all instances of .user-css-extended with .world-anvil
   *
   * Then, save the CSS to a local file and create a link element (as a string)
   * to include in the content html.
   *
   * The provided name string will have any spaces replaced with '_' and the created
   * file will have the .css extension
   * @param css                   The CSS to save
   * @param name                  The name string to be used for the file name
   * @returns {Promise<string>}   The stylesheet link
   */
  async getCSSLink(css, name) {

    if ( ! css) return "";

    name = name.replace(/\s/g, '_');

    // Replace user-css and user-css-extended with world-anvil
    //   - Removes stand alone class
    css = css.replace(/\.user-css\S*,/g, "");
    //   - Replaces stacked classes
    css = css.replace(/\.user-css\S*[\n\s*]\.user-css\S*/g, ".word-anvil");
    //   - Replaces the rest
    css = css.replace(/\.user-css\S*/g, ".world-anvil");

    // Store the css file locally for use in the articles
    let file = new File([css], `${name}.css`);
    const fd = new FormData();
    fd.set("source", "data");
    fd.set("target", "modules/world-anvil/assets");
    fd.set("upload", file);
    await fetch('/upload', {method: "POST", body: fd});

    return `<link href="/modules/world-anvil/assets/${name}.css" rel="stylesheet">`;
  }
}