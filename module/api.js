/**
 * A collection of methods for interacting with the World Anvil API
 */
export default class WorldAnvil {
  constructor() {

    /**
     * The Foundry VTT Application API key
     * @type {string}
     */
    this.applicationKey = "LP2TqRQpsCqcfM6UnQ8vhtE7WPHLXZDS7HgD";

    /**
     * The World Anvil user token
     * @type {string|null}
     */
    this.authToken = game.settings.get("world-anvil", "authToken");

    /**
     * An array of World IDs which belong to the World Anvil user
     * @type {string[]}
     */
    this.worlds = [];

    /**
     * The currently associated World ID
     * @type {string|null}
     */
    this.worldId = game.settings.get("world-anvil", "worldId");

    /**
     * The currently associated World Anvil User
     * @type {object|null}
     */
    this.user = null;
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
    console.log(`[World Anvil] Submitting API request to ${endpoint}`);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "User-Agent": `Foundry Virtual Tabletop, ${game.data.version}`,
      }
    });
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
    if ( authToken ) this.authToken = authToken;
    this.user = await this.getUser();
    console.log(`Connected to World Anvil API as User ${this.user.username}`);
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
   * @param {string} worldId        The World ID
   * @param {string} [search]       An optional search string
   * @return {Promise<object[]>}    An array of Article objects
   */
  async getArticles(worldId, search) {
    return this._fetch(`world/${worldId}/articles`);
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
   * Fetch the data for a World
   * @param {string} worldId
   * @return {Promise<object>}
   */
  async getWorld(worldId) {
    return this._fetch(`world/${worldId}`);
  }
}
