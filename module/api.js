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
     * The currently associated World Anvil User
     * @type {object|null}
     */
    this.user = null;
  }

  /**
   * A cached storage of World data
   * @private
   */
  world = null;

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
   * Submit an API request to a World Anvil API endpoint (v1: Aragorn)
   * @param {string} endpoint     The endpoint name
   * @param {object} params       Additional request parameters
   * @return {Promise<object>}    The World Anvil API response
   * @private
   */
  async _fetch(endpoint, params = {}) {
    if (!this.authToken) throw new Error("An authentication token has not been set for the World Anvil API.");

    // Structure the endpoint
    endpoint = `https://www.worldanvil.com/api/aragorn/${endpoint}`;

    // Construct querystring
    params["x-application-key"] = this.applicationKey;
    params["x-auth-token"] = this.authToken;
    const query = Object.entries(params).map(e => `${e[0]}=${e[1]}`).join('&');
    endpoint += "?" + query;

    // Submit the request
    console.log(`World Anvil | Submitting API request to ${endpoint}`);
    const response = await fetch(endpoint);
    if (response.status !== 200) {
      throw new Error(`World Anvil API request failed for endpoint ${endpoint}`);
    }
    return response.json();
  }


  /**
   * Submit an API request to a World Anvil API endpoint (v2: Boromir)
   * @param {string} endpoint     The endpoint name
   * @param {object} params       Additional request parameters
   * @return {Promise<object>}    The World Anvil API response
   * @private
   */
  async _fetchV2(endpoint, params = {}) {
    if (!this.authToken) throw new Error("An authentication token has not been set for the World Anvil API.");

    // Structure the endpoint
    endpoint = `https://www.worldanvil.com/api/external/boromir/${endpoint}`;

    // Construct querystring
    const query = Object.entries(params).filter(e => e[0] != "post").map(e => `${e[0]}=${e[1]}`).join('&');
    if( query != "" ) {
      endpoint += "?" + query;
    }

    // Submit the request
    console.log(`World Anvil | Submitting API request to ${endpoint}`);
    const requestInit = {
      method: "GET",
      headers: {
        "x-application-key": this.applicationKey,
        "x-auth-token": this.authToken
      }
    };
    if( params.post ) {
      requestInit.method = "POST";
      requestInit.body = JSON.stringify(params.post);
    }
    const response = await fetch(endpoint, requestInit);
    if (response.status !== 200) {
      throw new Error(`World Anvil API request failed for endpoint ${endpoint}`);
    }
    return response.json();
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a batch of content from the World Anvil API. (v1: Aragorn)
   * Continue querying paginated content until we have retrieved all results.
   * @param {string} endpoint         The API endpoint being queried
   * @param {string} collectionName   The name of the collection in the returned object
   * @param {number} [limit]          A maximum number of articles to retrieve in this request
   * @param {number} [offset]         An offset index from which to query a batch of categories
   * @param {object} [params]         Additional optional query parameters
   * @return {Promise<object[]>}      An array of returned objects
   */
  async _fetchMany(endpoint, collectionName, {limit = 50, offset = 0, ...params} = {}) {
    let hasMore = true;
    let result = undefined;

    // Iterate until all results are retrieved
    while (hasMore) {
      const batch = await this._fetch(`world/${this.worldId}/${endpoint}`, {limit: limit, offset: offset, ...params});
      batch[collectionName] = batch[collectionName] || [];

      // Determine whether more results are available
      const nReturned = batch[collectionName].length;
      hasMore = nReturned === limit;  // There may be more
      offset += nReturned; // Increment the pagination

      // Store the query results
      if (!result) result = batch;  // Store the 1st result
      else result[collectionName] = result[collectionName].concat(batch[collectionName]); // Append additional results
    }
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a batch of content from the World Anvil API. (v2: Boromir)
   * Continue querying paginated content until we have retrieved all results.
   * @param {string} endpoint         The API endpoint being queried
   * @param {object} [params]         Additional optional query parameters
   * @return {Promise<object[]>}      An array of returned objects
   */
  async _fetchManyV2(endpoint, {...params} = {}) {
    const limit = 50;
    const result = [];
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const post = {limit, offset};
      const batch = await this._fetchV2(`world/${endpoint}`, {post, id: this.worldId, granularity:2, ...params});
      if( !batch.success ) {
        throw new Error(`World Anvil API request failed for ${endpoint} : ${batch.error}`);
      }
      offset += limit;
      hasMore = batch.entities?.length == limit;
      result.push(...batch.entities);
    }
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Establish a new connection to the World Anvil API, obtaining a list of Worlds
   * @param {string} [authToken]
   */
  async connect(authToken) {
    if (authToken !== undefined) this.authToken = authToken;
    if (!this.authToken) return;
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
   * @param {object} [params={}]      Optional query parameters, see _fetchMany
   * @return {Promise<object[]>}      An array of Article objects
   */
  async getArticles(params = {}) {
    return this._fetchMany("articles", "articles", params);
  }

  /* -------------------------------------------- */

  /**
   * Fetch all categories from within a World, optionally filtering with a specific search query
   * @param {object} [params={}]      Optional query parameters, see _fetchMany
   * @return {Promise<object[]>}      An array of category objects
   */
  async getCategories(params = {}) {
    return this._fetchMany("categories", "categories", params);
  }

  /* -------------------------------------------- */

  /**
   * Fetch all timelines and historical entries from within a World, optionally filtering with a specific search query
   * @param {object} [params={}]      Optional query parameters, see _fetchMany
   * @return {Promise<object[]>}      An array of category objects
   */
  async getTimelines(params = {}) {
    return this._fetchManyV2("histories", params);
  }

  /* -------------------------------------------- */

  /**
   * Fetch all timelines and historical entries from within a World, optionally filtering with a specific search query
   * @param {object} [params={}]      Optional query parameters, see _fetchMany
   * @return {Promise<object[]>}      An array of category objects
   */
  async parseContent(content, params = {}) {
    const realParams = {
      post: {
        world: {
          id: this.worldId
        },
        renderer: "html",
        string: content
      },
      ...params
    };

    const result = await this._fetchV2("bbcode", realParams);
    if(!result.success) {
      throw `Can't retrieved parseContent from WA for text ${content} : ${result.reason}`;
    }
    return result.parsedString;
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
    if (!this.connected) return [];
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
    if ( this.world?.id === worldId ) return this.world;
    if (worldId !== undefined) this.worldId = worldId;
    const world = await this._fetch(`world/${this.worldId}`);
    this.worldId = worldId;
    return this.world = world;
  }
}
