const DISPLAY_SIDEBAR_SECTION_ID = 'displaySidebar';

/**
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {JournalEntry|null} entry     An existing Journal Entry to sync
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, {entry=null, renderSheet=false}={}) {
  const anvil = game.modules.get("world-anvil").anvil;
  const article = await anvil.getArticle(articleId);
  const categoryId = article.category ? article.category.id : "0";
  const folder = game.folders.find(f => f.getFlag("world-anvil", "categoryId") === categoryId);
  const content = _getArticleContent(article);

  // Update an existing Journal Entry
  if ( entry ) {
    await entry.update({
      name: article.title,
      content: content.html,
      img: content.img
    });
    ui.notifications.info(`Refreshed World Anvil article ${article.title}`);
    return entry;
  }

  // Create a new Journal Entry
  entry = await JournalEntry.create({
    name: article.title,
    content: content.html,
    img: content.img,
    folder: folder ? folder.id : null,
    "flags.world-anvil": { articleId: article.id, articleURL: article.url }
  }, {renderSheet});
  ui.notifications.info(`Imported World Anvil article ${article.title}`);
  return entry;
}


/* -------------------------------------------- */

/**
 * Loop through articles section and look for the one named displaysidebar.
 * Ifit's content is 1 => sidebar are displayed 
 * @param {entries} sectionsEntries  article sections
 * @returns TRUE if sidebars should be displayed
 */
function _findIfSidebarsAreDisplayed( sectionsEntries ) {
  return sectionsEntries.filter( ([id, section]) => {
    return id == DISPLAY_SIDEBAR_SECTION_ID;
  }).map( ([id, section]) => {
    return section.content_parsed;
  }).reduce( (result, current) => {
    return result || (current == '1');
  }, false);
}

/**
 * For some sectionId, the title will be retrieved from the module translations
 * @param {string} sectionId The id as retrieved via Object.entries
 * @param {string} section The section content
 * @returns The actual title
 */
function _localizedTitle( sectionId, section ) {
  const localizedIds = ['sidebarcontent', 'sidepanelcontenttop', 'sidepanelcontent', 'sidebarcontentbottom'];
  if( localizedIds.includes( sectionId ) ) {
    return game.i18n.localize("WA.HeaderGeneralDetails");
  }
  return section.title || sectionId.titleCase();
}

/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {{img: string, html: string}}
 * @private
 */
function _getArticleContent(article) {

  // Article sections
  let sections = "";
  if ( article.sections ) {

    const sectionsEntries = Object.entries(article.sections) ;
    const includeSidebars = _findIfSidebarsAreDisplayed(sectionsEntries);

    sectionsEntries.filter( ([id, section]) => {
      // displaysidebar section is only useful for knowing if sidebars should be displayed
      if( id == DISPLAY_SIDEBAR_SECTION_ID ) { return false; }

      // Check if sidebars need to be imported
      const isSidebar = id.includes('sidebar') || id.includes('sidepanel');
      return includeSidebars || !isSidebar;

    } ).forEach( ([id, section]) => {
      // Title can be replaced by a localized name if the section id has been handled
      const title = _localizedTitle(id, section);

      // Determine whether the section is body vs. aside (if short)
      const isLongContent = (section.content.length > 100); 
      if( isLongContent ) { // Another prior condition will come here later. That's why a rewrote it
        sections += `<h2>${title}</h2>`;
        sections += `\n<p>${section.content_parsed}</p><hr/>`;

      } else {
        sections += `<dl><dt>${title}</dt>`;
        sections += `<dd>${section.content_parsed}</dd></dl>`;
      }
    });
  }

  // Article relations
  let aside = "";
  if ( article.relations ) {
    for ( let [id, section] of Object.entries(article.relations) ) {
      
      if( !section.items ) { continue; } // Some relations, like timelines, have no .items attribute. => Skipped
      
      const title = section.title || id.titleCase();
      const items = section.items instanceof Array ? section.items: [section.items];  // Items can be one or many
      const relations = items.map(i => `<span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span>`);
      aside += `<dt>${title}:</dt><dd>${relations.join(", ")}</dd>`
    }
  }

  // Combine content sections
  let content = `<p>${article.content_parsed}</p><hr/>`;
  if ( aside ) content += `<aside><dl>${aside}</dl></aside>`;
  if ( sections ) content += sections;

  // Disable image source attributes so that they do not begin loading immediately
  content = content.replace(/src=/g, "data-src=");

  // HTML formatting
  const div = document.createElement("div");
  div.innerHTML = content;

  // Paragraph Breaks
  const t = document.createTextNode("%p%");
  div.querySelectorAll("span.line-spacer").forEach(s => s.parentElement.replaceChild(t.cloneNode(), s));

  // Portrait Image as Featured or Cover image if no Portrait
  let image = null;
  if ( article.portrait ) {
    image = article.portrait.url.replace("http://", "https://");
  } else if ( article.cover ) {
    image = article.cover.url.replace("http://", "https://");
  }

  // Image from body
  div.querySelectorAll("img").forEach(i => {
    let img = new Image();
    img.src = `https://worldanvil.com${i.dataset.src}`;
    delete i.dataset.src;
    img.alt = i.alt;
    img.title = i.title;
    i.parentElement.replaceChild(img, i);
    image = image || img.src;
  });

  // World Anvil Content Links
  div.querySelectorAll('span[data-article-id]').forEach(el => {
    el.classList.add("entity-link", "wa-link");
  });
  div.querySelectorAll('a[data-article-id]').forEach(el => {
    el.classList.add("entity-link", "wa-link");
    const span = document.createElement("span");
    span.classList = el.classList;
    Object.entries(el.dataset).forEach(e => span.dataset[e[0]] = e[1]);
    span.textContent = el.textContent;
    el.replaceWith(span);
  });

  // Regex formatting
  let html = div.innerHTML;
  html = html.replace(/%p%/g, "</p>\n<p>");

  // Return content and image
  return {
    html: html,
    img: image
  }
}
