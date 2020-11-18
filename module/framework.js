/**
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {JournalEntry|null} entry     An existing Journal Entry to sync
 * @param {boolean} showNotification    Toggles showing articles update notification
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, {entry=null, renderSheet=false}={}, showNotification=true) {
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
    if(showNotification) {
      ui.notifications.info(`Refreshed World Anvil article ${article.title}`);
    }
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

  if(showNotification) {
    ui.notifications.info(`Imported World Anvil article ${article.title}`);
  }
  return entry;
}


/* -------------------------------------------- */


/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {{img: string, html: string}}
 * @private
 */
function _getArticleContent(article) {
  let body = "";
  let aside = "";

  // Article sections
  if ( article.sections ) {
    for ( let [id, section] of Object.entries(article.sections) ) {
      let title = section.title || id.titleCase();
      if ( title === "Sidebarcontent" ) title = "General Details";

      // Determine whether the section is body vs. aside (if short)
      if ( section.content.length > 100 ) {
        body += `<h2>${title}</h2>\n<p>${section.content_parsed}</p><hr/>`;
      } else {
        aside += `<dt>${title}</dt><dd>${section.content_parsed}</dd>`
      }
    }
  }

  // Article relations
  if ( article.relations ) {
    for ( let [id, section] of Object.entries(article.relations) ) {
      const title = section.title || id.titleCase();
      const items = section.items instanceof Array ? section.items: [section.items];  // Items can be one or many
      const relations = items.map(i => `<span data-article-id="${i.id}" data-template="${i.type}">${i.title}</span>`);
      aside += `<dt>${title}:</dt><dd>${relations.join(", ")}</dd>`
    }
  }

  // Combine content sections
  let content = `<h1>${article.title}</h1>\n`;
  content += `<p><a href="${article.url}" title="${article.title} ${game.i18n.localize("WA.OnWA")}" target="_blank">${article.url}</a></p>\n<p>${article.content_parsed}</p><hr/>`;
  if ( aside ) content += `<aside><dl>${aside}</dl></aside>`;
  if ( body ) content += body;

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
