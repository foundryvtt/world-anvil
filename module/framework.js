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
 * @param {string} worldCSSLink
 * @param {string} articleCSSLink
 * @return {{img: string, html: string}}
 * @private
 */
async function _getArticleContent(article, worldCSSLink, articleCSSLink) {

  // The DIV element that will house the formatted article
  const div = document.createElement("div");

  // Gather the various parts
  let columns = determineColumns(article);
  let sections = getArticleSections(article);
  let relations = getRelations(article, sections.aside);

  // Assemble the article parts, in order
  // Left-Side Body
  let content = `<div class="article-container page"><h1>${article.title}</h1>\n`;
  content += `<p><a href="${article.url}" title="${article.title} ${game.i18n.localize("WA.OnWA")}" target="_blank">${article.url}</a></p>\n<div class="body-container"><div class="${columns.leftColumn}"><span class="line-spacer d-block">&nbsp;</span>${article.content_parsed}`;
  if ( sections.body ) content += sections.body;

  // Body footnotes
  if (sections.footnotes) content += sections.footnotes;
  content += "</div><hr/>";

  // Sidebar
  let sidePanel = sections.sidePanel;
  let relationships = relations.relationships;
  if ( sidePanel.contains  || relationships ) {
    content += `<div class="${columns.rightColumn}">`;
    if ( sidePanel.sidebarTop ) content += sidePanel.sidebarTop;
    if ( sidePanel.sidebar ) content += sidePanel.sidebar;
    if ( relationships || sidePanel.panelTop || sidePanel.panel || sidePanel.panelBottom ) {
      content += `<div class="panel panel-default"><div class="panel-body">`;
      if ( sidePanel.panelTop ) content += sidePanel.panelTop;
      if ( relationships ) content += relationships;
      if ( sidePanel.panel ) content += sidePanel.panel;
      if ( sidePanel.panelBottom ) content += sidePanel.panelBottom;
      content += `</div></div>`;
    }
    if ( sidePanel.sidebarBottom ) content += sidePanel.sidebarBottom;
    content += `</div>`;
  }

  // Main Left and Right sections complete. After this is full width lower page
  content += `</div>`;

  // Bottom Nav
  let bottomNav = relations.bottomNav;
  if (bottomNav.hasNav) {
    content += `<div class="horiz-container"><div class="col-md-4 text-left">${bottomNav.left}</div><div class="col-md-4 text-center">${bottomNav.center}</div><div class="col-md-4 text-right">${bottomNav.right}</div></div>`;
    content += `</div>`;
  }

  // Full width footnotes
  if (sections.fullfooter) {
    content += sections.fullfooter;
  }

  // Disable image source attributes so that they do not begin loading immediately
  div.innerHTML = content.replace(/src=/g, "data-src=");

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
 * @returns {{leftColumn: string, rightColumn: string}}
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
  return {
    leftColumn: leftColumnClass,
    rightColumn: rightColumnClass
  };
}

/**
 * Extracts the various parts from the Section portion of the article.
 * @param article
 * @returns {{aside: string, sidePanel: {sidebarBottom: string, hasPanel: boolean, sidebar: string, panelTop: string, sidebarTop: string, panel: string, panelBottom: string}, body: string}}
 */
function getArticleSections(article) {
  let aside = "";
  let body = "";
  let footnotes = "";
  let fullfooter = "";
  let sidePanel = {
    hasPanel: false,
    panelTop: "",
    panel: "",
    panelBottom: "",
    sidebarTop: "",
    sidebar: "",
    sidebarBottom: ""
  }

  if ( article.sections ) {
    for (let [id, section] of Object.entries(article.sections)) {
      let title = section.title || id.titleCase();
      switch (title.toLowerCase()) {
        case 'sidepanelcontenttop':
          sidePanel.panelTop += `<div class="sidebar-panel-content">${section.content_parsed}</div><hr/>`;
          sidePanel.hasPanel = true;
          break;
        case 'sidepanelcontent':
          sidePanel.panel += `<div class="sidebar-panel-content">${section.content_parsed}</div><hr/>`;
          sidePanel.hasPanel = true;
          break;
        case 'sidepanelcontentbottom':
          sidePanel.panelBottom += `<div class="sidebar-panel-content">${section.content_parsed}</div><hr/>`;
          sidePanel.hasPanel = true;
          break;
        case 'sidebarcontenttop':
          sidePanel.sidebarTop += `<div class="sidebar-content">${section.content_parsed}</div><hr/>`;
          sidePanel.hasPanel = true;
          break;
        case 'sidebarcontent':
          sidePanel.sidebar += `<div class="sidebar-content">${section.content_parsed}</div><hr/>`;
          sidePanel.hasPanel = true;
          break;
        case 'sidebarcontentbottom':
          sidePanel.sidebarBottom += `<div class="sidebar-content">${section.content_parsed}</div><hr/>`;
          sidePanel.hasPanel = true;
          break;
        case 'footnotes':
          footnotes = `<p>${section.content_parsed}</p>`;
          break;
        case 'fullfooter':
          fullfooter = `<p>${section.content_parsed}</p>`;
          break;
        default:
          if ( section.content.length > 100 ) {
            body += `<h2>${title}</h2>\n<p>${section.content_parsed}</p><hr/>`;
          } else {
            aside += `<dt>${title}</dt><dd>${section.content_parsed}</dd>`
          }
      }
    }
  }
  return {
    body: body,
    sidePanel: sidePanel,
    aside: aside,
    footnotes: footnotes,
    fullfooter: fullfooter
  };
}

/**
 * Construct the side panel relationship section. This section will also contain any small
 * asides from World Anvil.
 * @param article     The article
 * @param aside       The formatted aside section
 * @returns [string, object]  The relation section, The bottom Navigation section
 */
function getRelations(article, aside) {
  let bottomNav = {
    left: "",
    right: "",
    center: "",
    hasNav: false
  }
  let rel = "";
  if ( article.relations ) {
    rel += `<dl>`;
    if ( aside ) {
      rel += aside;
    }
    for (let [id, section] of Object.entries(article.relations)) {
      const title = section.title || id.titleCase();
      switch (id.toLowerCase()) {
        case "articlenext":
          bottomNav.hasNav = true;
          bottomNav.right = `<span data-article-id="${section.items.id}" data-template="${section.items.type}">${section.items.title} <i class="fas fa-arrow-right"></i></span> `;
          break;
        case "articleprevious":
          bottomNav.hasNav = true;
          bottomNav.left = `<span data-article-id="${section.items.id}" data-template="${section.items.type}"><i class="fas fa-arrow-left"> ${section.items.title}</i></span> `;
          break;
        default:
          const items = section.items instanceof Array ? section.items : [section.items];  // Items can be one or many
          const relationList = items.filter(i => i.type !== 'customarticletemplate' && i.type !== 'image')
              .map(i => `<li><span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span></li>`);

          if ( relationList.length > 0 ) {
            rel += `<dt>${title}:</dt><dd><ul class="list-unstyled">${relationList.join()}</ul></dd>`;
          }
      }
    }
    rel += `</dl>`;

    if (bottomNav.hasNav) {
      bottomNav.center = `<span>${article.category.title}</span>`;
    }
    return {
      relationships: rel,
      bottomNav: bottomNav
    };
  } else return {
    relationships: "",
    bottomNav: bottomNav
  };
}