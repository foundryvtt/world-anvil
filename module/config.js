/**
 * A configuration sheet FormApplication to configure the World Anvil integration
 */
export default class WorldAnvilConfig extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "world-anvil-config",
    tag: "form",
    position: {
      width: 600,
      height: "auto",
    },
    window: {
      contentClasses: ["standard-form"],
      icon: "fas fa-settings"
    },
    form: {
      closeOnSubmit: false,
      handler: WorldAnvilConfig.#onSubmit
    }
  }
  /** @override */
  static PARTS = {
    main: {
      template: "modules/world-anvil/templates/config.html"
    }
  }

	/* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("WA.ConfigureMenu");
  }

	/* -------------------------------------------- */

  #closeOnSubmit=false;

  /** @override */
  async _prepareContext(_options) {
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
    this.#closeOnSubmit= stepNumber === 3;

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
  static async #onSubmit(event, form, formData) {
    formData.object.authToken = formData.object.authToken.trim();
    await game.settings.set("world-anvil", "configuration", formData.object);
    if(this.#closeOnSubmit){
      this.close();
    } else {
      this.render();
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
    game.settings.register("world-anvil", "configuration", {
      scope: "world",
      config: false,
      default: {},
      type: Object,
      onChange: async c => {
        const anvil = game.modules.get("world-anvil").anvil;
        if ( c.authToken !== anvil.authToken ) await anvil.connect(c.authToken);
        if ( c.worldId !== anvil.worldId ) await anvil.getWorld(c.worldId);
        const app = Object.values(ui.windows).find(a => a.constructor === WorldAnvilConfig);
        if ( app ) app.render();
      }
    });

    game.settings.register("world-anvil", "publicArticleLinks", {
      name: "WA.PublicArticleLinksLabel",
      hint: "WA.PublicArticleLinksHint",
      scope: "world",
      type: Boolean,
      default: false,
      config: true
    });

    // Add the customizable labels for allowing article blocks
    //-------------------
    game.settings.register("world-anvil", "includeArticleBlocks", {
      name: "WA.IncludeArticleBlocksLabel",
      hint: "WA.IncludeArticleBlocksHint",
      scope: "world",
      type: Boolean,
      default: false,
      config: true
    });

    // Add the customizable labels for each importable page
    //-------------------
    game.settings.register("world-anvil", "mainArticlePage", {
      name: "WA.JournalPages.MainArticleLabel",
      hint: "WA.JournalPages.MainArticleHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

    game.settings.register("world-anvil", "secretsPage", {
      name: "WA.JournalPages.SecretsLabel",
      hint: "WA.JournalPages.SecretsHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

    game.settings.register("world-anvil", "sideContentPage", {
      name: "WA.JournalPages.SideContentLabel",
      hint: "WA.JournalPages.SideContentHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

    game.settings.register("world-anvil", "portraitPage", {
      name: "WA.JournalPages.PortraitLabel",
      hint: "WA.JournalPages.PortraitHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });
    game.settings.register("world-anvil", "organizationFlagPage", {
      name: "WA.JournalPages.OrganizationFlagLabel",
      hint: "WA.JournalPages.OrganizationFlagHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

    game.settings.register("world-anvil", "coverPage", {
      name: "WA.JournalPages.CoverLabel",
      hint: "WA.JournalPages.CoverHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

    game.settings.register("world-anvil", "relationshipsPage", {
      name: "WA.JournalPages.RelationshipsLabel",
      hint: "WA.JournalPages.RelationshipsHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

    game.settings.register("world-anvil", "timelinePage", {
      name: "WA.JournalPages.TimelineLabel",
      hint: "WA.JournalPages.TimelineHint",
      scope: "world",
      type: String,
      default: "",
      config: true
    });

  }
}
