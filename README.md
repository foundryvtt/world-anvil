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

![World Anvil Browser](https://foundryvtt.s3.us-west-2.amazonaws.com/website-media-dev/user_1/screen/world-anvil-browser-2020-06-10.jpg)

### Permission Controls from World Anvil

All functionality of this module is restricted to Gamemaster users only.

This module does not currently attempt to preserve permission or visibility control settings from World Anvil when importing content into Foundry VTT. Instead any imported content will be private only for the Gamemaster user who imported it.

### Custom permission control

GMs will be able to see which entry have been displayed to players via their World Anvil Browser inside Foundry.

Inside it, they can manage visibility of each article, or of an entire category: 

![Preview](/README_secretManagement.png?raw=true)

-----

## Updating/Syncing an Article

Once a Category or Article has been imported, a link to it will display in the World Anvil Browser instead of an import button. For any imported World Anvil article, there is a **WA Sync** button in the header of the article which allows you to refresh the content, pulling the latest changes from the World Anvil website.

### Cross-Links

Content links from World Anvil are also preserved in Foundry VTT. If the linked Article has already been imported, the link will open the Journal Entry in Foundry VTT, otherwise that linked Article will be automatically imported.

### Automatically create characters in your world

This features allow you to directly create an Actor inside Foundry after synchronizing a WA article with a *Character* template.

The resulted Actor will have the Journal entry main image as portrait. *( Usually the first image displayed on WA article, or the portrait if set ).

The Actor will also have their biography updated with the Journal Entry content. 

You can also have Storyteller seeds on this articles. They won' be displayed in Actor biography until you chose to.

Actors will be stored in an subdirectory with the same name as the journal entry category.

To activate it, use those configuration parameters :
![Preview](/README_config_for_characters.png?raw=true)

- Automatically create characters : *Unchecked by default. Will allow you automatically import characters.*

- Default character type: *FVTT actor template that will be used when creating the Actor. Available actor templates are described in the template.json of your world system. Default value is ok for dnd5*

- Default character bio field: *In which field should the description be stored inside your article template. Default value is ok for dnd5*

- Default character token: *Tokens can't shared an image with a distant server and should be stored locally. When umporting a new character this way, it's token will be set to this img. You can still change it afterwards, it won't be erased by a future syncho.*


### Seeds can be hidden to players

You can use this by checking **Use secrets management system** inside module configuration.

By default, world anvil seeds part won't be visible to players.
GMs can click on the Hide Scret/Display secret toggle inside each sheet to let the players see its contents.

*It only handle Storyteller Seeds present on each article. Secret entities are unfortunately out of the scope*

By combining this with the character creation, you will be able to do things like that : 
![Preview](/README_resulting_character.png?raw=true)

-----

## Linking articles from other parts of your system

You may need to add some links to your WA entries inside other sheets, like your items sheets.

For that, you will need to retrieve your articleId from world-anvil api. (Or just F12 while synchronizing your article).

With it, you will be able to link to your entry inside your other sheets :
~~~html
<span class="wa-link" data-article-id="<your article id>">Link description</span>
~~~

In order to trigger the links when clicking :
~~~js
/** @override */
activateListeners(html) {
    super.activateListeners(html);
    html.find('.wa-link').click(event => game.modules.get("world-anvil").helpers.displayWALink(event));
    // [...]
}
~~~

### Using shortcuts

If there are journal entries that you link very often, you can use this syntax instead :
~~~html
<span class="wa-link" data-shortcut="spells.fireball"> </span>
~~~

It will allow you to store the label, article id, and anchor (optionaly) in only one place.

If you use this method, you will need to use this

~~~js
/** @override */
activateListeners(html) {
    super.activateListeners(html);
    game.modules.get("world-anvil").helpers.substituteShortcutsAndHandleClicks(html);
    // [...]
}

// And Once :
game.modules.get("world-anvil").helpers.registerShortcuts({
    spells : {
        fireball: {
            label: 'Fireball',
            articleId: '3a11f3e5-bdfc-3970-bbdb-ea58f6d303e7',
            anchor: 'fireball' // Anchors are optional. They allow the journal entry to scroll to the right paragraph
        },
        bless: {
            label: 'Bless',
            articleId: '3a11f3e5-bdfc-3870-bbdb-ea58f6d303e7'
        }
    }
});
~~~

### Using anchors

Inside World Anvil, use anchor inside your article.

With previous example, the fireball paragraph shoud be written like this in WA:
~~~
[h2|fireball]The paragraph I want to link[/h2]
~~~

I personally use this to directly link rules chapters inside my character and item sheets :

![Preview](/README_character_sheet_link.png?raw=true)



### Storing shortcuts without labels substitutions

If you don't want your labels on every links, you can use multiple css classes and bind different behaviors :

~~~js
/** @override */
activateListeners(html) {
    super.activateListeners(html);

    const waHelpers = game.modules.get("world-anvil").helpers.;
    waHelpers.substituteShortcutsAndHandleClicks(html, {classes: ['.wa-link']});
    waHelpers.substituteShortcutsAndHandleClicks(html, {classes: ['.wa-tooltip'], changeLabels: false});
    // [...]
}
~~~

This way, `wa-link` elements will have their labels replaced. And `wa-tooltip` elements won't.

### Shortcut childs

Sometimes, you will have a big article with multiple referenced paragraphs

You may not want to repeat label, articleId and anchor on each nodes of your shortcuts.

You can then store all the repeating data in a parent node.

~~~js
// Sortcut declaration
const shortcut = {
    spells : {
        fireball: {
            label: 'Fireball',
            articleId: '3a11f3e5-bdfc-3970-bbdb-ea58f6d303e7',
            components: {
                label: 'Needed components',
                anchor: 'spell_components'
            },
            upgrades: {
                selective_fireball: {
                    anchor: 'selective'
                },
                larger_one: {
                    anchor: 'larger'
                }
            }
        }
    }
};
~~~

By doing so, you can use those links :

~~~html
<span class="wa-link" data-shortcut="spells.fireball"> </span>
<span class="wa-link" data-shortcut="spells.fireball" data-child="components"> </span>
<span class="wa-link" data-shortcut="spells.fireball" data-child="upgrades.selective_fireball"> </span>
<span class="wa-link" data-shortcut="spells.fireball" data-child="upgrades.larger_one"> </span>
~~~

They will all link to the article `3a11f3e5-bdfc-3970-bbdb-ea58f6d303e7`, but some will scroll to a specific paragraph (`spell_components`, `selective`, `larger`), while some others will have a different label (`Needed components`)

### Using this with internationalization

I personnaly use shortcuts to link to differents articles depending on the currrent language.

The trick is to register different shortcuts during initialization phase :

~~~js
// Simplified version
export const initShortcuts = () => {
    const module = game.modules.get("world-anvil");
    
    let fireballShortcut;
    if( game.i18n.lang == 'fr' ) {
        fireballShortcut = { 
            spells : {
                fireball: {
                    label: 'Boule de feu',
                    articleId: '4b22f3e5-bdfc-3970-bbdb-ea58f6d303e7'
                }
        };
    } else {
        fireballShortcut = { 
            spells : {
                fireball: {
                    label: 'Fireball',
                    articleId: '3a11f3e5-bdfc-3970-bbdb-ea58f6d303e7',
                    anchor: 'fireball'
                }
        };
    }

    module.helpers.registerShortcuts(fireballShortcut);
}
~~~

This way, when i use the shortcut link, French browser will link to the french article. (This one seems to have no anchor).

Other browsers will link to the english version of the article.

I found it usefull for linking custom game rules.



-----

## Software License and Contribution Policy

This software is licensed under the MIT License. See the LICENSE.txt file in this repository for details.

If you would like to contribute to making this software better, merge requests are welcomed. In your merge request, please include a clear description of the change you are making and be prepared to engage with me for 1-2 rounds of code review.

### Contributors

Thanks to the following individuals for their contributions to this module.

* Dimitris from World Anvil
* Megastrukur
