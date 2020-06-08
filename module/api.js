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
    const query = Object.entries(params).map(e => `${e[0]}=${e[1]}`).join('&');
    if ( query ) endpoint += "?"+query;

    // Submit the request
    console.log(`[World Anvil] Submitting API request to ${endpoint}`);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `Foundry Virtual Tabletop, ${game.data.version}`,
        "x-application-key": this.applicationKey,
        "x-auth-token": this.authToken
      }
    });
    if ( response.status !== 200 ) {
      throw new Error(`World Anvil API request failed for endpoint ${endpoint}`);
    }
    return request.json();
  }

	/* -------------------------------------------- */

  /**
   * Establish a new connection to the World Anvil API, obtaining a list of Worlds
   * @param {string} [authToken]
   */
  async connect(authToken) {
    if ( authToken ) this.authToken = authToken;
    const worlds = await this._fetch("world");
    console.log(worlds); // Not sure what this will return yet
  }

	/* -------------------------------------------- */

  /**
   * Fetch
   * @param articleId
   * @return {Promise<object>}
   */
  async article(articleId) {
    return this._fetch(`article/${articleId}`);
  }

	/* -------------------------------------------- */

  /**
   * Fetch all articles from within a World, optionally filtering with a specific search query
   * @param {string} worldId        The World ID
   * @param {string} [search]       An optional search string
   * @return {Promise<object[]>}    An array of Article objects
   */
  async articles(worldId, search) {
    return this._fetch(`world/${worldId}/articles`);
  }

	/* -------------------------------------------- */

  /**
   * Fetch the data for a World
   * @param {string} worldId
   * @return {Promise<object>}
   */
  async world(worldId) {
    return this._fetch(`world/${worldId}`);
  }
}
