# Foundry Virtual Tabletop - World Anvil Integration

This module provides an integration with [World Anvil](https://worldanvil.com) for Foundry Virtual Tabletop, allowing you to import article content from World Anvil into the Foundry VTT journal system and easily keep that content synchronized over time as you update and create articles on the World Anvil platform.

Watch the following video to learn more about this module and how to use it: https://www.youtube.com/watch?v=o9DMELe7G_o

-----

## Installation

This module can be installed automatically from the Foundry Virtual Tabletop module browser, or by using the following module manifest url: (https://gitlab.com/foundrynet/world-anvil/-/raw/master/module.json).

-----

## Configuration

To begin using this module, some initial configuration is required. You must provide a World Anvil user authorization API token which is available to any Guild member user by visiting the **API Keys Management** section of your World Anvil user dashboard.

Enable the World Anvil module in Foundry VTT and click the small **WA** logo at the bottom-right of the Journal Directory to open the World Anvil browser. This will open an initial configuration screen where you should enter your User Authentication Token and then choose the World from which you want to import content.

-----

## Importing World Anvil Content

Once the module is configured, the same **WA** icon will open the World Anvil browser which allows you to see all the Categories and Articles which exist within your world.

Clicking on the name of a Category or an Article will open the respective page on the World Anvil website. Clicking the button on the right side of the page will import the category or article into Foundry Virtual Tabletop.

### Importing a Category

When importing a category, it will become a Folder in your Journal sidebar and all articles within that category will be imported as entries under that new Folder.

### Importing a Single Article

When importing a single article, it will become a new Journal Entry in your Journal sidebar which you can move to a Folder of your choice.

![World Anvil Browser](docs/README_main_capture.png?raw=true)

### Permission Controls

All functionality of this module is restricted to Gamemaster users only.

This module does not currently attempt to preserve permission or visibility control settings from World Anvil when importing content into Foundry VTT. Instead any imported content will be private only for the Gamemaster user who imported it.

### Custom permission control

Game-Masters will be able to see which entry have been displayed to players via their World Anvil Browser inside Foundry VTT. Using the World Anvil browser they can manage the visibility of each article or even an entire category:


-----

## Updating/Syncing an Article

Once a Category or Article has been imported, a link to it will display in the World Anvil Browser instead of an import button. For any imported World Anvil article, there is a **WA Sync** button in the header of the article which allows you to refresh the content, pulling the latest changes from the World Anvil website.

### Cross-Links

Content links from World Anvil are also preserved in Foundry VTT. If the linked Article has already been imported, the link will open the Journal Entry in Foundry VTT, otherwise that linked Article will be automatically imported.

-----

## Software License and Contribution Policy

This software is licensed under the MIT License. See the LICENSE.txt file in this repository for details.

If you would like to contribute to making this software better, merge requests are welcomed. In your merge request, please include a clear description of the change you are making and be prepared to engage with me for 1-2 rounds of code review.

### Contributors

Thanks to the following individuals for their valued contributions to this module.

* Dimitris from World Anvil
* Adrien Schiehle
* Megastrukur
