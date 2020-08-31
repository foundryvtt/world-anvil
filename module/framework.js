/**
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {JournalEntry|null} entry     An existing Journal Entry to sync
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, {entry=null, renderSheet=false}={}) {
  const anvil = game.modules.get("world-anvil").anvil;
  const article = await anvil.getArticle(articleId);
  const worldCSSLink = anvil.enableWorldCSS ? await anvil.getCSSLink(anvil.world.display_css, anvil.world.name, "world") : "";
  const articleCSSLink = anvil.enableArticleCSS ? await anvil.getCSSLink(article.css_styles, article.title, "article") : "";
  const categoryId = article.category ? article.category.id : "0";
  const folder = game.folders.find(f => f.getFlag("world-anvil", "categoryId") === categoryId);
  const content = await _getArticleContent(article, worldCSSLink, articleCSSLink);

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
    "flags.world-anvil.articleId": article.id
  }, {renderSheet});
  ui.notifications.info(`Imported World Anvil article ${article.title}`);
  return entry;
}


/* -------------------------------------------- */


/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {{img: string, html: string}}
 * @private
 */
async function _getArticleContent(article, worldCSSLink, articleCSSLink) {
  let body = "";
  let sidePanel = {
    panelTop: "",
    panelBottom: "",
    sidebarTop: "",
    sidebarBottom: ""
  }

  /**
   * From the article, gather the information into various types:
   *    - The body of the article
   *    - The side panel content (a top section and a bottom section)
   *    - The side bar content (a top section and a bottom section)
   *    - The article relationships (how this article relates to others)
   *
   * This is the default World Anvil article layout:
   *    Left side of screen is the body
   *    Right side of the screen is:
   *      Side Bar Top
   *      Panel Top
   *      Relationships
   *      Panel Bottom
   *      Side Bar Bottom
   *
   *  Once the various sections are gathered, they are assembled into the
   *  final Foundry Journal output.
   */
  // Article sections
  if ( article.sections ) {
    for (let [id, section] of Object.entries(article.sections)) {
      let title = section.title || id.titleCase();
      switch (title.toLowerCase()) {
        case 'sidepanelcontent':
          sidePanel.panelTop += `<div class="sidebar-panel-content">${section.content_parsed}</div><hr/>`;
          break;
        case 'sidepanelcontentbottom':
          sidePanel.panelBottom += `<div class="sidebar-bottom-panel">${section.content_parsed}</div><hr/>`;
          break;
        case 'sidebarcontent':
          sidePanel.sidebarTop += `<div class="sidebar-content">${section.content_parsed}</div><hr/>`;
          break;
        case 'sidebarcontentbottom':
          sidePanel.sidebarBottom += `<div class="sidebar-bottom">${section.content_parsed}</div><hr/>`;
          break;
        default:
          body += `<h2>${title}</h2>\n<p>${section.content_parsed}</p><hr/>`;
      }
    }
  }

  let relationships = getRelations(article.relations);

  const div = document.createElement("div");
  div.innerHTML = assembleContent(article, body, sidePanel, relationships);

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

  // Add any requested World Anvil CSS
  let html = worldCSSLink + articleCSSLink + div.innerHTML;

  // Regex formatting
  html = html.replace(/%p%/g, "</p>\n<p>");

  // Return content and image
  return {
    html: html,
    img: image
  }
}

/**
 * Determine the appropriate column widths based on the "article-content-left" class in the
 * fully rendered content
 * @param article
 * @returns {unknown[]}
 */
function determineColumns(article) {

  const leftSideSearch = document.createElement("div");
  leftSideSearch.innerHTML = article.full_render.replace(/src=/g, "data-src=");
  let leftColumn = leftSideSearch.querySelector(".article-content-left");
  leftSideSearch.remove();
  let leftColumnClass = leftColumn.className
      .split(' ')
      .filter(c => c.startsWith("col-md"))
      [0];
  let rightColumnClass = "col-md-" + (12 - leftColumnClass.substring(leftColumnClass.lastIndexOf("-")+1));
  return [leftColumnClass, rightColumnClass];
}

/**
 * Construct the side panel relationship section
 * @param relations   The relations object of the article
 * @returns {string}  The relation section
 */
function getRelations(relations) {
  let rel = "";
  if ( relations ) {
    rel += `<dl>`;
    for (let [id, section] of Object.entries(relations)) {
      const title = section.title || id.titleCase();
      const items = section.items instanceof Array ? section.items : [section.items];  // Items can be one or many
      const relationList = items.filter(i => i.type !== 'customarticletemplate' && i.type !== 'image')
          .map(i => `<li><span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span></li>`);

      if ( relationList.length > 0 ) {
        rel += `<dt>${title}:</dt><dd><ul class="list-unstyled">${relationList.join()}</ul></dd>`;
      }
    }
    rel += `</dl>`;
    return rel;
  } else return "";
}

/**
 * Build the actual journal content from all the parts
 * @param article     The article object
 * @param body        The body of the article
 * @param sidePanel   The side panel content of the article
 * @param relationships The relations of this article to others
 * @returns {string}  The assembled content
 */
function assembleContent(article, body, sidePanel, relationships) {

  let [leftColumnClass, rightColumnClass] = determineColumns(article);

  let content = `<h1>${article.title}</h1>\n`;
  content += `<p><a href="${article.url}" title="${article.title} ${game.i18n.localize("WA.OnWA")}" target="_blank">${article.url}</a></p>\n<div class="article-container page"><div class="${leftColumnClass}">${article.content_parsed}`;
  if ( body ) content += `${body}</div><hr/>`;
  else content += "</div><hr/>";
  if ( sidePanel.sidebarTop || sidePanel.panelTop || aside || sidePanel.panelBottom || sidePanel.sidebarBottom ) {
    content += `<div class="${rightColumnClass}">`;
    if ( sidePanel.sidebarTop ) content += sidePanel.sidebarTop;
    if ( relationships || sidePanel.panelTop || sidePanel.panelBottom ) {
      content += `<div class="panel panel-default"><div class="panel-body">`;
      if ( sidePanel.panelTop ) content += sidePanel.panelTop;
      if ( relationships ) content += relationships;
      if ( sidePanel.panelBottom ) content += sidePanel.panelBottom;
      content += `</div></div>`;
    }
    if ( sidePanel.sidebarBottom ) content += sidePanel.sidebarBottom;
    content += `</div>`;
  }

  // Disable image source attributes so that they do not begin loading immediately
  return content.replace(/src=/g, "data-src=");
}