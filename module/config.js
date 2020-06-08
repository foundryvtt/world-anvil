/**
 * A configuration sheet FormApplication to configure the World Anvil integration
 * @extends {FormApplication}
 */
export default class WorldAnvilConfig extends FormApplication {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "world-anvil-config",
      template: "modules/world-anvil/templates/config.html",
      width: 600,
      height: "auto",
      closeOnSubmit: false
    });
  }

	/* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("WA.ConfigureMenu");
  }

	/* -------------------------------------------- */

  /** @override */
  getData() {
    const anvil = game.modules.get("world-anvil").anvil;
    return {
      worlds: anvil.worlds,
      worldId: anvil.worldId,
      authToken: anvil.authToken
    };
  }

	/* -------------------------------------------- */

  /** @override */
  _updateObject(event, formData) {
    for ( let [k, v] of Object.entries(formData) ) {
      game.settings.set("world-anvil", k, v);
    }
  }

	/* -------------------------------------------- */

  /**
   * Register game settings and menus for managing the World Anvil integration.
   */
  static registerSettings() {

    // World Anvil Configuration Menu
    game.settings.registerMenu("world-anvil", "config", {
      name: "WA.ConfigureMenu",
      label: "WA.ConfigureLabel",
      hint: "WA.ConfigureHint",
      icon: "fas fa-user-lock",
      type: WorldAnvilConfig,
      restricted: true
    });

    // Auth User Key
    game.settings.register("world-anvil", "authToken", {
      name: "WA.UserToken",
      hint: "WA.UserTokenHint",
      scope: "world",
      config: false,
      default: null,
      type: String,
      onChange: token => {
        game.modules.get("world-anvil").anvil.connect(token)
      }
    });

    // Associated World ID
    game.settings.register("world-anvil", "worldId", {
      name: "WA.WorldId",
      hint: "WA.WorldIdHint",
      scope: "world",
      config: false,
      default: null,
      type: String,
      onChange: worldId => {
        game.modules.get("world-anvil").anvil.worldId = worldId;
      }
    })
  }
}