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
  async getData() {
    const anvil = game.modules.get("world-anvil").anvil;

    // Determine the configuration step
    let stepNumber = 0;
    let stepLabel = "WA.ConfigureStep3";
    if ( !anvil.user ) {
      stepLabel = "WA.ConfigureStep1";
      stepNumber = 1;
    }
    else if ( !anvil.worldId ) {
      stepLabel = "WA.ConfigureStep2";
      stepNumber = 2;
    }
    else stepNumber = 3;

    // If we have reached step 3, we can safely close the form when it is submitted
    if ( stepNumber === 3 ) this.options.closeOnSubmit = true;

    // Maybe retrieve a list of world options
    if ( anvil.user && !anvil.worlds.length ) await anvil.getWorlds();

    // Return the template data for rendering
    return {
      stepLabel: stepLabel,
      displayWorldChoices: stepNumber >= 2,
      worlds: anvil.worlds,
      worldId: anvil.worldId,
      authToken: anvil.authToken
    };
  }

	/* -------------------------------------------- */

  /** @override */
  _updateObject(event, formData) {
    formData.authToken = formData.authToken.trim();
    game.settings.set("world-anvil", "configuration", formData);
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
    game.settings.register("world-anvil", "configuration", {
      scope: "world",
      config: false,
      default: null,
      type: Object,
      onChange: async c => {
        const anvil = game.modules.get("world-anvil").anvil;
        if ( c.authToken !== anvil.authToken ) await anvil.connect(c.authToken);
        if ( c.worldId !== anvil.worldId ) await anvil.getWorld(c.worldId);
        const app = Object.values(ui.windows).find(a => a.constructor === WorldAnvilConfig);
        if ( app ) app.render();
      }
    });
  }
}