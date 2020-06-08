import WorldAnvil from "./module/api.js";
import WorldAnvilConfig from "./module/config.js";

/**
 * Initialization actions taken on Foundry Virtual Tabletop client init.
 */
Hooks.on("init", () => {

  // Register settings menu
  WorldAnvilConfig.registerSettings();

  // Register the World Anvil module
  const module = game.modules.get("world-anvil");
  module.anvil = new WorldAnvil();
});


